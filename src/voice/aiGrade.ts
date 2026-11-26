import { api } from './api'

export type AiVerdict = { verdict: 'correct' | 'close' | 'wrong' | 'unknown'; feedback: string }

export async function aiGrade(body: {
  direction: 'en-np' | 'np-en'
  prompt: string
  expected: string[]
  answer: string
  heard?: string
  register?: string
}): Promise<AiVerdict> {
  if (!navigator.onLine) return { verdict: 'unknown', feedback: '' }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 12_000)
  try {
    const r = await api('/api/grade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    return (await r.json()) as AiVerdict
  } catch {
    return { verdict: 'unknown', feedback: '' }
  } finally {
    clearTimeout(timer)
  }
}
