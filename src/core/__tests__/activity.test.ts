import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { ActiveClock, bestStreak, currentStreak, dayKey, dayPracticed, weekKeys, type DayRecord } from '../activity'
import { SaathiDB } from '../../db'
import { recordAttempt } from '../record'
import type { Sentence } from '../types'

const run = (c: ActiveClock, from: number, to: number) => {
  let total = 0
  for (let t = from; t <= to; t += 1000) total += c.tick(t)
  return total
}

describe('active time', () => {
  it('counts only while studying', () => {
    const c = new ActiveClock()
    c.activity(0)
    expect(run(c, 0, 10_000)).toBe(0)
    c.studying = true
    c.activity(10_000)
    expect(run(c, 10_000, 20_000)).toBe(10_000)
  })

  it('stops 30 seconds after the last action, even with the app open', () => {
    const c = new ActiveClock()
    c.studying = true
    c.activity(0)
    expect(run(c, 0, 10 * 60_000)).toBe(30_000)
  })

  it('does not count time while the app was suspended', () => {
    const c = new ActiveClock()
    c.studying = true
    c.activity(0)
    c.tick(0)
    c.tick(1000)
    c.activity(1000)
    // phone locked for 30 minutes; first tick after resume
    expect(c.tick(1000 + 30 * 60_000)).toBe(0)
  })

  it('resumes when the learner acts again', () => {
    const c = new ActiveClock()
    c.studying = true
    c.activity(0)
    run(c, 0, 5 * 60_000)
    c.activity(5 * 60_000)
    expect(run(c, 5 * 60_000 + 1000, 5 * 60_000 + 20_000)).toBe(20_000)
  })
})

const GOAL = 15 * 60_000
const day = (date: string, mins = 20, goalMs?: number): [string, DayRecord] => [date, { date, activeMs: mins * 60_000, answers: 5, goalMs }]

describe('streaks', () => {
  const today = new Date(2026, 10, 26, 9)
  it('counts consecutive days ending today', () => {
    const days = new Map([day('2026-11-24'), day('2026-11-25'), day('2026-11-26')])
    expect(currentStreak(days, today, GOAL)).toBe(3)
  })
  it('keeps yesterday’s streak until today is over', () => {
    const days = new Map([day('2026-11-24'), day('2026-11-25')])
    expect(currentStreak(days, today, GOAL)).toBe(2)
  })
  it('breaks after a missed day', () => {
    const days = new Map([day('2026-11-22'), day('2026-11-23'), day('2026-11-26')])
    expect(currentStreak(days, today, GOAL)).toBe(1)
    expect(bestStreak(days, GOAL)).toBe(2)
  })
  it('a day below the goal breaks the streak, even with answers', () => {
    const days = new Map([day('2026-11-24'), day('2026-11-25', 10), day('2026-11-26')])
    expect(currentStreak(days, today, GOAL)).toBe(1)
    expect(dayPracticed(days.get('2026-11-25'))).toBe(true)
  })
  it('past days keep the goal they had; today uses the current goal', () => {
    const days = new Map([day('2026-11-25', 10, 10 * 60_000), day('2026-11-26', 12)])
    expect(currentStreak(days, today, GOAL)).toBe(1) // today 12 < 15 doesn't count yet; yesterday met its 10-min goal
    expect(currentStreak(days, today, 12 * 60_000)).toBe(2)
  })
  it('weeks start on Monday', () => {
    expect(weekKeys(today)[0]).toBe('2026-11-23')
    expect(weekKeys(today, 1)[6]).toBe('2026-11-22')
  })
})

describe('answers are logged per day', () => {
  it('recordAttempt bumps today', async () => {
    const d = new SaathiDB('t-days')
    const s: Sentence = { id: 's', en: 'x', chunks: [{ np: 'a', en: 'a', items: ['w:a'] }], tags: [], source: 'seed', verified: true }
    const now = new Date()
    await recordAttempt(d, { sentence: s, direction: 'en-np', hinted: new Set(), correct: true }, now)
    await recordAttempt(d, { sentence: s, direction: 'en-np', hinted: new Set(), correct: false }, now)
    expect((await d.days.get(dayKey(now)))?.answers).toBe(2)
  })
})

describe('upgrade from Stage 2 data', () => {
  it('backfills practiced days from earlier answers and keeps cards', async () => {
    const { default: Dexie } = await import('dexie')
    const old = new Dexie('t-upgrade')
    old.version(1).stores({
      items: 'id, kind, source',
      sentences: 'id, source, *tags',
      cards: 'itemId',
      reviews: '++id, itemId, sentenceId, at',
      flags: '++id, sentenceId, at',
      sentenceStats: 'sentenceId',
      meta: 'key',
    })
    await old.open()
    await old.table('cards').put({ itemId: 'w:a', card: { reps: 3 } })
    await old.table('reviews').bulkAdd([
      { itemId: 'w:a', sentenceId: 's', rating: 3, hinted: false, at: new Date(2026, 10, 25, 20) },
      { itemId: 'w:a', sentenceId: 's', rating: 3, hinted: false, at: new Date(2026, 10, 26, 8) },
    ])
    old.close()
    const d = new SaathiDB('t-upgrade')
    expect(await d.cards.count()).toBe(1)
    const days = await d.days.toArray()
    expect(days.map((r) => dayPracticed(r))).toEqual([true, true])
  })
})

describe('learner marks an accepted answer wrong', async () => {
  const { rateAttempt } = await import('../schedule')
  const { Rating } = await import('ts-fsrs')
  const s: Sentence = { id: 's', en: 'x', chunks: [{ np: 'a', en: 'a', items: ['w:a'] }, { np: 'b', en: 'b', items: ['w:b'] }], tags: [], source: 'seed', verified: true }
  it('every part gets Hard when no part was marked missing', () => {
    const r = rateAttempt({ sentence: s, direction: 'en-np', hinted: new Set(), chunkOk: [true, true], correct: false })
    expect([...r.values()]).toEqual([Rating.Hard, Rating.Hard])
  })
  it('counts correct Nepali -> English answers per sentence', async () => {
    const d = new SaathiDB('t-npen')
    for (const direction of ['np-en', 'np-en', 'en-np'] as const) await recordAttempt(d, { sentence: s, direction, hinted: new Set(), correct: true })
    expect((await d.sentenceStats.get('s'))?.npEnCorrect).toBe(2)
  })
})
