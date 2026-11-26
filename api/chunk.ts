// Prepares one sentence that TJ recorded with Chunu: splits it into chunks with glosses and
// Devanagari (for speech matching), links known words, and translates it if no English was given.
// POST /api/chunk  { np, en?, known: { items, grammar } }
import Anthropic from '@anthropic-ai/sdk'
import { denied, json } from './_shared.js'

const str = { type: 'string' }
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['np', 'en', 'enAlts', 'chunks', 'tags', 'grammar', 'newItems', 'questions'],
  properties: {
    np: str,
    en: str,
    enAlts: { type: 'array', items: str },
    tags: { type: 'array', items: str },
    grammar: { type: 'array', items: str },
    chunks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['np', 'en', 'dev', 'itemId'],
        properties: { np: str, en: str, dev: str, itemId: str },
      },
    },
    newItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'np', 'en'],
        properties: { id: str, np: str, en: str },
      },
    },
    questions: { type: 'array', items: str },
  },
}

const SYSTEM = `You prepare one spoken Nepali sentence for TJ's practice app. TJ's wife Chunu recorded it; TJ typed it in romanized Nepali. TJ is a beginner who talks with their wife (timi), in-laws Aama and Buwa (tapaai) and nephews Ryan-dada, Aiden-dada, Siyon-dada.
- np: TJ's sentence with spelling normalized to the house style: doubled long vowels (khaana, paani, tapaai, malaai), "chh" for छ, "w" for initial व (wahaa), postpositions attached (gharmaa, timibhandaa), first word and names capitalized. Do not change words or grammar.
- en: if TJ gave an English meaning, keep it (fix only typos). Otherwise translate naturally. enAlts: 0-3 other natural translations.
- chunks: pieces a learner would look up; keep fixed phrases and compound verbs together (khaanu bhayo, gardai chhu, jaanu parchha). Punctuation is its own chunk with en "" and itemId "". Joining chunk np values with spaces (no space before punctuation) must give np. en: a short hint gloss. dev: the chunk in Devanagari as a Nepali speaker writes it ("." becomes "।"; Siyon is साइयन). itemId: reuse a known item id for the same word, else "w:<lemma>" and add it to newItems; names may use "".
- grammar: ids from the known grammar list that the sentence uses.
- tags: from wife, mother-in-law, father-in-law, in-laws, nephews, family, food, mealtime, plans, greeting.
- questions: anything unclear (a word you don't recognize, a possible typo, an English meaning that doesn't match). English with romanized Nepali only. Never guess silently.`

let client: Anthropic | null = null

export async function POST(request: Request): Promise<Response> {
  const no = denied(request)
  if (no) return no
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'claude-not-configured' }, 503)
  let b: { np?: string; en?: string; known?: { items?: { id: string; np: string; en: string }[]; grammar?: { id: string; pattern: string }[] } }
  try {
    b = await request.json()
  } catch {
    return json({ error: 'bad-json' }, 400)
  }
  const np = String(b?.np ?? '').trim().slice(0, 400)
  if (!np) return json({ error: 'bad-request' }, 400)
  const en = String(b?.en ?? '').trim().slice(0, 400)
  const known =
    'KNOWN ITEMS (id | np | en):\n' +
    (b.known?.items ?? []).slice(0, 1500).map((i) => `${i.id} | ${i.np} | ${i.en}`).join('\n') +
    '\n\nKNOWN GRAMMAR (id | pattern):\n' +
    (b.known?.grammar ?? []).slice(0, 400).map((g) => `${g.id} | ${g.pattern}`).join('\n')

  client ??= new Anthropic()
  try {
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: `${known}\n\nSENTENCE (romanized): ${np}\nENGLISH: ${en || '(not given)'}` }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    if (msg.stop_reason === 'refusal') return json({ error: 'refused' }, 422)
    const text = msg.content.find((c) => c.type === 'text')
    if (!text || text.type !== 'text') return json({ error: 'empty' }, 502)
    return json(JSON.parse(text.text))
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : 0
    return json({ error: 'claude', status }, 502)
  }
}
