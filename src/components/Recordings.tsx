import { useEffect, useRef, useState } from 'react'
import { db, type Recording } from '../db'
import type { Deck } from '../hooks/useDeck'
import { sentenceNepali } from '../core/types'
import { explainError } from '../voice/api'
import { deleteRecording, saveRecording } from '../voice/chunk'
import { startRecording, type ActiveRecording } from '../voice/recorder'
import { playRecording, stopSpeaking, unlockAudio } from '../voice/tts'

type Clip = { blob: Blob; mime: string; durationMs: number }
type State =
  | { step: 'idle'; note?: string; questions?: string[]; error?: string }
  | { step: 'recording'; rec: ActiveRecording; started: number }
  | { step: 'review'; clip: Clip; error?: string }
  | { step: 'saving'; clip: Clip }

export function Recordings({ deck }: { deck: Deck }) {
  const [state, setState] = useState<State>({ step: 'idle' })
  const [list, setList] = useState<Recording[]>([])
  const [np, setNp] = useState('')
  const [en, setEn] = useState('')
  const [confirmDel, setConfirmDel] = useState('')
  const [, tick] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = () => db.recordings.orderBy('createdAt').reverse().toArray().then(setList)
  useEffect(() => {
    void load()
  }, [])
  useEffect(() => {
    if (state.step !== 'recording') return
    const t = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [state.step])

  const record = async () => {
    unlockAudio()
    stopSpeaking()
    try {
      const rec = await startRecording()
      setState({ step: 'recording', rec, started: Date.now() })
    } catch {
      setState({ step: 'idle', error: 'Microphone access is off. Allow it in Settings > Safari > Microphone.' })
    }
  }

  const stop = async () => {
    if (state.step !== 'recording') return
    const clip = await state.rec.stop()
    if (clip.durationMs < 500 || clip.blob.size < 1000) {
      setState({ step: 'idle', error: 'That was too short. Try again.' })
      return
    }
    setState({ step: 'review', clip })
    playRecording(clip.blob).catch(() => {})
  }

  const pickFile = (f: File | undefined) => {
    if (!f) return
    unlockAudio()
    setState({ step: 'review', clip: { blob: f, mime: f.type || 'audio/mp4', durationMs: 0 } })
    if (fileInput.current) fileInput.current.value = ''
  }

  const save = async () => {
    if (state.step !== 'review' || !np.trim()) return
    const clip = state.clip
    setState({ step: 'saving', clip })
    try {
      const { sentence, questions } = await saveRecording(clip, np.trim(), en.trim(), deck.items)
      await deck.refresh()
      await load()
      setNp('')
      setEn('')
      setState({ step: 'idle', note: `Added "${sentenceNepali(sentence)}" (${sentence.en}).`, questions })
    } catch (e) {
      setState({
        step: 'review',
        clip,
        error: e instanceof Error && !('status' in e) && navigator.onLine ? e.message : explainError(e),
      })
    }
  }

  const remove = async (r: Recording) => {
    if (confirmDel !== r.id) {
      setConfirmDel(r.id)
      return
    }
    await deleteRecording(r)
    setConfirmDel('')
    await deck.refresh()
    await load()
  }

  const byId = new Map(deck.sentences.map((s) => [s.id, s]))
  const secs = state.step === 'recording' ? Math.floor((Date.now() - state.started) / 1000) : 0

  return (
    <section className="card recordings">
      <h2>Chunu's voice</h2>
      {state.step === 'idle' && (
        <>
          <p className="muted">
            Record Chunu saying a sentence, then type what was said. It joins your practice as listening cards in Chunu's
            voice.
          </p>
          {state.note && <p className="ok-note small">{state.note}</p>}
          {state.questions && state.questions.length > 0 && (
            <ul className="questions small">
              {state.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          )}
          {state.error && <p className="voice-error small">{state.error}</p>}
          <div className="btn-row left">
            <button className="cta small-cta" onClick={() => void record()}>
              <MicDot /> Record
            </button>
            <label className="ghost file-btn">
              <input ref={fileInput} type="file" accept="audio/*" onChange={(e) => pickFile(e.target.files?.[0])} />
              Use a voice memo
            </label>
          </div>
        </>
      )}

      {state.step === 'recording' && (
        <div className="rec-live">
          <span className="rec-dot" aria-hidden="true" />
          <strong>
            Recording… {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
          </strong>
          <button className="cta small-cta" onClick={() => void stop()}>
            Stop
          </button>
          <button
            className="ghost"
            onClick={() => {
              state.rec.cancel()
              setState({ step: 'idle' })
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {(state.step === 'review' || state.step === 'saving') && (
        <form
          className="rec-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <button type="button" className="listen" onClick={() => playRecording(state.clip.blob).catch(() => {})}>
            Play it back
          </button>
          <label>
            <span className="small muted">What Chunu said (romanized Nepali)</span>
            <input value={np} onChange={(e) => setNp(e.target.value)} placeholder="Timi kati baje ghar aauchhau?" autoCapitalize="sentences" autoCorrect="off" spellCheck={false} required />
          </label>
          <label>
            <span className="small muted">English (optional; Claude translates if blank)</span>
            <input value={en} onChange={(e) => setEn(e.target.value)} placeholder="What time will you come home?" />
          </label>
          {state.step === 'review' && state.error && <p className="voice-error small">{state.error}</p>}
          <div className="btn-row">
            <button type="button" className="ghost" onClick={() => setState({ step: 'idle' })} disabled={state.step === 'saving'}>
              Discard
            </button>
            <button type="submit" className="cta small-cta" disabled={!np.trim() || state.step === 'saving'}>
              {state.step === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {list.length > 0 && (
        <div className="lesson-list">
          <p className="eyebrow">Recorded · {list.length}</p>
          {list.map((r) => {
            const s = byId.get(r.sentenceId)
            return (
              <div key={r.id} className="row">
                <button className="listen icon" aria-label="Play" onClick={() => playRecording(r.blob).catch(() => {})}>
                  ▶
                </button>
                <div className="grow">
                  <div className="row-np">{s ? sentenceNepali(s) : '…'}</div>
                  <div className="muted small">
                    {s?.en}
                    {s && !s.verified ? ' · translation unverified' : ''}
                  </div>
                </div>
                <button className="ghost tiny" onClick={() => void remove(r)}>
                  {confirmDel === r.id ? 'Delete?' : 'Remove'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function MicDot() {
  return <span className="rec-dot small" aria-hidden="true" />
}
