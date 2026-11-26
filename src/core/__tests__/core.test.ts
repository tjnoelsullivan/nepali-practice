import { describe, expect, it } from 'vitest'
import { createEmptyCard } from 'ts-fsrs'
import { gradeEnglish, gradeNepali, tokenMatches } from '../grade'
import { rateAttempt, Rating, review } from '../schedule'
import { buildSession } from '../session'
import type { Sentence } from '../types'

const eaten: Sentence = {
  id: 's1',
  en: 'Have you eaten?',
  enAlts: ['Did you eat?', 'Have you had your meal?'],
  chunks: [
    { np: 'Khana', en: 'food', items: ['w:khana'] },
    { np: 'khanu bhayo', en: 'did you eat (respectful)', items: ['w:khanu', 'g:nu-bhayo'] },
    { np: '?', en: '', items: [] },
  ],
  tags: ['mother-in-law', 'mealtime'],
  source: 'seed',
  verified: true,
}

describe('gradeNepali', () => {
  it('accepts the exact answer, any case and punctuation', () => {
    expect(gradeNepali(eaten, 'khana khanu bhayo').correct).toBe(true)
    expect(gradeNepali(eaten, 'Khana khanu bhayo?!').correct).toBe(true)
  })
  it('tolerates loose romanization', () => {
    expect(tokenMatches('khanu', 'khaanu')).toBe(true)
    expect(tokenMatches('chha', 'cha')).toBe(true)
    expect(tokenMatches('tapaai', 'tapai')).toBe(true)
    expect(gradeNepali(eaten, 'khaana khaanu bhayo').correct).toBe(true)
  })
  it('marks the missing chunk', () => {
    const g = gradeNepali(eaten, 'khana bhayo')
    expect(g.correct).toBe(false)
    expect(g.chunks.map((c) => c.ok)).toEqual([true, false, true])
  })
  it('rejects unrelated short words', () => {
    expect(tokenMatches('ma', 'ta')).toBe(false)
  })
})

describe('gradeEnglish', () => {
  it('accepts alternates and ignores filler words', () => {
    expect(gradeEnglish(eaten, 'have you eaten').correct).toBe(true)
    expect(gradeEnglish(eaten, 'Did you eat').correct).toBe(true)
  })
  it('rejects a different meaning', () => {
    expect(gradeEnglish(eaten, 'are you hungry').correct).toBe(false)
  })
})

describe('rateAttempt', () => {
  it('rates hinted chunks Again and the rest Good', () => {
    const r = rateAttempt({ sentence: eaten, direction: 'en-np', hinted: new Set([0]), correct: true })
    expect(r.get('w:khana')).toBe(Rating.Again)
    expect(r.get('w:khanu')).toBe(Rating.Good)
  })
  it('rates missed chunks Again in en-np', () => {
    const r = rateAttempt({
      sentence: eaten,
      direction: 'en-np',
      hinted: new Set(),
      chunkOk: [true, false, true],
      correct: false,
    })
    expect(r.get('w:khana')).toBe(Rating.Good)
    expect(r.get('g:nu-bhayo')).toBe(Rating.Again)
  })
  it('rates everything Hard on a wrong np-en answer', () => {
    const r = rateAttempt({ sentence: eaten, direction: 'np-en', hinted: new Set(), correct: false })
    expect(r.get('w:khana')).toBe(Rating.Hard)
  })
  it('an Again review comes back sooner than a Good one', () => {
    const now = new Date('2026-12-01T10:00:00Z')
    const again = review(undefined, Rating.Again, now)
    const good = review(undefined, Rating.Good, now)
    expect(new Date(again.due).getTime()).toBeLessThanOrEqual(new Date(good.due).getTime())
  })
})

describe('buildSession', () => {
  const mk = (id: string, items: string[], tags: string[] = []): Sentence => ({
    id,
    en: id,
    chunks: items.map((i) => ({ np: i, en: i, items: [i] })),
    tags,
    source: 'seed',
    verified: false,
  })
  const now = new Date('2026-12-01T10:00:00Z')
  const rand = () => 0.5

  it('prefers sentences covering due items', () => {
    const due = { ...createEmptyCard(now), state: 2, due: new Date('2026-11-30T00:00:00Z') }
    const cards = new Map([['a', due]])
    const s = buildSession([mk('x', ['b']), mk('y', ['a'])], cards, now, { size: 1, random: rand })
    expect(s[0].sentenceId).toBe('y')
  })
  it('holds back sentences with too many new items when easier ones exist', () => {
    const s = buildSession([mk('hard', ['a', 'b', 'c']), mk('easy', ['d'])], new Map(), now, {
      random: rand,
      maxNewPerSentence: 2,
    })
    expect(s.map((x) => x.sentenceId)).toEqual(['easy'])
  })
  it('never comes up empty: falls back to the easiest sentence', () => {
    const s = buildSession([mk('hard', ['a', 'b', 'c'])], new Map(), now, { random: rand, maxNewPerSentence: 2 })
    expect(s.map((x) => x.sentenceId)).toEqual(['hard'])
  })
  it('caps new items per session and introduces them as recognition', () => {
    const sents = Array.from({ length: 10 }, (_, i) => mk('s' + i, ['n' + i, 'm' + i]))
    const s = buildSession(sents, new Map(), now, { maxNewItems: 4, random: rand })
    expect(s.length).toBe(2)
    expect(s.every((x) => x.direction === 'np-en')).toBe(true)
  })
  it('weights family sentences up', () => {
    const s = buildSession([mk('a', ['x']), mk('b', ['y'], ['wife'])], new Map(), now, { size: 1, random: rand })
    expect(s[0].sentenceId).toBe('b')
  })
})
