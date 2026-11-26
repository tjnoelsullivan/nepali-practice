// Turns the text of a tutor's slide deck into practice sentences.
// POST /api/ingest  { fileName, slides: string[][], known: { items, grammar } }
// Returns sentences split into chunks (romanized Nepali in TJ's spelling, English gloss,
// Devanagari for the voice), any new words and grammar, and questions for the tutor.
import Anthropic from '@anthropic-ai/sdk'
import { denied, json } from './_shared.js'

const str = { type: 'string' }
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'sentences', 'newItems', 'newGrammar', 'questions'],
  properties: {
    title: str,
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['en', 'enAlts', 'chunks', 'tags', 'fromSlides', 'grammar'],
        properties: {
          en: str,
          enAlts: { type: 'array', items: str },
          fromSlides: { type: 'boolean' },
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
        },
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
    newGrammar: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'pattern', 'meaning'],
        properties: { id: str, pattern: str, meaning: str },
      },
    },
    questions: { type: 'array', items: str },
  },
}

const SYSTEM = `You turn a Nepali tutor's lesson slides into practice sentences for TJ, an English speaker learning conversational Nepali to talk with their wife and in-laws. Beginner level: present tense and basic questions, about 200 words, growing each lesson.

OUTPUT RULES
1. Sentences from the slides (fromSlides: true): every Nepali example sentence that has, or clearly implies, an English meaning. Keep the tutor's Nepali; only normalize spelling (rule 3). Do not "fix" the tutor's grammar. Skip headings, instructions and vocabulary-only lists (those words go in newItems).
2. Family sentences (fromSlides: false): add 3 to 6 short sentences that use this lesson's new words or grammar in TJ's real life. Context: wife Chunu (timi), mother-in-law Aama and father-in-law Buwa (tapaai, honorific verbs), nephews Ryan-dada, Aiden-dada, Siyon-dada (timi; they are TJ's wife's sister's sons, bhanja). Common topics: food, plans, the nephews. Only use grammar that appears in the slides or the known list. These are marked unverified for the tutor.
3. Romanization, TJ's house spelling: long vowels doubled (aa, ii, uu: khaana, paani, tapaai, malaai, timilaai), "chh" for छ (chha, chhu, chhan), "ch" for च, "w" for व at word start (wahaa, wuni), "sh" for श/ष. Postpositions attach to the word (gharmaa, Kathmandubaata, aamaasanga, timibhandaa). Capitalize only the first word and names.
4. Chunks: split each Nepali sentence into the pieces a learner would look up. Usually one word per chunk, but keep fixed phrases and compound verbs together as one chunk (khaanu bhayo, gardai chhu, jaanu parchha, belaa bhayo, mero laagi, chha baje). A punctuation mark is its own chunk with en "" and itemId "" (",", "?", "."). Joining the chunk np values with spaces (no space before punctuation) must give the sentence.
   - en: a short gloss for a hint chip ("to me (+ laai)", "eat (honorific past)").
   - dev: the chunk in Devanagari, exactly what a Nepali speaker would write, for text-to-speech. For "." use "।". Names keep their sound: Ryan रायन, Aiden एडेन, Siyon साइयन (sounds like "Cyan"), Chunu चुनु, TJ टीजे.
   - itemId: the vocabulary item this chunk practices. Reuse an id from the known items when it is the same word (any form of it); otherwise invent "w:<lemma>" and add it to newItems with the lemma (np) and meaning (en). Names and pure particles may use "".
5. grammar: ids of grammar patterns the sentence uses, from the known grammar list, or new ones you add to newGrammar as "g:<short-kebab-name>" with pattern (romanized) and meaning.
6. tags: who/where it is used, from: wife, mother-in-law, father-in-law, in-laws, nephews, family, food, mealtime, plans, greeting.
7. enAlts: 0 to 3 other natural English translations.
8. questions: anything you are unsure of (a word whose meaning the slides don't make clear, a sentence that looks like a typo, an honorific level you had to guess). Write them for TJ to ask the tutor, in English with romanized Nepali only. Never guess silently: if a sentence's meaning is unclear, leave it out and ask.
title: a short lesson title from the slides.`

let client: Anthropic | null = null

type Body = {
  fileName?: string
  slides: string[][]
  known?: { items?: { id: string; np: string; en: string }[]; grammar?: { id: string; pattern: string }[] }
}

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
  if (!Array.isArray(b?.slides) || !b.slides.length) return json({ error: 'bad-request' }, 400)

  const slidesText = b.slides
    .map((lines, i) => `--- Slide ${i + 1}\n${(Array.isArray(lines) ? lines : []).map((l) => String(l)).join('\n')}`)
    .join('\n')
    .slice(0, 60_000)
  const known = b.known ?? {}
  const knownText =
    'KNOWN ITEMS (id | np | en):\n' +
    (known.items ?? []).slice(0, 1500).map((i) => `${i.id} | ${i.np} | ${i.en}`).join('\n') +
    '\n\nKNOWN GRAMMAR (id | pattern):\n' +
    (known.grammar ?? []).slice(0, 400).map((g) => `${g.id} | ${g.pattern}`).join('\n')

  client ??= new Anthropic()
  try {
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 32_000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${knownText}\n\nLESSON FILE: ${String(b.fileName ?? 'lesson').slice(0, 120)}\n\n${slidesText}`,
        },
      ],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    const msg = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') return json({ error: 'refused' }, 422)
    if (msg.stop_reason === 'max_tokens') return json({ error: 'too-long' }, 422)
    const text = msg.content.find((c) => c.type === 'text')
    if (!text || text.type !== 'text') return json({ error: 'empty' }, 502)
    return json(JSON.parse(text.text))
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : 0
    return json({ error: 'claude', status }, 502)
  }
}
