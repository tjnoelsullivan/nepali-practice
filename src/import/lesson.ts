// Turns the /api/ingest result into deck content (items + sentences) and saves it.
import { addLesson, db, upsertContent } from '../db'
import { normalize } from '../core/grade'
import type { Chunk, Item, Sentence } from '../core/types'
import { sentenceNepali } from '../core/types'
import { api } from '../voice/api'

export type IngestChunk = { np: string; en: string; dev: string; itemId: string }
export type IngestSentence = {
  en: string
  enAlts: string[]
  chunks: IngestChunk[]
  tags: string[]
  fromSlides: boolean
  grammar: string[]
}
export type IngestResult = {
  title: string
  sentences: IngestSentence[]
  newItems: { id: string; np: string; en: string }[]
  newGrammar: { id: string; pattern: string; meaning: string }[]
  questions: string[]
}

export type LessonDraft = {
  title: string
  fileName: string
  items: Item[]
  sentences: Sentence[]
  /** Sentence ids that already exist in the deck (same Nepali); not added again. */
  duplicates: Set<string>
  questions: string[]
  problems: string[]
}

const PUNCT = /^[?.!,।]+$/
const DEV = /[ऀ-ॿ]/
const slug = (s: string) => normalize(s).replace(/ /g, '-').slice(0, 60)
const cleanId = (prefix: 'w:' | 'g:', id: string) => {
  const body = id.replace(/^[wg]:/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return body ? prefix + body : ''
}

export async function requestLesson(file: File, slides: string[][], known: { items: Item[] }): Promise<IngestResult> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 5 * 60_000)
  try {
    const r = await api('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        fileName: file.name,
        slides,
        known: {
          items: known.items.filter((i) => i.kind === 'word').map(({ id, np, en }) => ({ id, np, en })),
          grammar: known.items.filter((i) => i.kind === 'grammar').map(({ id, np }) => ({ id, pattern: np })),
        },
      }),
    })
    return (await r.json()) as IngestResult
  } finally {
    clearTimeout(timer)
  }
}

export function buildDraft(
  res: IngestResult,
  fileName: string,
  existing: { items: Map<string, Item>; sentences: Sentence[] },
): LessonDraft {
  const lessonSlug = slug(res.title || fileName.replace(/\.pptx$/i, '')) || 'lesson'
  const problems: string[] = []
  const items = new Map<string, Item>()
  for (const g of res.newGrammar ?? []) {
    const id = cleanId('g:', g.id)
    if (id && !existing.items.has(id))
      items.set(id, { id, kind: 'grammar', np: g.pattern, en: g.meaning, source: 'lesson', verified: true })
  }
  for (const w of res.newItems ?? []) {
    const id = cleanId('w:', w.id)
    if (id && !existing.items.has(id))
      items.set(id, { id, kind: 'word', np: w.np.toLowerCase(), en: w.en, source: 'lesson', verified: true })
  }
  const known = (id: string) => existing.items.has(id) || items.has(id)

  const have = new Map(existing.sentences.map((s) => [normalize(sentenceNepali(s)), s.id]))
  const sentences: Sentence[] = []
  const duplicates = new Set<string>()
  const ids = new Set<string>()
  for (const s of res.sentences ?? []) {
    const chunks: Chunk[] = []
    let ok = s.chunks.length > 0
    for (const c of s.chunks) {
      const np = c.np.trim()
      if (!np) continue
      if (PUNCT.test(np)) {
        chunks.push({ np: np.replace('।', '.'), en: '', dev: np === '.' ? '।' : np, items: [] })
        continue
      }
      if (!DEV.test(c.dev ?? '')) ok = false
      const itemId = c.itemId ? cleanId('w:', c.itemId) : ''
      chunks.push({ np, en: c.en.trim() || '?', dev: c.dev.trim(), items: itemId && known(itemId) ? [itemId] : [] })
    }
    if (!ok) {
      problems.push(`Skipped "${s.en}": the voice text was missing.`)
      continue
    }
    const grammar = (s.grammar ?? []).map((g) => cleanId('g:', g)).filter((g) => g && known(g))
    const last = [...chunks].reverse().find((c) => c.en)
    if (last) last.items.push(...grammar.filter((g) => !last.items.includes(g)))
    let id = `lesson:${lessonSlug}:${slug(s.en)}`
    while (ids.has(id)) id += '-2'
    ids.add(id)
    const sentence: Sentence = {
      id,
      en: s.en.trim(),
      enAlts: s.enAlts?.length ? s.enAlts : undefined,
      chunks,
      tags: s.tags ?? [],
      source: 'lesson',
      verified: !!s.fromSlides,
    }
    if (have.has(normalize(sentenceNepali(sentence)))) duplicates.add(id)
    sentences.push(sentence)
  }
  return {
    title: res.title || fileName,
    fileName,
    items: [...items.values()],
    sentences,
    duplicates,
    questions: res.questions ?? [],
    problems,
  }
}

/** Save the approved sentences. Learning history is never touched. */
export async function saveLesson(draft: LessonDraft, chosen: Set<string>) {
  const sentences = draft.sentences.filter((s) => chosen.has(s.id) && !draft.duplicates.has(s.id))
  const used = new Set(sentences.flatMap((s) => s.chunks.flatMap((c) => c.items)))
  const items = draft.items.filter((i) => used.has(i.id))
  await upsertContent(db, items, sentences)
  await addLesson(db, {
    id: 'lesson:' + slug(draft.title) + ':' + Date.now(),
    title: draft.title,
    fileName: draft.fileName,
    importedAt: new Date(),
    sentenceIds: sentences.map((s) => s.id),
    questions: draft.questions,
  })
  return sentences.length
}
