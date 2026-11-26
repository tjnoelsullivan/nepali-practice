// Calls to the app's own /api functions, with the optional access code.

const CODE_KEY = 'saathi.accessCode'

export function getAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setAccessCode(code: string) {
  try {
    localStorage.setItem(CODE_KEY, code.trim())
  } catch {
    /* private mode */
  }
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const code = getAccessCode()
  if (code) headers.set('x-saathi-code', code)
  const r = await fetch(path, { ...init, headers })
  if (!r.ok) {
    let code = 'http-' + r.status
    try {
      code = ((await r.clone().json()) as { error?: string }).error ?? code
    } catch {
      /* not json */
    }
    throw new ApiError(r.status, code)
  }
  return r
}

/** A short explanation for the UI when a voice/AI call fails. */
export function explainError(e: unknown): string {
  if (!navigator.onLine) return 'You are offline.'
  if (e instanceof ApiError) {
    if (e.code === 'access-code') return 'Enter your access code in Library > Settings.'
    if (e.code === 'azure-not-configured') return 'Azure Speech keys are not set in Vercel yet.'
    if (e.code === 'claude-not-configured') return 'The Claude key is not set in Vercel yet.'
    if (e.status === 404) return 'Voice needs the deployed app (not available in this preview).'
    return `Server error (${e.code}).`
  }
  return 'Could not reach the server.'
}
