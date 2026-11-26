import { useEffect, useRef, useState } from 'react'
import {
  backupFileName,
  buildBackup,
  lastBackup,
  markBackedUp,
  readBackup,
  restoreBackup,
  type BackupFile,
  type BackupSummary,
} from '../backup'
import { sentenceNepali, type Flag, type Sentence } from '../core/types'
import { db } from '../db'
import './Safety.css'
import type { Deck } from '../hooks/useDeck'
import { tutorListText, type TutorQuestion } from '../tutorList'

type FlagRow = Flag & { id?: number }

/** Share text or a file with the iOS share sheet; fall back to copy / download. */
async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}

function ago(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export function TutorCheck({ deck }: { deck: Deck }) {
  const [flags, setFlags] = useState<FlagRow[]>([])
  const [questions, setQuestions] = useState<TutorQuestion[]>([])
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState(false)

  const load = async () => {
    setFlags(await db.flags.orderBy('at').toArray())
    const lessons = await db.lessons.toArray()
    setQuestions(lessons.flatMap((l) => l.questions.map((q) => ({ q, from: l.title }))))
  }
  useEffect(() => {
    void load()
  }, [deck.flagCount])

  const byId = new Map(deck.sentences.map((s) => [s.id, s]))
  const unverified = deck.sentences.filter((s) => !s.verified)
  const total = unverified.length + flags.length + questions.length

  const send = async () => {
    const text = tutorListText(
      unverified,
      flags.map((f) => ({ ...f, sentence: byId.get(f.sentenceId) })),
      questions,
    )
    try {
      const r = await shareText('Saathi: things to check', text)
      setMsg(r === 'copied' ? 'Copied. Paste it into a message to your tutor.' : '')
    } catch {
      setMsg("Couldn't share or copy the list.")
    }
  }

  const verify = async (s: Sentence) => {
    await db.sentences.put({ ...s, verified: true })
    await deck.refresh()
  }
  const clearFlag = async (f: FlagRow) => {
    if (f.id !== undefined) await db.flags.delete(f.id)
    await load()
    await deck.refresh()
  }

  return (
    <section className="card safety">
      <h2>Check with your tutor</h2>
      {total === 0 ? (
        <p className="muted small">Nothing to check right now.</p>
      ) : (
        <>
          <p className="muted small">
            {unverified.length} unverified {unverified.length === 1 ? 'sentence' : 'sentences'} · {flags.length}{' '}
            {flags.length === 1 ? 'answer' : 'answers'} you marked right · {questions.length} lesson{' '}
            {questions.length === 1 ? 'question' : 'questions'}
          </p>
          <div className="safety-actions">
            <button className="cta small-cta" onClick={() => void send()}>
              Send list to tutor
            </button>
            <button className="ghost" onClick={() => setOpen(!open)}>
              {open ? 'Hide' : 'Mark checked'}
            </button>
          </div>
          {msg && <p className="small">{msg}</p>}
          {open && (
            <div className="check-list">
              {unverified.length > 0 && <p className="small muted">Tap ✓ when your tutor says a sentence is right.</p>}
              {unverified.map((s) => (
                <div key={s.id} className="row">
                  <div>
                    <div className="row-np">{sentenceNepali(s)}</div>
                    <div className="muted small">{s.en}</div>
                  </div>
                  <button className="ghost tiny" aria-label="Tutor says it's right" onClick={() => void verify(s)}>
                    ✓
                  </button>
                </div>
              ))}
              {flags.length > 0 && <p className="small muted">Answers you marked right. Tap ✓ once your tutor has looked.</p>}
              {flags.map((f) => (
                <div key={f.id} className="row">
                  <div>
                    <div className="row-np">{f.answer}</div>
                    <div className="muted small">
                      {byId.get(f.sentenceId)?.en ?? '(sentence removed)'}
                    </div>
                  </div>
                  <button className="ghost tiny" aria-label="Done" onClick={() => void clearFlag(f)}>
                    ✓
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

type BackupState =
  | { step: 'idle' }
  | { step: 'preparing' }
  | { step: 'ready'; file: File }
  | { step: 'checking' }
  | { step: 'confirm'; file: BackupFile; summary: BackupSummary }
  | { step: 'restoring' }
  | { step: 'error'; message: string }

export function Backup() {
  const [state, setState] = useState<BackupState>({ step: 'idle' })
  const [last, setLast] = useState(lastBackup())
  const input = useRef<HTMLInputElement>(null)

  const prepare = async () => {
    setState({ step: 'preparing' })
    try {
      const data = await buildBackup()
      const file = new File([JSON.stringify(data)], backupFileName(), { type: 'application/json' })
      setState({ step: 'ready', file })
    } catch (e) {
      setState({ step: 'error', message: `Couldn't make the backup: ${(e as Error).message}` })
    }
  }

  // Sharing must start straight from a tap on iPhone, so the file is prepared first and saved on a second tap.
  const save = async (file: File) => {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Saathi backup' })
      } else {
        const url = URL.createObjectURL(file)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      }
      markBackedUp()
      setLast(new Date())
      setState({ step: 'idle' })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setState({ step: 'error', message: `Couldn't save the file: ${(e as Error).message}` })
    }
  }

  const pick = async (f: File | undefined) => {
    if (!f) return
    setState({ step: 'checking' })
    try {
      const { file, summary } = readBackup(await f.text())
      setState({ step: 'confirm', file, summary })
    } catch (e) {
      setState({ step: 'error', message: (e as Error).message })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const restore = async (file: BackupFile) => {
    setState({ step: 'restoring' })
    try {
      await restoreBackup(file)
      location.reload()
    } catch (e) {
      setState({ step: 'error', message: `Restore failed, nothing was changed: ${(e as Error).message}` })
    }
  }

  const sizeKb = state.step === 'ready' ? Math.max(1, Math.round(state.file.size / 1024)) : 0

  return (
    <section className="card safety">
      <h2>Backup</h2>
      <p className="muted small">
        Everything, including Chunu's recordings, lives only on this phone. Save a backup to Files or iCloud Drive now and then.{' '}
        {last ? `Last backup: ${ago(last)}.` : 'No backup yet.'}
      </p>
      <div className="safety-actions">
        {state.step === 'ready' ? (
          <button className="cta small-cta" onClick={() => void save(state.file)}>
            Save backup file ({sizeKb < 1024 ? `${sizeKb} KB` : `${(sizeKb / 1024).toFixed(1)} MB`})
          </button>
        ) : (
          <button className="cta small-cta" disabled={state.step === 'preparing'} onClick={() => void prepare()}>
            {state.step === 'preparing' ? 'Preparing…' : 'Back up now'}
          </button>
        )}
        <button className="ghost" onClick={() => input.current?.click()} disabled={state.step === 'restoring'}>
          Restore
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </div>
      {state.step === 'checking' && <p className="small muted">Reading the file…</p>}
      {state.step === 'restoring' && <p className="small muted">Restoring…</p>}
      {state.step === 'error' && <p className="small error-text">{state.message}</p>}
      {state.step === 'confirm' && (
        <div className="restore-confirm">
          <p className="small">
            Backup from <b>{state.summary.exportedAt.toLocaleString()}</b>: {state.summary.sentences} sentences,{' '}
            {state.summary.reviews} reviews, {state.summary.days} practice days, {state.summary.recordings} recordings.
          </p>
          <p className="small">This replaces everything on this phone with the backup.</p>
          <div className="safety-actions">
            <button className="cta small-cta danger" onClick={() => void restore(state.file)}>
              Replace and restore
            </button>
            <button className="ghost" onClick={() => setState({ step: 'idle' })}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
