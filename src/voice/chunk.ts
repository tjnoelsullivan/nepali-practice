import { db, upsertContent, type Recording } from '../db'
import type { Item, Sentence } from '../core/types'
import { newWordItems, toSentence, type IngestSentence } from '../import/lesson'
import { api } from './api'

type ChunkResult = IngestSentence & { np: string; newItems: { id: string; np: string; en: string }[]; questions: string[] }

/** Save a recording of Chunu with its sentence. Claude splits it into chunks (and translates if needed). */
export async function saveRecording(
  rec: { blob: Blob; mime: string; durationMs: number },
  np: string,
  en: string,
  items: Map<string, Item>,
): Promise<{ sentence: Sentence; questions: string[] }> {
  const r = await api('/api/chunk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      np,
      en,
      known: {
        items: [...items.values()].filter((i) => i.kind === 'word').map(({ id, np, en }) => ({ id, np, en })),
        grammar: [...items.values()].filter((i) => i.kind === 'grammar').map(({ id, np }) => ({ id, pattern: np })),
      },
    }),
  })
  const res = (await r.json()) as ChunkResult
  const data = await rec.blob.arrayBuffer()
  const id = 'wife:' + Date.now()
  const newItems = newWordItems(res.newItems ?? [], items, 'wife')
  const known = (x: string) => items.has(x) || newItems.some((i) => i.id === x)
  // Chunu said it, so the Nepali is right; only Claude's translation (when TJ left English blank) is unverified.
  const s = toSentence({ ...res, fromSlides: !!en.trim() }, id, 'wife', known)
  if (!s) throw new Error('Could not prepare this sentence. Check the spelling and try again.')
  const tags = s.tags.includes('wife') ? s.tags : ['wife', ...s.tags]
  const recording: Recording = {
    id: 'rec:' + Date.now(),
    sentenceId: id,
    createdAt: new Date(),
    data,
    mime: rec.mime,
    durationMs: rec.durationMs,
  }
  const sentence: Sentence = { ...s, tags, audioId: recording.id }
  const used = new Set(sentence.chunks.flatMap((c) => c.items))
  await db.recordings.put(recording)
  await upsertContent(db, newItems.filter((i) => used.has(i.id)), [sentence])
  return { sentence, questions: res.questions ?? [] }
}

/** Remove a recording and its sentence. Word progress is kept. */
export async function deleteRecording(rec: Recording) {
  await db.transaction('rw', db.recordings, db.sentences, async () => {
    await db.recordings.delete(rec.id)
    await db.sentences.delete(rec.sentenceId)
  })
}
