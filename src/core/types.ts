import type { Card } from 'ts-fsrs'

/** A word or grammar pattern that FSRS schedules. */
export type Item = {
  id: string // e.g. "w:khana", "g:honorific-past-nu-bhayo"
  kind: 'word' | 'grammar'
  np: string // romanized Nepali, house spelling (chha, tapaai)
  en: string // short English meaning
  note?: string
  source: Source
  verified: boolean
}

/** One piece of a sentence: Nepali text, its English gloss, and the items it exercises. */
export type Chunk = {
  np: string
  en: string
  /** Devanagari for the voice and speech matching only; never displayed. */
  dev?: string
  items: string[]
}

export type Sentence = {
  id: string
  en: string
  /** Other acceptable English translations. */
  enAlts?: string[]
  chunks: Chunk[]
  /** Other acceptable full Nepali answers (romanized). The chunk text joined is always accepted. */
  npAlts?: string[]
  /** Who or where it's used: "wife", "mother-in-law", "mealtime" ... */
  tags: string[]
  source: Source
  verified: boolean
  /** A human recording (e.g. Chunu's voice) to play instead of the synthetic voice. */
  audioId?: string
}

export type Source = 'seed' | 'tutor' | 'lesson' | 'wife' | 'user'

export type Direction = 'en-np' | 'np-en'

export type StoredCard = {
  itemId: string
  card: Card
}

export type ReviewRecord = {
  id?: number
  itemId: string
  sentenceId: string
  rating: number
  hinted: boolean
  at: Date
}

export type Flag = {
  sentenceId: string
  answer: string
  direction: Direction
  at: Date
  note: string
}

export function sentenceNepali(s: Sentence): string {
  return s.chunks
    .map((c) => c.np)
    .join(' ')
    .replace(/\s+([?.!,])/g, '$1')
}

/** Devanagari for the whole sentence (for Azure TTS), or '' if any chunk lacks it. */
export function sentenceDevanagari(s: Sentence): string {
  if (s.chunks.some((c) => c.dev === undefined || (c.en && !c.dev))) return ''
  return s.chunks
    .map((c) => c.dev)
    .join(' ')
    .replace(/\s+([?।!,])/g, '$1')
}
