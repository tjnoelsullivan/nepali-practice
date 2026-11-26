// Arranges sentences TJ already knows into short real-life scenes for a Listen episode.
// POST /api/scenes  { sentences: [{ id, en, tags }] }  ->  { scenes: [{ title, intro, lines: [{ id, cue }] }] }
// Claude only writes English narration and picks sentence ids. All Nepali comes from TJ's own
// (tutor-checked) deck, so nothing new and unchecked is spoken in Nepali.
import Anthropic from '@anthropic-ai/sdk'
import { denied, json } from './_shared.js'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scenes'],
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'intro', 'lines'],
        properties: {
          title: { type: 'string' },
          intro: { type: 'string' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'cue'],
              properties: { id: { type: 'string' }, cue: { type: 'string' } },
            },
          },
        },
      },
    },
  },
}

const SYSTEM = `You write the English narration for an audio Nepali lesson, in the style of Pimsleur: TJ listens while driving and practices speaking with family. TJ's wife is Chunu (they use timi). Her parents are Aama and Buwa (TJ uses tapaai). Her sister's sons are Ryan-dada, Aiden-dada and Siyon-dada.

You get a list of sentences TJ has learned, each with an id, its English meaning and tags. Group them into short, believable scenes from family life (a meal at Aama and Buwa's, a morning at home with Chunu, planning the weekend, a phone call, the nephews visiting). Order the lines so the scene flows like a real conversation.

- title: 2 to 5 words, like "Dinner with Aama".
- intro: one or two short sentences the narrator says to set the scene. Plain spoken English.
- lines: the sentence ids in order. Use only ids from the list. A sentence may appear in at most one scene.
- cue: a short English stage direction before the line, at most 12 words, such as "Aama sets down a plate in front of you." or "Chunu asks about your plans." It must fit the sentence's meaning without restating it, because the English sentence is read right after the cue. Use "" when no cue is needed.

Make 3 to 8 lines per scene and use as many of the sentences as fit naturally. Skip sentences that don't fit any scene. Narration must be plain English with no Nepali words except names (Chunu, Aama, Buwa, Ryan-dada, Aiden-dada, Siyon-dada).`

let client: Anthropic | null = null

type In = { id: string; en: string; tags: string[] }

export async function POST(request: Request): Promise<Response> {
  const no = denied(request)
  if (no) return no
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'claude-not-configured' }, 503)
  let b: { sentences?: unknown }
  try {
    b = await request.json()
  } catch {
    return json({ error: 'bad-request' }, 400)
  }
  const list: In[] = (Array.isArray(b.sentences) ? b.sentences : []).slice(0, 120).map((s: Record<string, unknown>) => ({
    id: String(s.id ?? '').slice(0, 80),
    en: String(s.en ?? '').slice(0, 200),
    tags: (Array.isArray(s.tags) ? s.tags : []).slice(0, 6).map((t: unknown) => String(t).slice(0, 30)),
  }))
  if (!list.length) return json({ error: 'no-sentences' }, 400)
  const ids = new Set(list.map((s) => s.id))
  client ??= new Anthropic()
  try {
    const msg = await client.beta.messages
      .stream({
        model: 'claude-opus-5-5',
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(list) }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })
      .finalMessage()
    if (msg.stop_reason === 'refusal') return json({ error: 'refused' }, 422)
    const text = msg.content.find((c) => c.type === 'text')
    if (!text || text.type !== 'text') return json({ error: 'empty' }, 502)
    const out = JSON.parse(text.text) as { scenes: { title: string; intro: string; lines: { id: string; cue: string }[] }[] }
    const used = new Set<string>()
    const clean = (t: string) => t.replace(/[^A-Za-z0-9\s?!,.'"’:;()-]/g, '').trim().slice(0, 300)
    const scenes = out.scenes
      .map((sc) => ({
        title: clean(sc.title).slice(0, 60),
        intro: clean(sc.intro),
        lines: sc.lines
          .filter((l) => ids.has(l.id) && !used.has(l.id) && used.add(l.id))
          .map((l) => ({ id: l.id, cue: clean(l.cue).slice(0, 120) })),
      }))
      .filter((sc) => sc.lines.length > 0)
    return json({ scenes })
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : 0
    return json({ error: 'claude', status }, 502)
  }
}
