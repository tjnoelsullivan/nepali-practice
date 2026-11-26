import type { Flag, Sentence } from './core/types'
import { sentenceNepali } from './core/types'

export type TutorQuestion = { q: string; from: string }

/** Plain text TJ can paste into a message to the tutor. Nepali is romanized, like everything else in the app. */
export function tutorListText(
  unverified: Sentence[],
  flags: (Flag & { sentence?: Sentence })[],
  questions: TutorQuestion[],
  now = new Date(),
): string {
  const out: string[] = [`Saathi: things to check (${now.toLocaleDateString()})`]
  if (unverified.length) {
    out.push('', 'Are these correct? (written by the app, not by you)')
    unverified.forEach((s, i) => out.push(`${i + 1}. ${sentenceNepali(s)}  =  ${s.en}`))
  }
  if (flags.length) {
    out.push('', 'I answered these differently from the app. Was my answer OK?')
    flags.forEach((f, i) => {
      const s = f.sentence
      const prompt = s ? (f.direction === 'en-np' ? s.en : sentenceNepali(s)) : '(sentence removed)'
      const expected = s ? (f.direction === 'en-np' ? sentenceNepali(s) : s.en) : ''
      out.push(`${i + 1}. ${prompt}`, `   Mine: ${f.answer}`, ...(expected ? [`   App's: ${expected}`] : []))
    })
  }
  if (questions.length) {
    out.push('', 'Questions from the lessons')
    questions.forEach((q, i) => out.push(`${i + 1}. ${q.q} (${q.from})`))
  }
  if (out.length === 1) out.push('', 'Nothing to check right now.')
  return out.join('\n')
}
