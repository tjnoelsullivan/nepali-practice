// Turns an episode plan into one MP3 on the phone. One continuous file is what lets iPhone keep
// playing with the screen locked (and from the car or AirPods controls); a page that strings
// clips together with timers gets paused when the screen locks.
import { Mp3Encoder } from '@breezystack/lamejs'
import { db, recordingBlob } from '../db'
import { speechUrl, ttsBlob, ttsCached } from '../voice/tts'
import type { Caption, Step } from './episode'

export const RATE = 24000
const KBPS = 48
const FRAME = 1152

/** Where each caption starts, in seconds into the episode. */
export type Cue = { at: number; caption: Caption }
export type Rendered = { mp3: ArrayBuffer; seconds: number; cues: Cue[] }
export type Progress = {
  done: number
  total: number
  stage: 'voices' | 'assembling'
  /** The voice service asked us to slow down (Azure free tier: about 20 clips a minute). */
  slowed?: boolean
}

function clipKey(st: Step): string | null {
  const s = st.seg
  if (s.kind === 'pause') return null
  if (s.kind === 'en') return 'en:' + s.text
  if (s.audioId && !s.slow) return 'rec:' + s.audioId
  return (s.slow ? 'slow:' : 'np:') + s.dev
}

async function clipBlob(st: Step, onWait?: (ms: number) => void): Promise<Blob> {
  const s = st.seg
  if (s.kind === 'en') return ttsBlob(speechUrl(s.text, { english: true }), onWait)
  if (s.kind === 'np') {
    if (s.audioId && !s.slow) {
      const rec = await db.recordings.get(s.audioId)
      if (rec) return recordingBlob(rec)
    }
    return ttsBlob(speechUrl(s.dev, { slow: s.slow }), onWait)
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

export async function renderEpisode(
  steps: Step[],
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
  /** Stop at the first scene or line that would start after this, then play the closing. */
  maxSeconds = Infinity,
): Promise<Rendered> {
  // Clips are fetched in playing order, a few steps ahead of the encoder, so an episode only
  // asks the voice service for the clips it actually uses. Repeats are reused.
  const ctx = new OfflineAudioContext(1, 1, RATE)
  const loads = new Map<string, Promise<Int16Array>>()
  let fetched = 0
  let failed = 0
  let firstError: unknown = null
  // Fetch freely until the voice service says it's busy, then pace requests to fit the free
  // tier (one every 3.2 s, under 20 a minute). Clips already on the phone skip the queue.
  let slowed = false
  let nextSlot = 0
  let seconds = 0
  const report = () => onProgress({ done: Math.min(seconds, maxSeconds), total: maxSeconds, stage: 'voices', slowed })
  const onWait = () => {
    slowed = true
    report()
  }
  const paced = async (st: Step) => {
    const sg = st.seg
    if (!slowed || sg.kind === 'pause' || (sg.kind === 'np' && sg.audioId && !sg.slow)) return
    const url = sg.kind === 'en' ? speechUrl(sg.text, { english: true }) : speechUrl(sg.dev, { slow: sg.slow })
    if (await ttsCached(url)) return
    const wait = nextSlot - Date.now()
    nextSlot = Math.max(Date.now(), nextSlot) + 3200
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  }
  const load = (st: Step): Promise<Int16Array> => {
    const k = clipKey(st)!
    let p = loads.get(k)
    if (!p) {
      p = (async () => {
        await paced(st)
        try {
          return await toPcm(ctx, await clipBlob(st, onWait))
        } catch (e) {
          try {
            // A recording that won't decode falls back to the synthetic voice.
            if (st.seg.kind === 'np' && st.seg.audioId) return await toPcm(ctx, await ttsBlob(speechUrl(st.seg.dev), onWait))
            throw e
          } catch (e2) {
            failed++
            firstError ??= e2
            return new Int16Array(0)
          }
        } finally {
          fetched++
        }
      })()
      loads.set(k, p)
    }
    return p
  }

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
    seconds = samples / RATE
  }
  const LOOKAHEAD = 10
  const outroStart = steps.findIndex((st) => st.outro)
  let lastCaption = ''
  let ending = false
  report()
  for (let i = 0; i < steps.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    if (!ending && steps[i].boundary && !steps[i].outro && seconds >= maxSeconds) {
      ending = true
      if (outroStart > i) i = outroStart
    }
    const st = steps[i]
    if (ending && !st.outro) continue
    // Start fetching the next few voices while this one is encoded.
    let ahead = 0
    for (let j = i + 1; j < steps.length && ahead < LOOKAHEAD; j++) {
      if (steps[j].seg.kind === 'pause') continue
      if (ending && !steps[j].outro) continue
      void load(steps[j])
      ahead++
    }
    const key = JSON.stringify(st.caption)
    if (key !== lastCaption) {
      cues.push({ at: seconds, caption: st.caption })
      lastCaption = key
    }
    if (st.seg.kind === 'pause') push(new Int16Array(Math.round((st.seg.ms / 1000) * RATE)))
    else {
      const clip = await load(st)
      // A few missing clips just leave a gap; many means the voice service isn't reachable.
      if (failed > Math.max(2, fetched * 0.1)) throw firstError
      if (clip.length) {
        push(clip)
        push(new Int16Array(Math.round(0.25 * RATE))) // a breath between voices
      }
    }
    if (i % 10 === 0) {
      report()
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
