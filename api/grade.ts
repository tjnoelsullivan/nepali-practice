// Second opinion on an answer the app's own matcher marked wrong.
// POST /api/grade  { direction, prompt, expected[], answer, heard? }
// Uses Claude to decide whether the answer means the same thing. Feedback is in English with
// romanized Nepali only (TJ's spelling: chha, tapaai, malaai, timi), never Devanagari.
import Anthropic from '@anthropic-ai/sdk'
import { denied, json } from './_shared.js'

type Body = {
  direction: 'en-np' | 'np-en'
  prompt: string
  expected: string[]
  answer: string
  heard?: string
  register?: string
}

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['correct', 'close', 'wrong'] },
    feedback: { type: 'string' },
  },
  required: ['verdict', 'feedback'],
  additionalProperties: false,
}

const SYSTEM = `You grade answers in a Nepali practice app for an English-speaking learner, TJ (beginner: present tense and basic questions), who talks with their Nepali wife (timi) and in-laws (tapaai).
Decide if the learner's answer means the same as the reference answers, in the same politeness level.
- "correct": same meaning and acceptable Nepali/English. Ignore romanization spelling differences (aa/a, chh/ch, ii/i, w/v), capitalization, punctuation and small typos.
- "close": meaning is right but there is one real mistake worth fixing (wrong honorific level, wrong tense, a missing postposition, a wrong word ending).
- "wrong": different meaning, or missing a key part.
For spoken answers you get what speech recognition heard in Devanagari; recognition is imperfect, so be generous with sounds that are easy to mishear.
feedback: one short sentence in English. Write any Nepali in romanized form using these spellings: chha, tapaai, malaai, timi, haami, paani (doubled vowels for long sounds). Never write Devanagari. If unsure whether something is acceptable Nepali, say so rather than guessing.`

let client: Anthropic | null = null

export async function POST(request: Request): Promise<Response> {
  const no = denied(request)
  if (no) return no
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'claude-not-configured' }, 503)

  let b: Body
  try {
    b = (await request.json()) as Body
  } catch {
    return json({ error: 'bad-json' }, 400)
  }
  const clip = (s: unknown, n = 300) => String(s ?? '').slice(0, n)
  if (!b || !Array.isArray(b.expected) || !b.answer) return json({ error: 'bad-request' }, 400)

  const task =
    b.direction === 'np-en'
      ? `Nepali sentence shown: ${clip(b.prompt)}\nReference English: ${b.expected.slice(0, 6).map((x) => clip(x)).join(' | ')}\nLearner's English: ${clip(b.answer)}`
      : `English sentence shown: ${clip(b.prompt)}\nReference Nepali (romanized): ${b.expected.slice(0, 6).map((x) => clip(x)).join(' | ')}\n` +
        (b.heard ? `Speech recognition heard (Devanagari): ${clip(b.heard)}\nThat roughly reads as: ${clip(b.answer)}` : `Learner typed (romanized): ${clip(b.answer)}`) +
        (b.register ? `\nSpeaking to: ${clip(b.register, 60)}` : '')

  client ??= new Anthropic()
  try {
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: task }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    if (msg.stop_reason === 'refusal') return json({ verdict: 'unknown', feedback: '' })
    const text = msg.content.find((c) => c.type === 'text')
    if (!text || text.type !== 'text') return json({ verdict: 'unknown', feedback: '' })
    const out = JSON.parse(text.text) as { verdict: string; feedback: string }
    return json({ verdict: out.verdict, feedback: out.feedback.replace(/[ऀ-ॿ]+/g, '').trim() })
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : 0
    return json({ error: 'claude', status }, 502)
  }
}
