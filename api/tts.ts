// Speaks a Nepali sentence with an Azure neural voice and returns MP3.
// GET /api/tts?text=<Devanagari>&voice=female|male&rate=normal|slow
// The same text always gives the same audio, so the CDN and the app cache it for a long time.
import { DEVANAGARI_TEXT, azure, denied, json } from './_shared.js'

const VOICES: Record<string, string> = { female: 'ne-NP-HemkalaNeural', male: 'ne-NP-SagarNeural' }
const RATES: Record<string, string> = { normal: '-5%', slow: '-35%' }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function GET(request: Request): Promise<Response> {
  const no = denied(request)
  if (no) return no
  const az = azure()
  if (!az) return json({ error: 'azure-not-configured' }, 503)
  const url = new URL(request.url)
  const text = (url.searchParams.get('text') ?? '').trim()
  const voice = VOICES[url.searchParams.get('voice') ?? 'female'] ?? VOICES.female
  const rate = RATES[url.searchParams.get('rate') ?? 'normal'] ?? RATES.normal
  if (!DEVANAGARI_TEXT.test(text)) return json({ error: 'bad-text' }, 400)

  const ssml =
    `<speak version="1.0" xml:lang="ne-NP"><voice name="${voice}">` +
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
  if (!r.ok) return json({ error: 'azure-tts', status: r.status }, 502)
  return new Response(await r.arrayBuffer(), {
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'private, max-age=31536000, immutable',
    },
  })
}
