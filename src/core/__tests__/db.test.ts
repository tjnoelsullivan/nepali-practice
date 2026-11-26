import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { SaathiDB, upsertContent, loadCards } from '../../db'
import { recordAttempt } from '../record'
import type { Item, Sentence } from '../types'

const items: Item[] = [{ id: 'w:a', kind: 'word', np: 'a', en: 'a', source: 'seed', verified: true }]
const s: Sentence = {
  id: 's',
  en: 'x',
  chunks: [{ np: 'a', en: 'a', items: ['w:a'] }],
  tags: [],
  source: 'seed',
  verified: true,
}

describe('storage', () => {
  it('adding new material keeps learning history', async () => {
    const d = new SaathiDB('t1')
    await upsertContent(d, items, [s])
    await recordAttempt(d, { sentence: s, direction: 'en-np', hinted: new Set(), correct: true })
    const before = (await loadCards(d)).get('w:a')!
    await upsertContent(d, [...items, { ...items[0], id: 'w:b' }], [s, { ...s, id: 's2' }])
    const after = (await loadCards(d)).get('w:a')!
    expect(after.reps).toBe(before.reps)
    expect(await d.sentences.count()).toBe(2)
    expect(await d.reviews.count()).toBe(1)
  })
})
