import Dexie, { type EntityTable } from 'dexie'
import type { Card } from 'ts-fsrs'
import { dayKey, type DayRecord } from './core/activity'
import type { Flag, Item, ReviewRecord, Sentence, StoredCard } from './core/types'

export type SentenceStat = {
  sentenceId: string
  lastSeen: Date
  seen: number
  correct: number
  /** Correct Nepali -> English answers; after 2 the Nepali text starts hidden (listen first). */
  npEnCorrect?: number
}
export type Meta = { key: string; value: unknown }
export type Recording = {
  id: string
  sentenceId: string
  /**
   * The audio bytes. Stored as an ArrayBuffer because iOS Safari often refuses to store Blobs
   * in IndexedDB ("Error preparing Blob/File data to be stored in object store").
   */
  data: ArrayBuffer
  mime: string
  durationMs: number
  createdAt: Date
}
export type Lesson = {
  id: string
  title: string
  fileName: string
  importedAt: Date
  sentenceIds: string[]
  /** Things Claude was unsure about, for TJ to ask the tutor. */
  questions: string[]
}

export class SaathiDB extends Dexie {
  items!: EntityTable<Item, 'id'>
  sentences!: EntityTable<Sentence, 'id'>
  cards!: EntityTable<StoredCard, 'itemId'>
  reviews!: EntityTable<ReviewRecord, 'id'>
  flags!: EntityTable<Flag & { id?: number }, 'id'>
  sentenceStats!: EntityTable<SentenceStat, 'sentenceId'>
  meta!: EntityTable<Meta, 'key'>
  days!: EntityTable<DayRecord, 'date'>
  lessons!: EntityTable<Lesson, 'id'>
  recordings!: EntityTable<Recording, 'id'>

  constructor(name = 'saathi') {
    super(name)
    this.version(1).stores({
      items: 'id, kind, source',
      sentences: 'id, source, *tags',
      cards: 'itemId',
      reviews: '++id, itemId, sentenceId, at',
      flags: '++id, sentenceId, at',
      sentenceStats: 'sentenceId',
      meta: 'key',
    })
    // Stage 3: per-day active time and answers, for streaks. Earlier answers are backfilled.
    this.version(2)
      .stores({ days: 'date' })
      .upgrade(async (tx) => {
        const counts = new Map<string, number>()
        await tx
          .table('reviews')
          .each((r: ReviewRecord) => counts.set(dayKey(new Date(r.at)), (counts.get(dayKey(new Date(r.at))) ?? 0) + 1))
        await tx.table('days').bulkPut([...counts].map(([date, answers]) => ({ date, activeMs: 0, answers })))
      })
    // Stage 4: imported tutor lessons.
    this.version(3).stores({ lessons: 'id, importedAt' })
    // Stage 5: recordings in Chunu's voice.
    this.version(4).stores({ recordings: 'id, sentenceId, createdAt' })
  }
}

export const db = new SaathiDB()

/**
 * Add or update content without touching learning history.
 * Used for the built-in starter set now and for tutor imports later, so new material
 * never resets what you've already learned.
 */
export async function upsertContent(
  d: SaathiDB,
  items: Item[],
  sentences: Sentence[],
  opts: { replaceSources?: Sentence['source'][] } = {},
) {
  await d.transaction('rw', d.items, d.sentences, async () => {
    await d.items.bulkPut(items)
    await d.sentences.bulkPut(sentences)
    // Built-in content that was removed or renamed upstream is dropped; learning history (cards) stays.
    if (opts.replaceSources?.length) {
      const keep = new Set(sentences.map((s) => s.id))
      const stale = await d.sentences
        .where('source')
        .anyOf(opts.replaceSources)
        .filter((s) => !keep.has(s.id))
        .primaryKeys()
      await d.sentences.bulkDelete(stale)
    }
  })
}

export async function loadCards(d: SaathiDB): Promise<Map<string, Card>> {
  const all = await d.cards.toArray()
  return new Map(all.map((c) => [c.itemId, c.card]))
}

/** Add active time and/or answers to a day. */
export async function addToDay(
  d: SaathiDB,
  date: string,
  add: { activeMs?: number; answers?: number; listenMs?: number },
  goalMs?: number,
) {
  await d.transaction('rw', d.days, async () => {
    const cur = (await d.days.get(date)) ?? { date, activeMs: 0, answers: 0 }
    await d.days.put({
      date,
      activeMs: cur.activeMs + (add.activeMs ?? 0),
      answers: cur.answers + (add.answers ?? 0),
      listenMs: (cur.listenMs ?? 0) + (add.listenMs ?? 0) || undefined,
      goalMs: goalMs ?? cur.goalMs,
    })
  })
}

export async function addLesson(d: SaathiDB, lesson: Lesson) {
  await d.lessons.put(lesson)
}

const recordingBlobs = new Map<string, Blob>()
/** The recording as a Blob for playback; the same Blob each time, so its object URL is reused. */
export function recordingBlob(r: Recording): Blob {
  let b = recordingBlobs.get(r.id)
  if (!b) {
    // Recordings saved before the ArrayBuffer change (where Safari allowed it) kept a Blob.
    const legacy = (r as Recording & { blob?: Blob }).blob
    b = legacy ?? new Blob([r.data], { type: r.mime })
    recordingBlobs.set(r.id, b)
  }
  return b
}
