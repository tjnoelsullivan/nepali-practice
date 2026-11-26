import { describe, expect, it } from 'vitest'
import { STARTER_SENTENCES } from '../../content/starter'
import { gradeSpoken, looseDev, romanize } from '../devanagari'
import { sentenceDevanagari } from '../types'

const find = (en: string) => STARTER_SENTENCES.find((s) => s.en === en && s.source === 'tutor')!

describe('Devanagari for the voice', () => {
  it('every built-in sentence has Devanagari for each chunk', () => {
    for (const s of STARTER_SENTENCES) expect(sentenceDevanagari(s), s.en).not.toBe('')
  })

  it('joins chunks with Nepali punctuation', () => {
    expect(sentenceDevanagari(find('Did you eat?'))).toBe('तपाईंले खाना खानु भयो?')
    expect(sentenceDevanagari(find('I am fine.'))).toBe('म सन्चै छु।')
  })
})

describe('spoken answers', () => {
  const s = find('Did you eat?')
  it('accepts what recognition typically returns, including merged words and vowel-length slips', () => {
    expect(gradeSpoken(s, 'तपाईंले खाना खानुभयो?').correct).toBe(true)
    expect(gradeSpoken(s, 'तपाइले खाना खानु भयो').correct).toBe(true)
  })
  it('rejects a different sentence and marks the missing chunk', () => {
    const g = gradeSpoken(s, 'तपाईंले पानी खानु भयो')
    expect(g.correct).toBe(false)
    expect(g.chunks.filter((c) => !c.ok).length).toBe(1)
  })
  it('loosens similar letters', () => {
    expect(looseDev('शनिबार')).toBe(looseDev('सनिवार'))
  })
})

describe('romanize (house style)', () => {
  it.each([
    ['तपाईं सन्चै हुनुहुन्छ?', 'Tapaai sanchai hunuhunchha?'],
    ['मलाई पानी मनपर्छ।', 'Malaai paani manparchha.'],
    ['म घर जान्छु', 'Ma ghar jaanchhu'],
    ['खाना खानु भयो', 'Khaanaa khaanu bhayo'],
  ])('%s → %s', (dev, roman) => {
    expect(romanize(dev)).toBe(roman)
  })
})
