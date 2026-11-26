// Suggests everyday sentences Chunu might say to TJ, in English and romanized Nepali,
// for her to record. POST /api/suggest  { avoid: string[], topic?: string }
import Anthropic from '@anthropic-ai/sdk'
import { denied, json } from './_shared.js'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sentences'],
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['en', 'np'],
        properties: { en: { type: 'string' }, np: { type: 'string' } },
      },
    },
  },
}

const SYSTEM = `Suggest 8 short sentences that Chunu, TJ's Nepali wife, would naturally say to TJ during an ordinary day at home: mornings, meals and cooking, plans, errands, chores, feelings, phone calls with family, the nephews Ryan-dada, Aiden-dada and Siyon-dada, her parents Aama and Buwa. Spoken, warm, everyday Nepali as a couple speaks it, using timi for TJ.
TJ is a beginner (present tense, basic questions, about 200 words), so keep most sentences 3 to 7 words, with a few slightly longer. Mix questions, requests and statements.
np: romanized Nepali in TJ's house spelling: doubled long vowels (khaana, paani, malaai, timilaai), "chh" for छ, "w" for initial व (wahaa), postpositions attached (gharmaa, bajaarbaata), first word and names capitalized. Never Devanagari.
en: a natural English translation.
Don't repeat or closely paraphrase any sentence in the AVOID list. Chunu will say each one in her own words, so natural phrasing matters more than textbook phrasing.`

let client: Anthropic | null = null

export async function POST(request: Request): Promise<Response> {
  const no = denied(request)
  if (no) return no
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'claude-not-configured' }, 503)
  let b: { avoid?: unknown; topic?: unknown }
  try {
    b = await request.json()
  } catch {
    b = {}
  }
  const avoid = (Array.isArray(b.avoid) ? b.avoid : []).slice(0, 200).map((x) => String(x).slice(0, 120))
  const topic = String(b.topic ?? '').slice(0, 80)
  client ??= new Anthropic()
  try {
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${topic ? `Focus on: ${topic}\n` : ''}AVOID:\n${avoid.join('\n') || '(none)'}`,
        },
      ],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    if (msg.stop_reason === 'refusal') return json({ error: 'refused' }, 422)
    const text = msg.content.find((c) => c.type === 'text')
    if (!text || text.type !== 'text') return json({ error: 'empty' }, 502)
    const out = JSON.parse(text.text) as { sentences: { en: string; np: string }[] }
    return json({ sentences: out.sentences.filter((s) => s.np && !/[ऀ-ॿ]/.test(s.np)) })
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : 0
    return json({ error: 'claude', status }, 502)
  }
}
