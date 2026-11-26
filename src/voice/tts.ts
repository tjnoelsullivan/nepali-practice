// Plays Nepali sentences with the Azure voice through /api/tts.
// iOS only lets a page play sound after a tap, so one shared <audio> element is "unlocked"
// on the first tap and reused. Audio is cached on the phone so repeats work offline.
import { api } from './api'
import { getVoiceSettings } from './settings'
import { markActive } from '../core/tracker'

const CACHE = 'saathi-tts-v1'
/** A tiny silent WAV, built in code, used only to unlock audio on iOS. */
function silentWav(): string {
  const n = 800 // 0.1 s at 8 kHz, 8-bit mono
  const b = new Uint8Array(44 + n)
  const v = new DataView(b.buffer)
  const str = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true)
  str(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44)
  let bin = ''
  b.forEach((x) => (bin += String.fromCharCode(x)))
  return 'data:audio/wav;base64,' + btoa(bin)
}

let el: HTMLAudioElement | null = null
let unlocked = false
let currentUrl = ''
const memory = new Map<string, string>() // request url -> object url

function audio(): HTMLAudioElement {
  if (!el) {
    el = new Audio()
    el.preload = 'auto'
  }
  return el
}

/** Call from a tap handler (e.g. "Start practice") so later playback is allowed on iOS. */
export function unlockAudio() {
  if (unlocked) return
  const a = audio()
  a.src = silentWav()
  a.play().then(
    () => {
      unlocked = true
    },
    () => {},
  )
}

export function isAudioUnlocked() {
  return unlocked
}

function ttsUrl(dev: string, slow: boolean): string {
  const p = new URLSearchParams({ text: dev, voice: getVoiceSettings().voice, rate: slow ? 'slow' : 'normal' })
  return `/api/tts?${p}`
}

/** The audio for a /api/tts URL, from the phone's cache when it's been fetched before. */
export async function ttsBlob(url: string): Promise<Blob> {
  const cache = 'caches' in window ? await caches.open(CACHE).catch(() => null) : null
  const cached = await cache?.match(url)
  if (cached) return cached.blob()
  const r = await api(url)
  const blob = await r.blob()
  await cache?.put(url, new Response(blob, { headers: { 'content-type': 'audio/mpeg' } })).catch(() => {})
  return blob
}

/** URL for Nepali text (Devanagari) in the chosen voice, or for the English narrator. */
export function speechUrl(text: string, opts: { slow?: boolean; english?: boolean } = {}): string {
  if (opts.english) return `/api/tts?${new URLSearchParams({ lang: 'en', text })}`
  return ttsUrl(text, !!opts.slow)
}

async function fetchAudio(url: string): Promise<string> {
  const hit = memory.get(url)
  if (hit) return hit
  const obj = URL.createObjectURL(await ttsBlob(url))
  memory.set(url, obj)
  return obj
}

/** Fetch audio ahead of time so the next card plays instantly. Errors are ignored. */
export function prefetch(dev: string) {
  if (!dev) return
  fetchAudio(ttsUrl(dev, false)).catch(() => {})
}

/** Speak Devanagari text. Resolves when playback ends (or is replaced by another call). */
export async function speak(dev: string, opts: { slow?: boolean } = {}): Promise<void> {
  if (!dev) return
  markActive()
  const url = ttsUrl(dev, !!opts.slow)
  currentUrl = url
  const src = await fetchAudio(url)
  if (currentUrl !== url) return
  const a = audio()
  a.pause()
  a.src = src
  a.playbackRate = 1
  await new Promise<void>((resolve, reject) => {
    const done = () => {
      markActive()
      a.removeEventListener('ended', done)
      a.removeEventListener('pause', done)
      resolve()
    }
    a.addEventListener('ended', done)
    a.addEventListener('pause', done)
    a.play().then(() => {
      unlocked = true
    }, (e) => {
      done()
      reject(e)
    })
  })
}

const blobUrls = new Map<Blob, string>()

/** Play a human recording (e.g. Chunu's voice). Slow plays at 75% speed. */
export async function playRecording(blob: Blob, opts: { slow?: boolean } = {}): Promise<void> {
  markActive()
  let src = blobUrls.get(blob)
  if (!src) {
    src = URL.createObjectURL(blob)
    blobUrls.set(blob, src)
  }
  currentUrl = src
  const a = audio()
  a.pause()
  a.src = src
  a.playbackRate = opts.slow ? 0.75 : 1
  ;(a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
  await new Promise<void>((resolve, reject) => {
    const done = () => {
      markActive()
      a.removeEventListener('ended', done)
      a.removeEventListener('pause', done)
      resolve()
    }
    a.addEventListener('ended', done)
    a.addEventListener('pause', done)
    a.play().then(() => {
      unlocked = true
    }, (e) => {
      done()
      reject(e)
    })
  })
}

export function stopSpeaking() {
  currentUrl = ''
  el?.pause()
}
