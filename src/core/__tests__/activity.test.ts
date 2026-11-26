import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { ActiveClock, bestStreak, currentStreak, dayKey, weekKeys, type DayRecord } from '../activity'
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

  it('stops a minute after the last action, even with the app open', () => {
    const c = new ActiveClock()
    c.studying = true
    c.activity(0)
    expect(run(c, 0, 10 * 60_000)).toBe(60_000)
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
    expect(run(c, 5 * 60_000 + 1000, 5 * 60_000 + 30_000)).toBe(30_000)
  })
})

const day = (date: string, answers = 1): [string, DayRecord] => [date, { date, activeMs: 0, answers }]

describe('streaks', () => {
  const today = new Date(2026, 10, 26, 9)
  it('counts consecutive days ending today', () => {
    const days = new Map([day('2026-11-24'), day('2026-11-25'), day('2026-11-26')])
    expect(currentStreak(days, today)).toBe(3)
  })
  it('keeps yesterday’s streak until today is over', () => {
    const days = new Map([day('2026-11-24'), day('2026-11-25')])
    expect(currentStreak(days, today)).toBe(2)
  })
  it('breaks after a missed day', () => {
    const days = new Map([day('2026-11-22'), day('2026-11-23'), day('2026-11-26')])
    expect(currentStreak(days, today)).toBe(1)
    expect(bestStreak(days)).toBe(2)
  })
  it('a day with only a few idle seconds does not count', () => {
    const days = new Map([['2026-11-26', { date: '2026-11-26', activeMs: 20_000, answers: 0 }]])
    expect(currentStreak(days, today)).toBe(0)
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
    expect(currentStreak(new Map((await d.days.toArray()).map((r) => [r.date, r])), new Date(2026, 10, 26, 9))).toBe(2)
  })
})
