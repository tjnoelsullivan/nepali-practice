import { describe, expect, it } from 'vitest'
import type { Card } from 'ts-fsrs'
import { lastStudyDay, measurePace, nextLessonDate, planUntilLesson, repsBefore, type Pace } from '../plan'
import { review, Rating } from '../schedule'
import type { Sentence } from '../types'

const sentence = (id: string, items: string[]): Sentence => ({
  id,
  en: id,
  chunks: items.map((i) => ({ np: i, en: i, items: [i] })),
  tags: [],
  source: 'seed',
  verified: true,
})
const pace: Pace = { secPerAnswer: 30, itemsPerAnswer: 3, measured: false }
// Thursday 26 Nov 2026, 9 AM local.
const thu = new Date(2026, 10, 26, 9)

describe('next lesson', () => {
  it('finds the next Tuesday or Friday after today', () => {
    expect(nextLessonDate(thu, [2, 5])!.getDate()).toBe(27) // Friday
    expect(nextLessonDate(new Date(2026, 10, 27, 9), [2, 5])!.getDate()).toBe(1) // Fri -> Tue 1 Dec
    expect(nextLessonDate(thu, [])).toBeNull()
  })

  it('names the last study day', () => {
    const p = planUntilLesson([sentence('a', ['x'])], new Map(), thu, [2, 5], pace)!
    expect(p.daysLeft).toBe(1)
    expect(lastStudyDay(p, thu)).toBe('today')
    const sat = new Date(2026, 10, 28, 9)
    const p2 = planUntilLesson([sentence('a', ['x'])], new Map(), sat, [2, 5], pace)!
    expect(p2.daysLeft).toBe(3)
    expect(lastStudyDay(p2, sat)).toBe('Monday')
  })
})

describe('reps before the lesson', () => {
  it('counts learning steps for a new word', () => {
    expect(repsBefore(undefined, thu, new Date(2026, 10, 27))).toBeGreaterThanOrEqual(2)
  })

  it('skips a well-known word due long after the lesson', () => {
    let c: Card | undefined
    let t = new Date(2026, 9, 1)
    for (let i = 0; i < 6; i++) {
      c = review(c, Rating.Good, t)
      t = new Date(c.due)
    }
    expect(new Date(c!.due).getTime()).toBeGreaterThan(new Date(2026, 11, 1).getTime())
    expect(repsBefore(c, thu, new Date(2026, 10, 27))).toBe(0)
  })
})

describe('plan', () => {
  it('splits new words and due reviews into minutes per day', () => {
    const cards = new Map<string, Card>()
    // "k" was learned a day ago, so it's due again soon.
    cards.set('k', review(undefined, Rating.Good, new Date(2026, 10, 25, 9)))
    const sentences = [sentence('a', ['x', 'y', 'k']), sentence('b', ['z'])]
    const sat = new Date(2026, 10, 28, 9)
    const p = planUntilLesson(sentences, cards, sat, [2, 5], pace)!
    expect(p.newItems).toBe(3)
    expect(p.dueItems).toBe(1)
    expect(p.answers).toBeGreaterThan(0)
    expect(p.minutesPerDay).toBe(Math.ceil(p.totalMinutes / 3))
  })

  it('keeps the daily figure steady as today is worked through', () => {
    const p = planUntilLesson([sentence('a', ['x'])], new Map(), thu, [2, 5], pace, 10)!
    expect(p.minutesPerDay).toBe(Math.ceil(p.totalMinutes + 10))
  })
})

describe('pace', () => {
  it('uses defaults until there is history', () => {
    expect(measurePace([], [])).toEqual({ secPerAnswer: 30, itemsPerAnswer: 3, measured: false })
  })

  it('measures seconds and items per answer', () => {
    const days = [
      { date: '2026-11-24', activeMs: 400_000, answers: 20 },
      { date: '2026-11-25', activeMs: 0, answers: 30 }, // before active time was tracked
    ]
    const times = Array.from({ length: 10 }, (_, i) => [i, i, i, i]).flat()
    const p = measurePace(days, times)
    expect(p.secPerAnswer).toBe(20)
    expect(p.itemsPerAnswer).toBe(4)
    expect(p.measured).toBe(true)
  })
})
