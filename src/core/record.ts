import { addToDay, type SaathiDB } from '../db'
import { dayKey } from './activity'
import { rateAttempt, review, type Attempt } from './schedule'

/** Save one attempt: update each item's FSRS card, log reviews, and bump sentence stats. */
export async function recordAttempt(d: SaathiDB, a: Attempt, now = new Date()) {
  const ratings = rateAttempt(a)
  await d.transaction('rw', [d.cards, d.reviews, d.sentenceStats, d.days], async () => {
    for (const [itemId, grade] of ratings) {
      const prev = await d.cards.get(itemId)
      const card = review(prev?.card, grade, now)
      await d.cards.put({ itemId, card })
      await d.reviews.add({
        itemId,
        sentenceId: a.sentence.id,
        rating: grade,
        hinted: a.sentence.chunks.some((c, i) => a.hinted.has(i) && c.items.includes(itemId)),
        at: now,
      })
    }
    const st = await d.sentenceStats.get(a.sentence.id)
    await d.sentenceStats.put({
      sentenceId: a.sentence.id,
      lastSeen: now,
      seen: (st?.seen ?? 0) + 1,
      correct: (st?.correct ?? 0) + (a.correct ? 1 : 0),
      npEnCorrect: (st?.npEnCorrect ?? 0) + (a.correct && a.direction === 'np-en' ? 1 : 0),
    })
    await addToDay(d, dayKey(now), { answers: 1 })
  })
  return ratings
}
