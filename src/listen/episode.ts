import type { Card } from 'ts-fsrs'
import { isKnown } from '../core/schedule'
import { sentenceDevanagari, sentenceNepali, type Sentence } from '../core/types'

/**
 * A Listen episode, Pimsleur style: an English narrator sets up short family scenes, and each
 * line is spoken in Nepali with pauses for TJ to say it first (lines TJ knows) or repeat it
 * (lines still being learned). Earlier lines come back later in the episode as quick recalls.
 */

export type Scene = { title: string; intro: string; lines: { id: string; cue: string }[] }

/** One piece of the episode's audio, in order. */
export type Segment =
  | { kind: 'en'; text: string }
  | { kind: 'np'; dev: string; slow?: boolean; sentenceId: string; audioId?: string }
  | { kind: 'pause'; ms: number }

/** What the screen shows while a stretch of the episode plays. */
export type Caption = { scene: string; en?: string; np?: string }

export type Step = {
  seg: Segment
  caption: Caption
  /** A good place to end the episode early: the start of a scene or a line. */
  boundary?: boolean
  /** Part of the closing, always played. */
  outro?: boolean
}

export type LineMode = 'say' | 'repeat'

/** Sentences TJ can hear in an episode: every word known ('say'), or at least half known ('repeat'). */
export function listenPool(sentences: Sentence[], cards: Map<string, Card>): Map<string, LineMode> {
  const out = new Map<string, LineMode>()
  for (const s of sentences) {
    if (!s.verified && !s.audioId) continue
    const items = [...new Set(s.chunks.flatMap((c) => c.items))]
    if (!items.length) continue
    const known = items.filter((i) => isKnown(cards.get(i))).length
    if (known === items.length) out.set(s.id, 'say')
    else if (known * 2 >= items.length) out.set(s.id, 'repeat')
  }
  return out
}

// Rough spoken lengths, used to plan pauses and the episode length before any audio exists.
export const npMs = (s: Sentence) => 700 + sentenceNepali(s).length * 75
export const enMs = (text: string) => 500 + text.split(/\s+/).length * 330

/** Time to say it yourself: a little longer than the sentence takes to speak, plus thinking time. */
export const sayPause = (s: Sentence) => Math.round(Math.min(9000, 2500 + npMs(s) * 1.4))
/** Time to repeat what you just heard. */
export const repeatPause = (s: Sentence) => Math.round(Math.min(7000, 1200 + npMs(s) * 1.2))

export function segMs(seg: Segment, byId: Map<string, Sentence>): number {
  if (seg.kind === 'pause') return seg.ms
  if (seg.kind === 'en') return enMs(seg.text)
  const s = byId.get(seg.sentenceId)
  return s ? npMs(s) * (seg.slow ? 1.5 : 1) : 1500
}

/** The steps for one line. Sentences Chunu recorded use her voice at normal speed. */
export function lineSteps(s: Sentence, mode: LineMode, scene: string, cue = '', recall = false): Step[] {
  const dev = sentenceDevanagari(s)
  const np = sentenceNepali(s)
  const voice = { kind: 'np' as const, dev, sentenceId: s.id, audioId: s.audioId }
  const cap: Caption = { scene, en: s.en }
  const full: Caption = { scene, en: s.en, np }
  const steps: Step[] = []
  // The scene cue and the prompt are one narrator clip, so an episode asks for fewer voices.
  const lead = cue ? cue.trim().replace(/([^.!?])$/, '$1.') + ' ' : ''
  if (mode === 'say') {
    // English prompt -> try it yourself -> hear it -> repeat -> hear it again.
    const ask = recall ? `Again: how would you say, ${s.en}` : `How would you say, ${s.en}`
    steps.push({ seg: { kind: 'en', text: lead + ask }, caption: cap })
    steps.push({ seg: { kind: 'pause', ms: sayPause(s) }, caption: cap })
    steps.push({ seg: voice, caption: full })
    steps.push({ seg: { kind: 'pause', ms: repeatPause(s) }, caption: full })
    steps.push({ seg: voice, caption: full })
    steps.push({ seg: { kind: 'pause', ms: 900 }, caption: full })
  } else {
    // English -> hear it -> repeat -> hear it slowly -> repeat.
    steps.push({ seg: { kind: 'en', text: lead + s.en }, caption: cap })
    steps.push({ seg: { kind: 'pause', ms: 500 }, caption: cap })
    steps.push({ seg: voice, caption: full })
    steps.push({ seg: { kind: 'pause', ms: repeatPause(s) }, caption: full })
    steps.push({ seg: { ...voice, audioId: undefined, slow: true }, caption: full })
    steps.push({ seg: { kind: 'pause', ms: Math.round(repeatPause(s) * 1.2) }, caption: full })
  }
  return steps
}

