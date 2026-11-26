/**
 * Active study time. Time counts only while all of these hold:
 * - a practice session is running ("studying"),
 * - the app is on screen,
 * - you touched, typed, played audio or spoke within the last minute.
 * Leave the app open and walk away, and the clock stops a minute after your last action.
 */
export const IDLE_MS = 60_000
/** Longest gap between ticks we trust; longer gaps mean the phone suspended the app. */
const MAX_TICK_MS = 10_000

export class ActiveClock {
  private lastTick: number | null = null
  private lastActivity = Number.NEGATIVE_INFINITY
  studying = false
  private idleMs: number

  constructor(idleMs = IDLE_MS) {
    this.idleMs = idleMs
  }

  activity(now: number) {
    this.lastActivity = now
  }

  /** Stop counting (app hidden). The next tick starts fresh. */
  pause() {
    this.lastTick = null
  }

  /** Milliseconds of active time since the previous tick. */
  tick(now: number): number {
    const prev = this.lastTick
    this.lastTick = now
    if (prev === null || !this.studying || now <= prev) return 0
    const from = Math.max(prev, now - MAX_TICK_MS)
    const until = Math.min(now, this.lastActivity + this.idleMs)
    return Math.max(0, until - from)
  }
}

/** Local calendar date as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export type DayRecord = { date: string; activeMs: number; answers: number }

/** A day counts toward the streak if you answered at least one card or studied a full minute. */
export function dayCounts(r: DayRecord | undefined): boolean {
  return !!r && (r.answers > 0 || r.activeMs >= 60_000)
}

/**
 * Days in a row ending today. If today hasn't been practiced yet, the streak from yesterday
 * still stands (it only breaks once a whole day is missed).
 */
export function currentStreak(days: Map<string, DayRecord>, today: Date): number {
  let d = dayCounts(days.get(dayKey(today))) ? today : addDays(today, -1)
  let n = 0
  while (dayCounts(days.get(dayKey(d)))) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export function bestStreak(days: Map<string, DayRecord>): number {
  const keys = [...days.values()].filter(dayCounts).map((r) => r.date).sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const k of keys) {
    run = prev && dayKey(addDays(new Date(prev + 'T12:00:00'), 1)) === k ? run + 1 : 1
    best = Math.max(best, run)
    prev = k
  }
  return best
}

/** Monday-first week containing `today`: seven date keys. */
export function weekKeys(today: Date, weeksAgo = 0): string[] {
  const monday = addDays(today, -((today.getDay() + 6) % 7) - 7 * weeksAgo)
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i)))
}

export function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
