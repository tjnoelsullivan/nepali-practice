import { useEffect, useRef, useState } from 'react'
import { db, type Lesson } from '../db'
import type { Deck } from '../hooks/useDeck'
import { sentenceNepali } from '../core/types'
import { buildDraft, requestLesson, saveLesson, type LessonDraft } from '../import/lesson'
import { extractSlides } from '../import/pptx'
import { explainError } from '../voice/api'

type State =
  | { step: 'idle' }
  | { step: 'reading'; name: string }
  | { step: 'asking'; name: string; slides: number; started: number }
  | { step: 'preview'; draft: LessonDraft; chosen: Set<string> }
  | { step: 'saving' }
  | { step: 'done'; added: number; title: string }
  | { step: 'error'; message: string }

export function LessonImport({ deck }: { deck: Deck }) {
  const [state, setState] = useState<State>({ step: 'idle' })
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [, tick] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const loadLessons = () => db.lessons.orderBy('importedAt').reverse().toArray().then(setLessons)
  useEffect(() => {
    void loadLessons()
  }, [])
  useEffect(() => {
    if (state.step !== 'asking') return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [state.step])

  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      setState({ step: 'reading', name: file.name })
      const slides = await extractSlides(file)
      if (!slides.length) throw new Error('No text found in this file.')
      setState({ step: 'asking', name: file.name, slides: slides.length, started: Date.now() })
      const res = await requestLesson(file, slides, { items: [...deck.items.values()] })
      const draft = buildDraft(res, file.name, { items: deck.items, sentences: deck.sentences })
      const chosen = new Set(draft.sentences.filter((s) => !draft.duplicates.has(s.id)).map((s) => s.id))
      setState({ step: 'preview', draft, chosen })
    } catch (e) {
      const message =
        e instanceof Error && !('status' in e) && navigator.onLine
          ? e.name === 'AbortError'
            ? 'That took too long. Try again, or split the deck into smaller files.'
            : e.message
          : explainError(e)
      setState({ step: 'error', message })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const save = async () => {
    if (state.step !== 'preview') return
    const { draft, chosen } = state
    setState({ step: 'saving' })
    const added = await saveLesson(draft, chosen)
    await deck.refresh()
    await loadLessons()
    setState({ step: 'done', added, title: draft.title })
  }

  const toggle = (id: string) => {
    if (state.step !== 'preview') return
    const chosen = new Set(state.chosen)
    if (chosen.has(id)) chosen.delete(id)
    else chosen.add(id)
    setState({ ...state, chosen })
  }

  const openQuestions = lessons.flatMap((l) => l.questions.map((q) => ({ q, title: l.title })))

  return (
    <section className="card lesson-import">
      <h2>Tutor lessons</h2>

      {state.step === 'idle' || state.step === 'done' || state.step === 'error' ? (
        <>
          <p className="muted">
            Add your tutor's slides (.pptx). New sentences, words and grammar join your deck. Your progress stays as it
            is.
          </p>
          {state.step === 'done' && (
            <p className="ok-note small">
              Added {state.added} {state.added === 1 ? 'sentence' : 'sentences'} from "{state.title}". They'll start
              showing up in practice.
            </p>
          )}
          {state.step === 'error' && <p className="voice-error small">{state.message}</p>}
          <label className="cta small-cta file-btn">
            <input
              ref={input}
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            Add a lesson
          </label>
        </>
      ) : state.step === 'reading' ? (
        <p className="muted">Reading {state.name}…</p>
      ) : state.step === 'asking' ? (
        <div className="working">
          <div className="spinner" aria-hidden="true" />
          <p className="muted">
            Turning {state.slides} slides into sentences… {Math.round((Date.now() - state.started) / 1000)}s
            <br />
            <small>This usually takes one to three minutes. Keep the app open.</small>
          </p>
        </div>
      ) : state.step === 'saving' ? (
        <p className="muted">Saving…</p>
      ) : (
        <Preview state={state} toggle={toggle} onSave={() => void save()} onCancel={() => setState({ step: 'idle' })} />
      )}

      {lessons.length > 0 && (
        <div className="lesson-list">
          <p className="eyebrow">Imported</p>
          {lessons.map((l) => (
            <div key={l.id} className="row">
              <div>
                <div className="row-np">{l.title}</div>
                <div className="muted small">
                  {new Date(l.importedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
                  {l.sentenceIds.length} sentences
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {openQuestions.length > 0 && (
        <details className="questions">
          <summary>Questions for your tutor · {openQuestions.length}</summary>
          <ul>
            {openQuestions.map((x, i) => (
              <li key={i}>
                {x.q} <span className="muted small">({x.title})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function Preview({
  state,
  toggle,
  onSave,
  onCancel,
}: {
  state: { draft: LessonDraft; chosen: Set<string> }
  toggle: (id: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const { draft, chosen } = state
  const count = draft.sentences.filter((s) => chosen.has(s.id) && !draft.duplicates.has(s.id)).length
  const words = draft.items.filter((i) => i.kind === 'word').length
  const grammar = draft.items.length - words
  return (
    <div className="preview">
      <p className="row-np">{draft.title}</p>
      <p className="muted small">
        {draft.sentences.length} sentences · {words} new {words === 1 ? 'word' : 'words'} · {grammar} new grammar{' '}
        {grammar === 1 ? 'pattern' : 'patterns'}. Untick anything you
        don't want.
      </p>
      <div className="list">
        {draft.sentences.map((s) => {
          const dup = draft.duplicates.has(s.id)
          return (
            <label key={s.id} className={'row pick' + (dup ? ' dup' : '')}>
              <input type="checkbox" checked={!dup && chosen.has(s.id)} disabled={dup} onChange={() => toggle(s.id)} />
              <div>
                <div className="row-np">{sentenceNepali(s)}</div>
                <div className="muted small">{s.en}</div>
              </div>
              {dup ? (
                <span className="chip">Already in deck</span>
              ) : s.verified ? (
                <span className="chip">From slides</span>
              ) : (
                <span className="chip warn">Suggested</span>
              )}
            </label>
          )
        })}
      </div>
      {draft.questions.length > 0 && (
        <div className="questions">
          <p className="eyebrow">To check with your tutor</p>
          <ul>
            {draft.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {draft.problems.map((p, i) => (
        <p key={i} className="voice-error small">
          {p}
        </p>
      ))}
      <p className="muted small">"Suggested" sentences were written for your family and are unverified until your tutor checks them.</p>
      <div className="btn-row">
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="cta small-cta" onClick={onSave} disabled={count === 0}>
          Add {count} {count === 1 ? 'sentence' : 'sentences'}
        </button>
      </div>
    </div>
  )
}
