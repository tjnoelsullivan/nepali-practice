import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractSlides } from '../pptx'
import { buildDraft, type IngestResult } from '../lesson'
import { STARTER_ITEMS, STARTER_SENTENCES } from '../../content/starter'
import { sentenceDevanagari, sentenceNepali } from '../../core/types'

describe('pptx reader', () => {
  it('reads slide text from a real tutor deck', async () => {
    const buf = readFileSync(new URL('./tastes.pptx', import.meta.url))
    const slides = await extractSlides(new File([buf], 'tastes.pptx'))
    expect(slides.length).toBeGreaterThan(2)
    expect(slides.flat().join(' ').toLowerCase()).toContain('amilo')
  })
  it('rejects a file that is not a pptx', async () => {
    await expect(extractSlides(new File(['hello'], 'x.pptx'))).rejects.toThrow(/PowerPoint/)
  })
})

const existing = { items: new Map(STARTER_ITEMS.map((i) => [i.id, i])), sentences: STARTER_SENTENCES }

const res: IngestResult = {
  title: 'Weather',
  sentences: [
    {
      en: 'It is cold today.',
      enAlts: ["It's cold today."],
      fromSlides: true,
      tags: ['plans'],
      grammar: ['g:present-chha'],
      chunks: [
        { np: 'Aaja', en: 'today', dev: 'आज', itemId: 'w:aaja' },
        { np: 'jaado', en: 'cold (weather)', dev: 'जाडो', itemId: 'w:jaado' },
        { np: 'chha', en: 'is', dev: 'छ', itemId: 'w:chha' },
        { np: '.', en: '', dev: '।', itemId: '' },
      ],
    },
    {
      en: 'Lemon is sour.',
      enAlts: [],
      fromSlides: true,
      tags: ['food'],
      grammar: [],
      chunks: [
        { np: 'Kaagati', en: 'lemon', dev: 'कागती', itemId: 'w:kaagati' },
        { np: 'amilo', en: 'sour', dev: 'अमिलो', itemId: 'w:amilo' },
        { np: 'chha', en: 'is', dev: 'छ', itemId: 'w:chha' },
        { np: '.', en: '', dev: '।', itemId: '' },
      ],
    },
    {
      en: 'Broken',
      enAlts: [],
      fromSlides: false,
      tags: [],
      grammar: [],
      chunks: [{ np: 'kehi', en: 'something', dev: '', itemId: '' }],
    },
  ],
  newItems: [{ id: 'w:jaado', np: 'jaado', en: 'cold (weather)' }],
  newGrammar: [],
  questions: ['Is "jaado" or "chiso" better for weather?'],
}

describe('lesson draft', () => {
  const d = buildDraft(res, 'weather.pptx', existing)
  it('builds sentences that play and grade like built-in ones', () => {
    const s = d.sentences[0]
    expect(sentenceNepali(s)).toBe('Aaja jaado chha.')
    expect(sentenceDevanagari(s)).toBe('आज जाडो छ।')
    expect(s.source).toBe('lesson')
    expect(s.verified).toBe(true)
    expect(s.chunks[1].items).toEqual(['w:jaado'])
    expect(s.chunks[2].items).toContain('g:present-chha')
  })
  it('marks sentences already in the deck and skips ones without voice text', () => {
    expect(d.duplicates.size).toBe(1)
    expect(d.sentences.length).toBe(2)
    expect(d.problems.length).toBe(1)
  })
  it('only adds genuinely new items', () => {
    expect(d.items.map((i) => i.id)).toEqual(['w:jaado'])
  })
})