/** Fallback scenes when Claude isn't reachable: group by the first tag. */
export function scenesByTag(ids: string[], byId: Map<string, Sentence>): Scene[] {
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const tag = byId.get(id)?.tags[0] ?? 'everyday'
    groups.set(tag, [...(groups.get(tag) ?? []), id])
  }
  const name = (t: string) => t.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  return [...groups].map(([tag, list]) => ({
    title: name(tag),
    intro: `Some things you might say: ${name(tag).toLowerCase()}.`,
    lines: list.slice(0, 8).map((id) => ({ id, cue: '' })),
  }))
}

/**
 * Lay out an episode of about `minutes` (spoken lengths are estimates, so the renderer is given
 * a longer plan and stops at the right time; see renderEpisode's maxSeconds). Scenes play in order; after each scene, two lines
 * from earlier scenes come back as recalls. When the scenes run out before the time is up,
 * they play again, with lines that were 'repeat' now asked as 'say'.
 */
export function planEpisode(
  scenes: Scene[],
  pool: Map<string, LineMode>,
  byId: Map<string, Sentence>,
  minutes: number,
  random: () => number = Math.random,
): Step[] {
  const target = minutes * 60_000
  const steps: Step[] = []
  let ms = 0
  const add = (list: Step[]) => {
    if (list.length) list[0] = { ...list[0], boundary: true }
    for (const st of list) {
      steps.push(st)
      ms += segMs(st.seg, byId)
    }
  }
  const usable = scenes
    .map((sc) => ({ ...sc, lines: sc.lines.filter((l) => byId.has(l.id) && pool.has(l.id)) }))
    .filter((sc) => sc.lines.length)
  if (!usable.length) return []

  add([
    {
      seg: { kind: 'en', text: `Welcome to your Saathi listening session. When you hear a pause, say the Nepali out loud. Let's begin.` },
      caption: { scene: 'Welcome' },
    },
    { seg: { kind: 'pause', ms: 1200 }, caption: { scene: 'Welcome' } },
  ])
  const heard: string[] = []
  for (let round = 0; ms < target; round++) {
    for (const sc of usable) {
      if (ms >= target) break
      add([
        { seg: { kind: 'en', text: `${sc.title}. ${sc.intro}` }, caption: { scene: sc.title } },
        { seg: { kind: 'pause', ms: 800 }, caption: { scene: sc.title } },
      ])
      for (const l of sc.lines) {
        if (ms >= target) break
        const mode: LineMode = round > 0 ? 'say' : pool.get(l.id)!
        add(lineSteps(byId.get(l.id)!, mode, sc.title, l.cue))
        heard.push(l.id)
      }
      // Recall two earlier lines from other scenes.
      const earlier = heard.filter((id) => !sc.lines.some((l) => l.id === id))
      for (let k = 0; k < 2 && earlier.length && ms < target; k++) {
        const id = earlier.splice(Math.floor(random() * earlier.length), 1)[0]
        add(lineSteps(byId.get(id)!, 'say', 'Quick review', '', true))
      }
    }
    if (round >= 9) break // a small pool gives a shorter episode rather than endless repeats
  }
  add([
    { seg: { kind: 'pause', ms: 800 }, caption: { scene: 'Done' }, outro: true },
    { seg: { kind: 'en', text: `That's the end of this session. Great work.` }, caption: { scene: 'Done' }, outro: true },
  ])
  return steps
}

/** Estimated length of a plan in ms. */
export function planMs(steps: Step[], byId: Map<string, Sentence>): number {
  return steps.reduce((n, st) => n + segMs(st.seg, byId), 0)
}
