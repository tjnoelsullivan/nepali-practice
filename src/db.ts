import Dexie, { type EntityTable } from 'dexie'
import type { Card } from 'ts-fsrs'
import type { Flag, Item, ReviewRecord, Sentence, StoredCard } from './core/types'

export type SentenceStat = { sentenceId: string; lastSeen: Date; seen: number; correct: number }
export type Meta = { key: string; value: unknown }

export class SaathiDB extends Dexie {
  items!: EntityTable<Item, 'id'>
  sentences!: EntityTable<Sentence, 'id'>
  cards!: EntityTable<StoredCard, 'itemId'>
  reviews!: EntityTable<ReviewRecord, 'id'>
  flags!: EntityTable<Flag & { id?: number }, 'id'>
  sentenceStats!: EntityTable<SentenceStat, 'sentenceId'>
  meta!: EntityTable<Meta, 'key'>

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
