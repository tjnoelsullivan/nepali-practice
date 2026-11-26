import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { SaathiDB, upsertContent, loadCards } from '../../db'
import { buildBackup, decode, encode, readBackup, restoreBackup } from '../../backup'
import { recordAttempt } from '../record'
import type { Item, Sentence } from '../types'

const items: Item[] = [{ id: 'w:a', kind: 'word', np: 'a', en: 'a', source: 'seed', verified: true }]
const s: Sentence = { id: 's', en: 'x', chunks: [{ np: 'a', en: 'a', items: ['w:a'] }], tags: [], source: 'seed', verified: true }

describe('backup', () => {
  it('encodes dates and audio bytes', () => {
    const d = new Date('2026-11-26T10:00:00Z')
    const bytes = new Uint8Array([1, 2, 250]).buffer
    const back = decode(JSON.parse(JSON.stringify(encode({ d, bytes, n: 1, u: undefined })))) as {
      d: Date
      bytes: ArrayBuffer
      n: number
    }
    expect(back.d.getTime()).toBe(d.getTime())
    expect([...new Uint8Array(back.bytes)]).toEqual([1, 2, 250])
    expect(back.n).toBe(1)
  })

  it('restores learning history and recordings onto a fresh phone', async () => {
    const a = new SaathiDB('backup-a')
    await upsertContent(a, items, [s])
    await recordAttempt(a, { sentence: s, direction: 'np-en', hinted: new Set(), correct: true })
    await a.recordings.put({
      id: 'rec:1',
      sentenceId: 's',
      data: new Uint8Array([9, 8, 7]).buffer,
      mime: 'audio/mp4',
      durationMs: 1200,
      createdAt: new Date(),
    })
    const text = JSON.stringify(await buildBackup(a))

    const { file, summary } = readBackup(text)
    expect(summary).toMatchObject({ sentences: 1, reviews: 1, recordings: 1, days: 1 })

    const b = new SaathiDB('backup-b')
    await upsertContent(b, items, [{ ...s, id: 'other' }])
    await restoreBackup(file, b)
    expect(await b.sentences.count()).toBe(1)
    const card = (await loadCards(b)).get('w:a')!
    expect(card.due).toBeInstanceOf(Date)
    expect(card.reps).toBe(1)
    const rec = (await b.recordings.get('rec:1'))!
    expect([...new Uint8Array(rec.data)]).toEqual([9, 8, 7])
    expect((await b.reviews.toArray())[0].at).toBeInstanceOf(Date)
  })

  it('rejects other files', () => {
    expect(() => readBackup('{"hello":1}')).toThrow(/isn't a Saathi backup/)
    expect(() => readBackup('not json')).toThrow(/isn't a Saathi backup/)
  })
})

import { tutorListText } from '../../tutorList'
describe('tutor list', () => {
  it('lists unverified sentences, flagged answers and questions', () => {
    const t = tutorListText(
      [{ ...s, en: 'Have you eaten?', chunks: [{ np: 'Khaana khaayau?', en: '', items: [] }], verified: false }],
      [{ sentenceId: 's', answer: 'Khana khayo', direction: 'en-np', at: new Date(), note: '', sentence: { ...s, en: 'Did you eat?' } }],
      [{ q: 'Is "khaayau" right for timi?', from: 'Food lesson' }],
    )
    expect(t).toContain('1. Khaana khaayau?  =  Have you eaten?')
    expect(t).toContain('Mine: Khana khayo')
    expect(t).toContain('Is "khaayau" right for timi? (Food lesson)')
  })
})
