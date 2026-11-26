import type { Sentence } from './types'

/**
 * Loose form of Devanagari for comparing what speech recognition heard with what was expected.
 * Speech recognition often differs in long/short vowels, nasal marks and similar consonants.
 */
export function looseDev(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[^ऀ-ॿ]/g, '')
    .replace(/[।॥]/g, '')
    .replace(/[ँंः़]/g, '')
    .replace(/ी/g, 'ि')
    .replace(/ू/g, 'ु')
    .replace(/ई/g, 'इ')
    .replace(/ऊ/g, 'उ')
    .replace(/[शष]/g, 'स')
    .replace(/व/g, 'ब')
    .replace(/ण/g, 'न')
    .replace(/[ऋृ]/g, 'रि')
}

/**
 * Aligns the expected string with what was heard (edit distance with traceback) and returns,
 * for each expected character, how many edits landed on it. Extra heard characters count
 * against the expected character after them.
 */
function alignCosts(exp: string, got: string): { total: number; perChar: number[] } {
  const m = exp.length
  const n = got.length
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (exp[i - 1] === got[j - 1] ? 0 : 1))
  const perChar = new Array(m).fill(0)
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (exp[i - 1] === got[j - 1] ? 0 : 1)) {
      if (exp[i - 1] !== got[j - 1]) perChar[i - 1]++
      i--
      j--
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      perChar[i - 1]++
      i--
    } else {
      perChar[Math.min(i, m - 1)]++
      j--
    }
  }
  return { total: d[m][n], perChar }
}

export type SpokenGrade = {
  correct: boolean
  score: number
  chunks: { ok: boolean }[]
}

/** Grades a speech-recognition result (Devanagari) against a sentence's Devanagari chunks. */
export function gradeSpoken(s: Sentence, heard: string): SpokenGrade {
  const h = looseDev(heard)
  const parts = s.chunks.map((c) => (c.en ? looseDev(c.dev ?? '') : ''))
  const expected = parts.join('')
  if (!expected) return { correct: false, score: 0, chunks: parts.map(() => ({ ok: false })) }
  const { total, perChar } = alignCosts(expected, h)
  let at = 0
  const chunks = parts.map((p) => {
    const errs = perChar.slice(at, at + p.length).reduce((a, b) => a + b, 0)
    at += p.length
    if (!p) return { ok: true }
    const allowed = p.length >= 6 ? 2 : p.length >= 3 ? 1 : 0
    return { ok: errs <= allowed }
  })
  const score = Math.max(0, 1 - total / expected.length)
  return { correct: chunks.every((c) => c.ok) && score >= 0.75, score, chunks }
}

// ---- Devanagari -> romanized, in TJ's house style (chha, tapaai, paani), for "You said ..."

const CONS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'ng', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'ny',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'w',
  श: 'sh', ष: 'sh', स: 's', ह: 'h',
}
const VOWEL: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au',
}
const SIGN: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
}
const DIGIT = '०१२३४५६७८९'

function romanWord(w: string): string {
  const ch = [...w.normalize('NFC').replace(/़/g, '')]
  let out = ''
  let aksharas = 0
  let dropped = false
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i]
    const next = ch[i + 1]
    if (CONS[c]) {
      aksharas++
      out += CONS[c]
      if (next === '्') {
        i++
      } else if (next && SIGN[next]) {
        out += SIGN[next]
        i++
      } else {
        const atEnd = i === ch.length - 1 || (/[ँंः]/.test(next ?? '') && i === ch.length - 2)
        const conjunct = ch[i - 1] === '्'
        // Nepali drops a final inherent "a" (ghar, naam) except in one-letter words (ma, chha)
        // and after a conjunct (hunchha, manparchha).
        if (atEnd) {
          if (!(aksharas > 1 && !conjunct)) out += 'a'
          dropped = false
        } else {
          // Medial: drop "a" between two full syllables (man-parchha, harek-din). Rough rule.
          const nextHasVowel = !!CONS[next] && ch[i + 2] !== '्'
          if (aksharas > 1 && !dropped && nextHasVowel && !conjunct) {
            dropped = true
          } else {
            out += 'a'
            dropped = false
          }
        }
        continue
      }
      dropped = false
    } else if (VOWEL[c]) {
      aksharas++
      out += VOWEL[c]
    } else if (c === 'ं' || c === 'ँ') {
      // House style leaves nasal marks out (tapaai, kahaa, hudaa), except "ng" before g/k (sanga).
      if (c === 'ँ' && /[गक]/.test(next ?? '')) out += 'n'
    } else if (c === 'ः') {
      out += 'h'
    } else if (DIGIT.includes(c)) {
      out += String(DIGIT.indexOf(c))
    } else if (c !== 'ँ' && !/[ऀ-ॿ]/.test(c)) {
      out += c
    }
  }
  return out
}

export function romanize(dev: string): string {
  const r = dev
    .replace(/।/g, '.')
    .split(/(\s+)/)
    .map((w) => (/\s/.test(w) ? w : romanWord(w)))
    .join('')
  return r.charAt(0).toUpperCase() + r.slice(1)
}
