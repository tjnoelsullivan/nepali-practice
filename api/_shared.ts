// Shared helpers for the /api functions. Files starting with "_" are not routes on Vercel.

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })
}

/**
 * If APP_ACCESS_CODE is set in Vercel, every request must carry it in the x-saathi-code header,
 * so strangers who find the URL can't spend TJ's Azure or Claude credits.
 */
export function denied(request: Request): Response | null {
  const code = process.env.APP_ACCESS_CODE
  if (!code) return null
  if (request.headers.get('x-saathi-code') === code) return null
  return json({ error: 'access-code' }, 401)
}

export function azure(): { key: string; region: string } | null {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  return key && region ? { key, region: region.trim().toLowerCase() } : null
}

/** Devanagari plus spaces and simple punctuation only, so the voice endpoint can't be used for arbitrary text. */
export const DEVANAGARI_TEXT = /^[ऀ-ॿ\s?!,.'"-]{1,300}$/
