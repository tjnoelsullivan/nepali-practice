import type { Chunk, Sentence } from './types'
import { sentenceNepali } from './types'

/** Lowercase, drop punctuation, collapse spaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokens(s: string): string[] {
  const n = normalize(s)
  return n ? n.split(' ') : []
}

/** Levenshtein distance with an early cap. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

/**
 * Romanized Nepali is spelled loosely. Treat small differences as a typo:
 * long/short vowels (aa/a, ii/i, uu/u), chh/ch, and one stray letter in words of 4+ letters.
 */
function loosen(t: string): string {
  return t.replace(/aa/g, 'a').replace(/ii/g, 'i').replace(/ee/g, 'i').replace(/uu/g, 'u').replace(/oo/g, 'u').replace(/chh/g, 'ch').replace(/w/g, 'v')
}

export function tokenMatches(expected: string, got: string): boolean {
  if (expected === got) return true
  const e = loosen(expected)
  const g = loosen(got)
  if (e === g) return true
  return e.length >= 4 && editDistance(e, g) <= 1
}

/** Longest common subsequence alignment; returns which expected tokens were matched. */
function align(expected: string[], got: string[]): boolean[] {
  const m = expected.length
  const n = got.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = tokenMatches(expected[i], got[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const matched = new Array(m).fill(false)
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (tokenMatches(expected[i], got[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) {
      matched[i] = true
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return matched
}

export type ChunkResult = { chunk: Chunk; ok: boolean }

export type NepaliGrade = {
  correct: boolean
  /** Fraction of expected words matched, 0..1 */
  score: number
  chunks: ChunkResult[]
  extraWords: number
  bestAnswer: string
}

/** Grade a typed or transcribed Nepali answer against the sentence and its accepted variants. */
export function gradeNepali(s: Sentence, answer: string): NepaliGrade {
  const got = tokens(answer)

  // Main answer, chunk by chunk.
  const chunkTokens = s.chunks.map((c) => tokens(c.np))
  const flat = chunkTokens.flat()
  const matched = align(flat, got)
  let k = 0
  const chunks: ChunkResult[] = s.chunks.map((chunk, ci) => {
    const n = chunkTokens[ci].length
    const ok = n === 0 || matched.slice(k, k + n).every(Boolean)
    k += n
    return { chunk, ok }
  })
  const hits = matched.filter(Boolean).length
  const mainScore = flat.length ? hits / flat.length : 1
  const extra = got.length - hits
  let correct = mainScore === 1 && extra <= 1

  // Alternate full answers: all-or-nothing.
  let bestAnswer = sentenceNepali(s)
  if (!correct) {
    for (const alt of s.npAlts ?? []) {
      const at = tokens(alt)
      const m = align(at, got)
      if (m.every(Boolean) && got.length - at.length <= 1) {
        correct = true
        bestAnswer = alt
        break
      }
    }
  }

  return {
    correct,
    score: correct ? 1 : mainScore,
    chunks: correct ? chunks.map((c) => ({ ...c, ok: true })) : chunks,
    extraWords: Math.max(0, extra),
    bestAnswer,
  }
}

const STOP = new Set(['a', 'an', 'the', 'to', 'is', 'are', 'am', 'do', 'does', 'did', 'will', 'please', 'of'])

const EXPAND: [RegExp, string][] = [
  [/\bi m\b/g, 'i am'],
  [/\byou re\b/g, 'you are'],
  [/\bwe re\b/g, 'we are'],
  [/\bthey re\b/g, 'they are'],
  [/\bit s\b/g, 'it is'],
  [/\bwhat s\b/g, 'what is'],
  [/\bdon t\b/g, 'do not'],
  [/\bdoesn t\b/g, 'does not'],
  [/\bdidn t\b/g, 'did not'],
  [/\bcan t\b/g, 'can not'],
  [/\bcannot\b/g, 'can not'],
  [/\bwon t\b/g, 'will not'],
  [/\bisn t\b/g, 'is not'],
  [/\baren t\b/g, 'are not'],
  [/\bi ll\b/g, 'i will'],
  [/\byou ll\b/g, 'you will'],
  [/\blet s\b/g, 'let us'],
]

function englishContent(s: string): string[] {
  let n = normalize(s.replace(/’/g, "'").replace(/'/g, ' '))
  for (const [re, rep] of EXPAND) n = n.replace(re, rep)
  return n.split(' ').filter((t) => t && !STOP.has(t))
}

export type EnglishGrade = { correct: boolean; score: number; closest: string }

/**
 * Local English check: content-word overlap against each accepted translation.
 * Meaning-based AI grading replaces this once the backend is connected; until then
 * the learner can override with "I was right".
 */
export function gradeEnglish(s: Sentence, answer: string): EnglishGrade {
  const got = englishContent(answer)
  let best = { correct: false, score: 0, closest: s.en }
  for (const accepted of [s.en, ...(s.enAlts ?? [])]) {
    const exp = englishContent(accepted)
    if (!exp.length) continue
    const m = align(exp, got).filter(Boolean).length
    const recall = m / exp.length
    const precision = got.length ? m / got.length : 0
    const score = (2 * recall * precision) / (recall + precision || 1)
    if (score > best.score) best = { correct: recall === 1 && precision >= 0.75, score, closest: accepted }
  }
  return best
}
