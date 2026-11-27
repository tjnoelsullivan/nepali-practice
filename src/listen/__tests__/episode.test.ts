import { describe, expect, it } from 'vitest'
import type { Card } from 'ts-fsrs'
import { review, Rating } from '../../core/schedule'
import type { Sentence } from '../../core/types'
import { listenPool, planEpisode, planMs, scenesByTag, type Scene } from '../episode'

const mk = (id: string, items: string[], extra: Partial<Sentence> = {}): Sentence => ({
  id,
  en: `English ${id}`,
  chunks: items.map((i) => ({ np: i, en: i, dev: 'क', items: [i] })),
  tags: ['wife'],
  source: 'tutor',
  verified: true,
  ...extra,
})
const learned = (ids: string[]) => {
  const m = new Map<string, Card>()
  for (const id of ids) m.set(id, review(undefined, Rating.Good, new Date(2026, 10, 20)))
  return m
}

describe('listen pool', () => {
  it('sorts sentences into say, repeat, or left out', () => {
    const s = [
      mk('all', ['a', 'b']),
      mk('half', ['a', 'c']),
      mk('little', ['a', 'c', 'd']),
      mk('unverified', ['a'], { verified: false }),
      mk('chunu', ['a'], { verified: false, audioId: 'rec:1' }),
    ]
    const pool = listenPool(s, learned(['a', 'b']))
    expect(pool.get('all')).toBe('say')
    expect(pool.get('half')).toBe('repeat')
    expect(pool.has('little')).toBe(false)
    expect(pool.has('unverified')).toBe(false)
    expect(pool.get('chunu')).toBe('say')
  })
})

describe('episode plan', () => {
  const sentences = Array.from({ length: 12 }, (_, i) => mk('s' + i, ['a']))
  const byId = new Map(sentences.map((s) => [s.id, s]))
  const pool = listenPool(sentences, learned(['a']))
  const scenes: Scene[] = [
    { title: 'Dinner with Aama', intro: 'You are at dinner.', lines: sentences.slice(0, 6).map((s) => ({ id: s.id, cue: 'Cue.' })) },
    { title: 'Morning', intro: 'It is morning.', lines: sentences.slice(6).map((s) => ({ id: s.id, cue: '' })) },
  ]

  it('fills about the requested time and ends with the outro', () => {
    for (const minutes of [15, 30]) {
      const steps = planEpisode(scenes, pool, byId, minutes, () => 0.5)
      const ms = planMs(steps, byId)
      expect(ms).toBeGreaterThanOrEqual(minutes * 60_000 * 0.6)
      expect(ms).toBeLessThan(minutes * 60_000 + 90_000)
      expect(steps.at(-1)!.caption.scene).toBe('Done')
    }
  })

  it('asks before answering for known lines, and recalls earlier ones', () => {
    const steps = planEpisode(scenes, pool, byId, 15, () => 0)
    const i = steps.findIndex((st) => st.seg.kind === 'en' && st.seg.text.startsWith('How would you say'))
    expect(steps[i + 1].seg.kind).toBe('pause')
    expect(steps[i + 2].seg.kind).toBe('np')
    expect(steps.some((st) => st.caption.scene === 'Quick review')).toBe(true)
  })

  it('never speaks Nepali that is not in the deck', () => {
    const steps = planEpisode(
      [{ title: 'X', intro: 'Y', lines: [{ id: 'made-up', cue: '' }, { id: 's1', cue: '' }] }],
      pool,
      byId,
      15,
    )
    const ids = new Set(steps.flatMap((st) => (st.seg.kind === 'np' ? [st.seg.sentenceId] : [])))
    expect([...ids]).toEqual(['s1'])
  })

  it('falls back to scenes by tag', () => {
    const sc = scenesByTag(['s1', 's2'], byId)
    expect(sc[0].title).toBe('Wife')
    expect(sc[0].lines).toHaveLength(2)
  })
})
