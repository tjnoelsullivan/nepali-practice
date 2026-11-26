import type { Card } from 'ts-fsrs'
import { isDue, isKnown } from './schedule'
import type { Direction, Sentence } from './types'

export type SessionItem = { sentenceId: string; direction: Direction }

export type SessionOptions = {
  size?: number
  maxNewItems?: number
  maxNewPerSentence?: number
  /** Last time each sentence was shown. */
  lastSeen?: Map<string, Date>
  random?: () => number
}

const FAMILY_TAGS = new Set(['wife', 'mother-in-law', 'father-in-law', 'in-laws', 'family'])

/**
 * Pick sentences for a session.
 * Priority: sentences that exercise due words/grammar, then sentences that introduce a few new
 * items, with family sentences weighted up and sentences seen in the last 12 hours weighted down.
 * A sentence with more than `maxNewPerSentence` unknown items is held back until some are learned;
 * if nothing qualifies, the sentence with the fewest unknown items is used so a session never comes up empty.
 */
export function buildSession(
  sentences: Sentence[],
  cards: Map<string, Card>,
  now: Date,
  opts: SessionOptions = {},
): SessionItem[] {
  const size = opts.size ?? 10
  const maxNew = opts.maxNewItems ?? 12
  const maxPer = opts.maxNewPerSentence ?? 4
  const rand = opts.random ?? Math.random
  const lastSeen = opts.lastSeen ?? new Map()

  const covered = new Set<string>()
  const introduced = new Set<string>()
  const chosen: SessionItem[] = []
  const pool = new Set(sentences.map((s) => s.id))
  const byId = new Map(sentences.map((s) => [s.id, s]))
  const jitter = new Map(sentences.map((s) => [s.id, rand()]))

  const itemsOf = (s: Sentence) => [...new Set(s.chunks.flatMap((c) => c.items))]

  const eligible = (s: Sentence) => {
    const n = itemsOf(s).filter((i) => !isKnown(cards.get(i))).length
    return n <= maxPer
  }
  const anyEligible = sentences.some(eligible)

  while (chosen.length < size && pool.size) {
    let best: { s: Sentence; score: number; newIds: string[] } | null = null
    for (const id of pool) {
      const s = byId.get(id)!
      const items = itemsOf(s)
      const newIds = items.filter((i) => !isKnown(cards.get(i)) && !introduced.has(i))
      const relaxed = chosen.length === 0 && !anyEligible
      if (!relaxed && newIds.length > maxPer) continue
      if (!relaxed && introduced.size + newIds.length > maxNew && newIds.length > 0) continue
      const dueHits = items.filter((i) => isDue(cards.get(i), now) && !covered.has(i)).length
      const family = (s.tags.some((t) => FAMILY_TAGS.has(t)) ? 2 : 0) + (s.audioId ? 1 : 0)
      const seen = lastSeen.get(s.id)
      const recent = seen && now.getTime() - seen.getTime() < 12 * 3600_000 ? 3 : 0
      const score =
        (relaxed ? -10 * newIds.length : 0) +
        4 * dueHits + 1.5 * newIds.length + family + (s.verified ? 0.5 : 0) - recent + jitter.get(id)!
      if (!best || score > best.score) best = { s, score, newIds }
    }
    if (!best) break
    pool.delete(best.s.id)
    for (const i of itemsOf(best.s)) covered.add(i)
    for (const i of best.newIds) introduced.add(i)
    // New material is introduced as recognition (hear/read Nepali) first.
    // Recordings are for ear training, so they are always heard (Nepali -> English).
    const direction: Direction =
      best.s.audioId || best.newIds.length > 0 ? 'np-en' : rand() < 0.7 ? 'en-np' : 'np-en'
    chosen.push({ sentenceId: best.s.id, direction })
  }
  return chosen
}
