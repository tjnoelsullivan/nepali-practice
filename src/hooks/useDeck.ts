import { useCallback, useEffect, useState } from 'react'
import type { Card } from 'ts-fsrs'
import { db, loadCards, type SentenceStat } from '../db'
import type { Item, Sentence } from '../core/types'

export type Deck = {
  ready: boolean
  items: Map<string, Item>
  sentences: Sentence[]
  cards: Map<string, Card>
  stats: Map<string, SentenceStat>
  reviewsToday: number
  flagCount: number
  refresh: () => Promise<void>
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function useDeck(): Deck {
  const [state, setState] = useState<Omit<Deck, 'refresh'>>({
    ready: false,
    items: new Map(),
    sentences: [],
    cards: new Map(),
    stats: new Map(),
    reviewsToday: 0,
    flagCount: 0,
  })

  const refresh = useCallback(async () => {
    const [items, sentences, cards, stats, reviewsToday, flagCount] = await Promise.all([
      db.items.toArray(),
      db.sentences.toArray(),
      loadCards(db),
      db.sentenceStats.toArray(),
      db.reviews.where('at').aboveOrEqual(startOfToday()).count(),
      db.flags.count(),
    ])
    setState({
      ready: true,
      items: new Map(items.map((i) => [i.id, i])),
      sentences,
      cards,
      stats: new Map(stats.map((s) => [s.sentenceId, s])),
      reviewsToday,
      flagCount,
    })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh }
}
