// Speaks a Nepali sentence with an Azure neural voice and returns MP3.
// GET /api/tts?text=<Devanagari>&voice=female|male&rate=normal|slow
// GET /api/tts?lang=en&text=<English>  (the narrator in Listen episodes)
// The same text always gives the same audio, so the CDN and the app cache it for a long time.
import { DEVANAGARI_TEXT, azure, denied, json } from './_shared.js'

const VOICES: Record<string, string> = { female: 'ne-NP-HemkalaNeural', male: 'ne-NP-SagarNeural' }
const NARRATOR = 'en-US-GuyNeural'
/** Plain English for the narrator: letters, digits, common punctuation. */
const ENGLISH_TEXT = /^[A-Za-z0-9\s?!,.'"’:;()-]{1,400}$/
const RATES: Record<string, string> = { normal: '-5%', slow: '-35%' }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function GET(request: Request): Promise<Response> {
  const no = denied(request)
  if (no) return no
  const az = azure()
  if (!az) return json({ error: 'azure-not-configured' }, 503)
  const url = new URL(request.url)
  const text = (url.searchParams.get('text') ?? '').trim()
  const english = url.searchParams.get('lang') === 'en'
  const voice = english ? NARRATOR : (VOICES[url.searchParams.get('voice') ?? 'female'] ?? VOICES.female)
  const rate = english ? '0%' : (RATES[url.searchParams.get('rate') ?? 'normal'] ?? RATES.normal)
  if (!(english ? ENGLISH_TEXT : DEVANAGARI_TEXT).test(text)) return json({ error: 'bad-text' }, 400)

  const lang = english ? 'en-US' : 'ne-NP'
  const ssml =
    `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}">` +
    `<prosody rate="${rate}">${esc(text)}</prosody></voice></speak>`
  const r = await fetch(`https://${az.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': az.key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'saathi',
    },
    body: ssml,
  })
  // The free tier allows about 20 voice requests a minute; pass that on so the app can wait and retry.
  if (r.status === 429) {
    const res = json({ error: 'azure-busy', status: 429 }, 429)
    res.headers.set('retry-after', r.headers.get('retry-after') ?? '10')
    return res
  }
  if (!r.ok) return json({ error: `azure-tts-${r.status}`, status: r.status }, 502)
  return new Response(await r.arrayBuffer(), {
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'private, max-age=31536000, immutable',
    },
  })
}
