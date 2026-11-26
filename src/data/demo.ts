// Stage 0 demo content only. Marked unverified until TJ's tutor checks it.
export type Chunk = { text: string; gloss?: string }

export type DemoSentence = {
  english: string
  nepali: Chunk[]
  context: string
  verified: boolean
}

export const DEMO: DemoSentence = {
  english: 'Have you eaten?',
  nepali: [
    { text: 'Khana', gloss: 'food, a meal' },
    { text: 'khanu bhayo', gloss: 'did (you) eat, respectful form' },
    { text: '?' },
  ],
  context: 'Mother-in-law, mealtime',
  verified: false,
}
