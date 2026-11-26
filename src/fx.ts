import { getPrefs } from './core/prefs'

/**
 * Small sounds and celebrations. Sounds are synthesized (no audio files to download)
 * and kept quiet so they sit under the Nepali voice rather than over it.
 */

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, gain = 0.08, type: OscillatorType = 'sine') {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  const t = c.currentTime + start
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}

export type Sound = 'correct' | 'wrong' | 'complete' | 'goal'

export function playSound(s: Sound) {
  if (!getPrefs().sounds) return
  const c = audio()
  if (!c) return
  switch (s) {
    case 'correct': // a rising fifth
      tone(c, 659.25, 0, 0.18)
      tone(c, 987.77, 0.09, 0.28)
      break
    case 'wrong': // one soft low note, not a buzzer
      tone(c, 220, 0, 0.3, 0.06, 'triangle')
      break
    case 'complete':
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, i * 0.09, 0.35, 0.07))
      break
    case 'goal':
      ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(c, f, i * 0.08, 0.5, 0.07))
      tone(c, 1046.5, 0.45, 0.8, 0.05, 'triangle')
      break
  }
}

/** Light haptic tick where supported (Android; iOS Safari ignores it). */
export function buzz(ms = 15) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported */
  }
}

const COLORS = ['#3d7dd8', '#fff7ea', '#e04b4b', '#3bb273', '#ffc857']

/** A burst of prayer-flag confetti. Skipped when the phone asks for reduced motion. */
export function celebrate(amount = 80) {
  if (typeof window === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  const dpr = Math.min(2, devicePixelRatio || 1)
  const w = innerWidth
  const h = innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.className = 'confetti'
  document.body.appendChild(canvas)
  const g = canvas.getContext('2d')
  if (!g) return canvas.remove()
  g.scale(dpr, dpr)
  const bits = Array.from({ length: amount }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.35,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 11 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    s: 6 + Math.random() * 6,
    c: COLORS[Math.floor(Math.random() * COLORS.length)],
  }))
  const t0 = performance.now()
  const frame = (t: number) => {
    const age = t - t0
    g.clearRect(0, 0, w, h)
    g.globalAlpha = Math.max(0, 1 - age / 2200)
    for (const b of bits) {
      b.vy += 0.35
      b.vx *= 0.99
      b.x += b.vx
      b.y += b.vy
      b.r += b.vr
      g.save()
      g.translate(b.x, b.y)
      g.rotate(b.r)
      g.fillStyle = b.c
      g.fillRect(-b.s / 2, -b.s / 3, b.s, (b.s * 2) / 3)
      g.restore()
    }
    if (age < 2200) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
