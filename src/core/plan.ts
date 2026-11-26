import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs'
import { addDays, dayKey, type DayRecord } from './activity'
import { isKnown } from './schedule'
import type { Sentence } from './types'

/** Lesson weekdays, 0 = Sunday. TJ's lessons are Tuesday and Friday. */
export const DEFAULT_LESSON_DAYS = [2, 5]
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Same settings as the real scheduler but without fuzz, so the estimate is stable. */
const planner = fsrs({ enable_fuzz: false, enable_short_term: true })

export const DEFAULT_SEC_PER_ANSWER = 30
export const DEFAULT_ITEMS_PER_ANSWER = 3

export type Pace = {
  /** Active seconds per answered sentence. */
  secPerAnswer: number
  /** Words and patterns graded per answered sentence. */
  itemsPerAnswer: number
  /** True when measured from TJ's own history rather than defaults. */
  measured: boolean
}

export type Plan = {
  /** Start of the next lesson day (local midnight). */
  lessonDate: Date
  lessonDayName: string
  /** Days to study, today included, before the lesson day. */
  daysLeft: number
  newItems: number
  /** Known words and patterns that come due before the lesson. */
  dueItems: number
  /** Expected answered sentences between now and the lesson. */
  answers: number
  /** Minutes of work left between now and the lesson. */
  totalMinutes: number
  minutesPerDay: number
}

/** The next lesson day strictly after today. Today's lesson (if any) has already happened or is happening. */
export function nextLessonDate(now: Date, lessonDays: number[]): Date | null {
  if (!lessonDays.length) return null
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  for (let i = 1; i <= 7; i++) {
    const d = addDays(start, i)
    if (lessonDays.includes(d.getDay())) return d
  }
  return null
}

/**
 * How many times a card will be reviewed before `end`, assuming each review is answered Good.
 * New cards start now. Learning steps that land on the same day still count, since those
 * come back within a session or the next one.
 */
export function repsBefore(card: Card | undefined, now: Date, end: Date): number {
  let c: Card = card ?? createEmptyCard(now)
  let t = card ? new Date(Math.max(now.getTime(), new Date(c.due).getTime())) : now
  let n = 0
  while (t < end && n < 20) {
    c = planner.next(c, t, Rating.Good).card
    n++
    t = new Date(c.due)
  }
  return n
}

/**
 * Pace from recent history. Seconds per answer comes from days with both active time and answers
 * (active time started counting in Stage 3). Items per answer comes from review logs, where every
 * item graded in one answer shares the same timestamp.
 */
export function measurePace(days: DayRecord[], reviewTimes: number[]): Pace {
  let ms = 0
  let answers = 0
  for (const d of days) {
    if (d.activeMs > 0 && d.answers > 0) {
      ms += d.activeMs
      answers += d.answers
    }
  }
  const attempts = new Set(reviewTimes).size
  const measured = answers >= 10
  const sec = measured ? ms / 1000 / answers : DEFAULT_SEC_PER_ANSWER
  const items = attempts >= 10 ? reviewTimes.length / attempts : DEFAULT_ITEMS_PER_ANSWER
  return {
    secPerAnswer: Math.min(120, Math.max(8, sec)),
    itemsPerAnswer: Math.max(1, items),
    measured,
  }
}

/**
 * Estimate the daily time needed before the next lesson to learn every new word and pattern
 * in the deck and keep up with everything already being reviewed.
 */
export function planUntilLesson(
  sentences: Sentence[],
  cards: Map<string, Card>,
  now: Date,
  lessonDays: number[],
  pace: Pace,
  /** Active minutes already done today, so the daily figure stays put as you work through it. */
  doneTodayMinutes = 0,
): Plan | null {
  const lessonDate = nextLessonDate(now, lessonDays)
  if (!lessonDate) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const daysLeft = Math.round((lessonDate.getTime() - today.getTime()) / 86_400_000)

  const inDeck = new Set(sentences.flatMap((s) => s.chunks.flatMap((c) => c.items)))
  let newItems = 0
  let dueItems = 0
  let reps = 0
  for (const id of inDeck) {
    const card = cards.get(id)
    const known = isKnown(card)
    const r = repsBefore(known ? card : undefined, now, lessonDate)
    if (!known) newItems++
    else if (r > 0) dueItems++
    reps += r
  }
  const answers = Math.ceil(reps / pace.itemsPerAnswer)
  const totalMinutes = (answers * pace.secPerAnswer) / 60
  return {
    lessonDate,
    lessonDayName: WEEKDAY_NAMES[lessonDate.getDay()],
    daysLeft,
    newItems,
    dueItems,
    answers,
    totalMinutes,
    minutesPerDay: Math.ceil((totalMinutes + doneTodayMinutes) / daysLeft),
  }
}

/** "Monday" for the last study day before the lesson, or "today" when only today is left. */
export function lastStudyDay(plan: Plan, now: Date): string {
  const last = addDays(plan.lessonDate, -1)
  return dayKey(last) === dayKey(now) ? 'today' : WEEKDAY_NAMES[last.getDay()]
}
