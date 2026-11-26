// Turns an episode plan into one MP3 on the phone. One continuous file is what lets iPhone keep
// playing with the screen locked (and from the car or AirPods controls); a page that strings
// clips together with timers gets paused when the screen locks.
import { Mp3Encoder } from '@breezystack/lamejs'
import { db, recordingBlob } from '../db'
import { speechUrl, ttsBlob } from '../voice/tts'
import type { Caption, Step } from './episode'

export const RATE = 24000
const KBPS = 48
const FRAME = 1152

/** Where each caption starts, in seconds into the episode. */
export type Cue = { at: number; caption: Caption }
export type Rendered = { mp3: ArrayBuffer; seconds: number; cues: Cue[] }
export type Progress = { done: number; total: number; stage: 'voices' | 'assembling' }

function clipKey(st: Step): string | null {
  const s = st.seg
  if (s.kind === 'pause') return null
  if (s.kind === 'en') return 'en:' + s.text
  if (s.audioId && !s.slow) return 'rec:' + s.audioId
  return (s.slow ? 'slow:' : 'np:') + s.dev
}

async function clipBlob(st: Step): Promise<Blob> {
  const s = st.seg
  if (s.kind === 'en') return ttsBlob(speechUrl(s.text, { english: true }))
  if (s.kind === 'np') {
    if (s.audioId && !s.slow) {
      const rec = await db.recordings.get(s.audioId)
      if (rec) return recordingBlob(rec)
    }
    return ttsBlob(speechUrl(s.dev, { slow: s.slow }))
  }
  throw new Error('no audio for a pause')
}

/** Decode any audio the phone can play and resample it to mono 16-bit at RATE. */
async function toPcm(ctx: BaseAudioContext, blob: Blob): Promise<Int16Array> {
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  const length = Math.max(1, Math.ceil(decoded.duration * RATE))
  const off = new OfflineAudioContext(1, length, RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const f = (await off.startRendering()).getChannelData(0)
  const out = new Int16Array(f.length)
  // Normalize quiet clips (phone recordings) toward the TTS level, without clipping.
  let peak = 0
  for (let i = 0; i < f.length; i++) peak = Math.max(peak, Math.abs(f[i]))
  const gain = peak > 0 && peak < 0.5 ? Math.min(3, 0.7 / peak) : 1
  for (let i = 0; i < f.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * gain * 32767)))
  return out
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++])
    }),
  )
}

export async function renderEpisode(
  steps: Step[],
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
  /** Stop at the first scene or line that would start after this, then play the closing. */
  maxSeconds = Infinity,
): Promise<Rendered> {
  // 1. Fetch and decode every distinct clip (repeats are reused).
  const keys = [...new Set(steps.map(clipKey).filter((k): k is string => !!k))]
  const first = new Map<string, Step>()
  for (const st of steps) {
    const k = clipKey(st)
    if (k && !first.has(k)) first.set(k, st)
  }
  const ctx = new OfflineAudioContext(1, 1, RATE)
  const pcm = new Map<string, Int16Array>()
  let done = 0
  const failures: unknown[] = []
  onProgress({ done, total: keys.length, stage: 'voices' })
  await pool(keys, 4, async (k) => {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    const st = first.get(k)!
    try {
      pcm.set(k, await toPcm(ctx, await clipBlob(st)))
    } catch (e) {
      try {
        // A recording that won't decode falls back to the synthetic voice.
        if (st.seg.kind === 'np' && st.seg.audioId) pcm.set(k, await toPcm(ctx, await ttsBlob(speechUrl(st.seg.dev))))
        else throw e
      } catch (e2) {
        failures.push(e2)
        pcm.set(k, new Int16Array(0))
      }
    }
    onProgress({ done: ++done, total: keys.length, stage: 'voices' })
  })

  // A few missing clips just leave a gap; many means the voice service isn't reachable.
  if (failures.length > Math.max(2, keys.length * 0.1)) throw failures[0]

  // 2. Encode in order, with silence for pauses, noting where each caption starts.
  const enc = new Mp3Encoder(1, RATE, KBPS)
  const parts: Uint8Array[] = []
  const cues: Cue[] = []
  let samples = 0
  let carry = new Int16Array(0)
  const push = (data: Int16Array) => {
    let buf = data
    if (carry.length) {
      buf = new Int16Array(carry.length + data.length)
      buf.set(carry)
      buf.set(data, carry.length)
    }
    const whole = buf.length - (buf.length % FRAME)
    for (let i = 0; i < whole; i += FRAME) {
      const out = enc.encodeBuffer(buf.subarray(i, i + FRAME))
      if (out.length) parts.push(out)
    }
    carry = buf.slice(whole)
    samples += data.length
  }
  let lastCaption = ''
  let ending = false
  for (let i = 0; i < steps.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    const st = steps[i]
    if (!ending && st.boundary && !st.outro && samples / RATE >= maxSeconds) ending = true
    if (ending && !st.outro) continue
    const key = JSON.stringify(st.caption)
    if (key !== lastCaption) {
      cues.push({ at: samples / RATE, caption: st.caption })
      lastCaption = key
    }
    if (st.seg.kind === 'pause') push(new Int16Array(Math.round((st.seg.ms / 1000) * RATE)))
    else {
      const clip = pcm.get(clipKey(st)!)!
      if (!clip.length) continue
      push(clip)
      push(new Int16Array(Math.round(0.25 * RATE))) // a breath between voices
    }
    if (i % 20 === 0) {
      onProgress({ done: i, total: steps.length, stage: 'assembling' })
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  if (carry.length) {
    const pad = new Int16Array(FRAME)
    pad.set(carry)
    parts.push(enc.encodeBuffer(pad))
  }
  parts.push(enc.flush())
  const size = parts.reduce((n, p) => n + p.length, 0)
  const mp3 = new Uint8Array(size)
  let o = 0
  for (const p of parts) {
    mp3.set(p, o)
    o += p.length
  }
  return { mp3: mp3.buffer, seconds: samples / RATE, cues }
}
