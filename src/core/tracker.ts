// Runs the active-time clock in the browser and saves it to IndexedDB.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { addToDay, db } from '../db'
import { ActiveClock, dayKey, type DayRecord } from './activity'

const clock = new ActiveClock()
let pending = 0
let pendingDay = dayKey(new Date())
let sessionMs = 0
let tickVersion = 0 // live time changed (no reload needed)
let savedVersion = 0 // database changed (reload)
const listeners = new Set<() => void>()
const emit = (saved = false) => {
  tickVersion++
  if (saved) savedVersion++
  listeners.forEach((l) => l())
}

async function flush() {
  if (pending <= 0) return
  const ms = pending
  const day = pendingDay
  pending = 0
  await addToDay(db, day, { activeMs: ms }).catch(() => {
    pending += ms
  })
}

/** Record that the learner did something (tap, type, audio, speech). */
export function markActive() {
  clock.activity(Date.now())
}

/** Practice screen calls this when a session starts and ends. */
export function setStudying(on: boolean) {
  if (on && !clock.studying) sessionMs = 0
  clock.studying = on
  if (on) markActive()
  else void flush().then(() => emit(true))
}

export function sessionActiveMs() {
  return sessionMs
}

let started = false
/** Install listeners once, at app start. */
export function startTracker() {
  if (started) return
  started = true
  const onAct = () => markActive()
  for (const ev of ['pointerdown', 'keydown', 'input', 'touchstart'] as const)
    window.addEventListener(ev, onAct, { capture: true, passive: true })

  setInterval(() => {
    if (document.visibilityState !== 'visible') return
    const now = new Date()
    const day = dayKey(now)
    if (day !== pendingDay) {
      void flush()
      pendingDay = day
    }
    const ms = clock.tick(now.getTime())
    if (ms > 0) {
      pending += ms
      sessionMs += ms
      emit()
    }
  }, 1000)
  setInterval(() => void flush().then(() => emit(true)), 15_000)

  const hide = () => {
    clock.tick(Date.now())
    clock.pause()
    void flush()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hide()
  })
  window.addEventListener('pagehide', hide)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Saved days plus today's not-yet-saved time, live. */
export function useDays(): { days: Map<string, DayRecord>; ready: boolean } {
  useSyncExternalStore(subscribe, () => tickVersion)
  const v = useSyncExternalStore(subscribe, () => savedVersion)
  const [saved, setSaved] = useState<{ days: Map<string, DayRecord>; ready: boolean }>({ days: new Map(), ready: false })
  // Reload from the database when time is flushed or answers are recorded (version bumps).
  useEffect(() => {
    let live = true
    db.days.toArray().then((all) => {
      if (live) setSaved({ days: new Map(all.map((d) => [d.date, d])), ready: true })
    })
    return () => {
      live = false
    }
  }, [v])
  if (pending <= 0) return saved
  const days = new Map(saved.days)
  const cur = days.get(pendingDay) ?? { date: pendingDay, activeMs: 0, answers: 0 }
  days.set(pendingDay, { ...cur, activeMs: cur.activeMs + pending })
  return { days, ready: saved.ready }
}

/** Ask screens showing totals to reload (e.g. after an answer was saved). */
export function daysChanged() {
  emit(true)
}
