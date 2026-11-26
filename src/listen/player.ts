// The Listen player lives outside React so an episode keeps playing when you switch tabs.
// Time spent listening counts toward the daily goal, measured from what the audio element
// actually played, so it also counts while the screen is locked.
import { useSyncExternalStore } from 'react'
import { dayKey } from '../core/activity'
import { getPrefs } from '../core/prefs'
import { daysChanged } from '../core/tracker'
import { addToDay, db } from '../db'
import type { Cue } from './render'

export type Episode = {
  mp3: ArrayBuffer
  seconds: number
  cues: Cue[]
  minutes: number
  createdAt: Date
  /** Scene titles, for the episode summary. */
  scenes: string[]
}

const KEY = 'listenEpisode'

export async function loadSavedEpisode(): Promise<Episode | null> {
  const row = await db.meta.get(KEY)
  return (row?.value as Episode) ?? null
}

export async function saveEpisode(e: Episode) {
  await db.meta.put({ key: KEY, value: e })
}

type State = { episode: Episode | null; playing: boolean; time: number }
let state: State = { episode: null, playing: false, time: 0 }
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let el: HTMLAudioElement | null = null
let url = ''
let credited = 0

function playedSeconds(a: HTMLAudioElement): number {
  let s = 0
  for (let i = 0; i < a.played.length; i++) s += a.played.end(i) - a.played.start(i)
  return s
}

/** Add newly played time to today's active minutes. */
async function credit() {
  if (!el) return
  const total = playedSeconds(el)
  const add = total - credited
  if (add < 1) return
  credited = total
  await addToDay(db, dayKey(new Date()), { activeMs: Math.round(add * 1000) }, getPrefs().goalMinutes * 60_000)
  daysChanged()
}

function audio(): HTMLAudioElement {
  if (el) return el
  el = new Audio()
  el.preload = 'auto'
  el.addEventListener('play', () => set({ playing: true }))
  el.addEventListener('pause', () => {
    set({ playing: false })
    void credit()
  })
  el.addEventListener('ended', () => {
    set({ playing: false })
    void credit()
  })
  let lastCredit = 0
  el.addEventListener('timeupdate', () => {
    set({ time: el!.currentTime })
    if (Date.now() - lastCredit > 15_000) {
      lastCredit = Date.now()
      void credit()
    }
  })
  document.addEventListener('visibilitychange', () => void credit())
  return el
}

function setupMediaSession(e: Episode) {
  const ms = navigator.mediaSession
  if (!ms) return
  ms.metadata = new MediaMetadata({
    title: `Listening session · ${e.minutes} min`,
    artist: 'Saathi',
    album: e.scenes.slice(0, 3).join(', '),
    artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  })
  const a = audio()
  const skip = (d: number) => (a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d)))
  ms.setActionHandler('play', () => void a.play())
  ms.setActionHandler('pause', () => a.pause())
  ms.setActionHandler('seekbackward', () => skip(-15))
  ms.setActionHandler('seekforward', () => skip(15))
  try {
    ms.setActionHandler('previoustrack', () => skip(-15))
    ms.setActionHandler('nexttrack', () => skip(15))
  } catch {
    /* not supported */
  }
}

export function setEpisode(e: Episode | null) {
  const a = audio()
  a.pause()
  if (url) URL.revokeObjectURL(url)
  url = ''
  credited = 0
  if (e) {
    url = URL.createObjectURL(new Blob([e.mp3], { type: 'audio/mpeg' }))
    a.src = url
    setupMediaSession(e)
  } else a.removeAttribute('src')
  set({ episode: e, playing: false, time: 0 })
}

export function toggle() {
  const a = audio()
  if (a.paused) void a.play()
  else a.pause()
}

export function seek(seconds: number) {
  const a = audio()
  a.currentTime = Math.max(0, Math.min(a.duration || state.episode?.seconds || 0, seconds))
  set({ time: a.currentTime })
}

export function usePlayer(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** The caption showing at a time. */
export function captionAt(cues: Cue[], t: number) {
  let lo = 0
  let hi = cues.length - 1
  let best = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid].at <= t) {
      best = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return cues[best]?.caption
}
