import { useEffect, useRef, useState } from 'react'
import { db, type Recording } from '../db'
import type { Deck } from '../hooks/useDeck'
import { sentenceNepali } from '../core/types'
import { api, explainError } from '../voice/api'
import { deleteRecording, saveRecording } from '../voice/chunk'
import { startRecording, type ActiveRecording } from '../voice/recorder'
import { playRecording, stopSpeaking, unlockAudio } from '../voice/tts'

type Clip = { blob: Blob; mime: string; durationMs: number }
type Idea = { en: string; np: string }
type Compose = { np: string; en: string; fromIdea?: Idea; clip?: Clip; rec?: { r: ActiveRecording; started: number } }

const IDEAS_KEY = 'saathi.chunuIdeas'
const loadIdeas = (): Idea[] => {
  try {
    return JSON.parse(localStorage.getItem(IDEAS_KEY) ?? '[]')
  } catch {
    return []
  }
}
const storeIdeas = (ideas: Idea[]) => {
  try {
    localStorage.setItem(IDEAS_KEY, JSON.stringify(ideas))
  } catch {
    /* private mode */
  }
}

const errText = (e: unknown) => (e instanceof Error && !('status' in e) && navigator.onLine ? e.message : explainError(e))

export function Recordings({ deck }: { deck: Deck }) {
  const [list, setList] = useState<Recording[]>([])
  const [ideas, setIdeas] = useState<Idea[]>(loadIdeas)
  const [suggesting, setSuggesting] = useState(false)
  const [compose, setCompose] = useState<Compose | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<{ text: string; questions?: string[] } | null>(null)
  const [error, setError] = useState('')
  const [confirmDel, setConfirmDel] = useState('')
  const [, tick] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = () => db.recordings.orderBy('createdAt').reverse().toArray().then(setList)
  useEffect(() => {
    void load()
  }, [])
  useEffect(() => storeIdeas(ideas), [ideas])
  useEffect(() => {
    if (!compose?.rec) return
    const t = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [compose?.rec])

  const byId = new Map(deck.sentences.map((s) => [s.id, s]))

  const suggest = async () => {
    setSuggesting(true)
    setError('')
    try {
      const avoid = [...ideas.map((i) => i.en), ...list.map((r) => byId.get(r.sentenceId)?.en ?? '')].filter(Boolean)
      const r = await api('/api/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avoid }),
      })
      const { sentences } = (await r.json()) as { sentences: Idea[] }
      setIdeas((cur) => [...sentences, ...cur].slice(0, 30))
    } catch (e) {
      setError(errText(e))
    } finally {
      setSuggesting(false)
    }
  }

  const open = (idea?: Idea) => {
    unlockAudio()
    setNote(null)
    setError('')
    setCompose({ np: idea?.np ?? '', en: idea?.en ?? '', fromIdea: idea })
  }

  const record = async () => {
    if (!compose) return
    stopSpeaking()
    try {
      const r = await startRecording()
      setCompose({ ...compose, clip: undefined, rec: { r, started: Date.now() } })
    } catch {
      setError('Microphone access is off. Allow it in Settings > Safari > Microphone.')
    }
  }

  const stop = async () => {
    if (!compose?.rec) return
    const clip = await compose.rec.r.stop()
    if (clip.durationMs < 500 || clip.blob.size < 1000) {
      setCompose({ ...compose, rec: undefined })
      setError('That was too short. Try again.')
      return
    }
    setError('')
    setCompose({ ...compose, rec: undefined, clip })
    playRecording(clip.blob).catch(() => {})
  }

  const pickFile = (f: File | undefined) => {
    if (!f || !compose) return
    setCompose({ ...compose, clip: { blob: f, mime: f.type || 'audio/mp4', durationMs: 0 } })
    if (fileInput.current) fileInput.current.value = ''
  }

  const close = () => {
    compose?.rec?.r.cancel()
    setCompose(null)
    setError('')
  }

  const save = async () => {
    if (!compose?.clip || !compose.np.trim()) return
    setSaving(true)
    setError('')
    try {
      const { sentence, questions } = await saveRecording(compose.clip, compose.np.trim(), compose.en.trim(), deck.items)
      if (compose.fromIdea) setIdeas((cur) => cur.filter((i) => i !== compose.fromIdea))
      await deck.refresh()
      await load()
      setCompose(null)
      setNote({ text: `Added "${sentenceNepali(sentence)}" (${sentence.en}).`, questions })
    } catch (e) {
      setError(errText(e))
    } finally {
      setSaving(false)
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

  const secs = compose?.rec ? Math.floor((Date.now() - compose.rec.started) / 1000) : 0

  return (
    <section className="card recordings">
      <h2>Chunu's voice</h2>

      {!compose ? (
        <>
          <p className="muted">
            Pick a sentence Chunu might say to you, or write your own. She records it, and it joins your practice as a
            listening card in her voice.
          </p>
          {note && (
            <>
              <p className="ok-note small">{note.text}</p>
              {note.questions && note.questions.length > 0 && (
                <ul className="questions small">
                  {note.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {error && <p className="voice-error small">{error}</p>}
          <div className="btn-row left">
            <button className="cta small-cta" onClick={() => void suggest()} disabled={suggesting}>
              {suggesting ? 'Thinking…' : ideas.length ? 'More ideas' : 'Suggest sentences'}
            </button>
            <button className="ghost" onClick={() => open()}>
              Write your own
            </button>
          </div>

          {ideas.length > 0 && (
            <div className="ideas">
              <p className="eyebrow">Ideas · tap one to edit and record</p>
              {ideas.map((idea, i) => (
                <div key={i} className="row idea">
                  <button className="idea-main" onClick={() => open(idea)}>
                    <span className="idea-en">{idea.en}</span>
                    <span className="muted small">{idea.np}</span>
                  </button>
                  <button
                    className="ghost tiny"
                    aria-label="Remove idea"
                    onClick={() => setIdeas((cur) => cur.filter((x) => x !== idea))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <form
          className="rec-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label>
            <span className="small muted">English</span>
            <input
              value={compose.en}
              onChange={(e) => setCompose({ ...compose, en: e.target.value })}
              placeholder="What time will you come home?"
            />
          </label>
          <label>
            <span className="small muted">Nepali (romanized). Edit it to match exactly what Chunu says.</span>
            <input
              value={compose.np}
              onChange={(e) => setCompose({ ...compose, np: e.target.value })}
              placeholder="Timi kati baje ghar aauchhau?"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>

          {compose.rec ? (
            <div className="rec-live">
              <span className="rec-dot" aria-hidden="true" />
              <strong>
                Recording… {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
              </strong>
              <button type="button" className="cta small-cta" onClick={() => void stop()}>
                Stop
              </button>
            </div>
          ) : (
            <div className="btn-row left">
              <button type="button" className={compose.clip ? 'ghost' : 'cta small-cta'} onClick={() => void record()}>
                <span className="rec-dot small" aria-hidden="true" /> {compose.clip ? 'Record again' : 'Record Chunu'}
              </button>
              {compose.clip ? (
                <button type="button" className="listen" onClick={() => playRecording(compose.clip!.blob).catch(() => {})}>
                  ▶ Play it back
                </button>
              ) : (
                <label className="ghost file-btn">
                  <input ref={fileInput} type="file" accept="audio/*" onChange={(e) => pickFile(e.target.files?.[0])} />
                  Use a voice memo
                </label>
              )}
            </div>
          )}

          <p className="muted small">
            {compose.en.trim() ? '' : 'Leave English blank and Claude will translate it (marked unverified). '}
            Chunu said it, so the Nepali counts as checked.
          </p>
          {error && <p className="voice-error small">{error}</p>}
          <div className="btn-row">
            <button type="button" className="ghost" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="cta small-cta" disabled={!compose.clip || !compose.np.trim() || saving || !!compose.rec}>
              {saving ? 'Saving…' : 'Save'}
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
