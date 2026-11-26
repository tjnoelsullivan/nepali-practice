import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs'
import type { Direction, Sentence } from './types'

export const scheduler = fsrs({ enable_fuzz: true, enable_short_term: true })

export { Rating, State }

export type Attempt = {
  sentence: Sentence
  direction: Direction
  /** Indexes of chunks the learner revealed with a hint. */
  hinted: Set<number>
  /** For en-np: which chunks were said correctly. Ignored for np-en. */
  chunkOk?: boolean[]
  /** Whole answer judged correct (after any "I was right" override). */
  correct: boolean
}

/**
 * Turn one sentence attempt into an FSRS grade per item.
 * - A hinted chunk's items get Again, so they come back soon.
 * - In en-np, a chunk you didn't produce gets Again.
 * - In np-en, a wrong answer gives the un-hinted items Hard (we can't tell which word tripped you up).
 * - Everything else gets Good.
 * An item that appears in several chunks takes its lowest grade.
 */
export function rateAttempt(a: Attempt): Map<string, Grade> {
  const out = new Map<string, Grade>()
  const put = (id: string, g: Grade) => {
    const prev = out.get(id)
    out.set(id, prev === undefined ? g : (Math.min(prev, g) as Grade))
  }
  a.sentence.chunks.forEach((c, i) => {
    let g: Grade
    if (a.hinted.has(i)) g = Rating.Again
    else if (a.direction === 'en-np' && a.chunkOk && a.chunkOk[i] === false && !a.correct) g = Rating.Again
    else if (a.direction === 'np-en' && !a.correct) g = Rating.Hard
    else g = Rating.Good
    for (const id of c.items) put(id, g)
  })
  return out
}

export function review(card: Card | undefined, grade: Grade, now: Date): Card {
  return scheduler.next(card ?? createEmptyCard(now), now, grade).card
}

export function isKnown(card: Card | undefined): boolean {
  return !!card && card.state !== State.New
}

export function isDue(card: Card | undefined, now: Date): boolean {
  return isKnown(card) && new Date(card!.due).getTime() <= now.getTime()
}

/** Mastered: in Review state and expected to be remembered for 3+ weeks. */
export function isMastered(card: Card | undefined): boolean {
  return !!card && card.state === State.Review && card.stability >= 21
}
