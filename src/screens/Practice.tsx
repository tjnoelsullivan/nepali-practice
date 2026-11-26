import { useEffect, useMemo, useRef, useState } from 'react'
import { db, recordingBlob } from '../db'
import { gradeEnglish, gradeNepali } from '../core/grade'
import { recordAttempt } from '../core/record'
import { formatDuration } from '../core/activity'
import { daysChanged, sessionActiveMs, setStudying } from '../core/tracker'
import { isDue, isKnown } from '../core/schedule'
import { buildSession, type SessionItem } from '../core/session'
import { gradeSpoken, romanize } from '../core/devanagari'
import { sentenceDevanagari, sentenceNepali, type Sentence } from '../core/types'
import { aiGrade, type AiVerdict } from '../voice/aiGrade'
import { ApiError, explainError } from '../voice/api'
import { useVoiceSettings } from '../voice/settings'
import { listenOnce, type Listening } from '../voice/stt'
import { playRecording, prefetch, speak, stopSpeaking, unlockAudio } from '../voice/tts'
import type { Deck } from '../hooks/useDeck'

type Phase = 'start' | 'drill' | 'done'

type Result = { sentence: Sentence; correct: boolean; hinted: number }

export function Practice({ deck }: { deck: Deck }) {
  const [phase, setPhase] = useState<Phase>('start')
  const [queue, setQueue] = useState<SessionItem[]>([])
  const [pos, setPos] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  const requeued = useRef(new Set<string>())

  useEffect(() => {
    setStudying(phase === 'drill')
    return () => setStudying(false)
  }, [phase])

  const byId = useMemo(() => new Map(deck.sentences.map((s) => [s.id, s])), [deck.sentences])

  const counts = useMemo(() => {
    const now = new Date()
    let due = 0
    let learning = 0
    for (const [, c] of deck.cards) {
      if (isDue(c, now)) due++
      if (isKnown(c)) learning++
    }
    const newItems = [...deck.items.keys()].filter((i) => !isKnown(deck.cards.get(i))).length
    return { due, learning, newItems }
  }, [deck.cards, deck.items])

  const start = () => {
    unlockAudio()
    const lastSeen = new Map([...deck.stats].map(([k, v]) => [k, new Date(v.lastSeen)]))
    const q = buildSession(deck.sentences, deck.cards, new Date(), { size: 10, maxNewItems: 20, lastSeen })
    requeued.current = new Set()
    setQueue(q)
    setPos(0)
    setResults([])
    setPhase(q.length ? 'drill' : 'done')
  }

  const onFinished = async (item: SessionItem, r: Result) => {
    daysChanged()
    const nextResults = [...results, r]
    setResults(nextResults)
    let q = queue
    if (!r.correct && !requeued.current.has(item.sentenceId)) {
      requeued.current.add(item.sentenceId)
      q = [...queue, { sentenceId: item.sentenceId, direction: item.direction }]
      setQueue(q)
    }
    if (pos + 1 >= q.length) {
      setPhase('done')
      await deck.refresh()
    } else setPos(pos + 1)
  }

  if (!deck.ready) return <p className="muted center">Loading…</p>

  if (phase === 'start') {
    return (
      <>
        <header className="hero compact">
          <p className="eyebrow">Practice</p>
          <h1>Ready when you are</h1>
        </header>
        <section className="card">
          <div className="mastery">
            <div>
              <div className="big">{counts.due}</div>
              <div className="label">due now</div>
            </div>
            <div>
              <div className="big">{counts.newItems}</div>
              <div className="label">new to learn</div>
            </div>
            <div>
              <div className="big">{deck.sentences.length}</div>
              <div className="label">sentences</div>
            </div>
          </div>
        </section>
        <button className="cta" onClick={start}>
          <span>Start session</span>
          <Arrow />
        </button>
        <p className="muted small center">
          About 10 sentences. Tap a word if you're stuck; hinted words come back sooner.
        </p>
      </>
    )
  }

  if (phase === 'done') {
    const right = results.filter((r) => r.correct).length
    const hints = results.reduce((n, r) => n + r.hinted, 0)
    return (
      <>
        <header className="hero compact">
          <p className="eyebrow">Session complete</p>
          <h1>{results.length ? 'Well done' : 'All caught up'}</h1>
        </header>
        {results.length > 0 ? (
          <section className="card">
            <div className="mastery">
              <div>
                <div className="big">{right}</div>
                <div className="label">correct</div>
              </div>
              <div>
                <div className="big">{results.length - right}</div>
                <div className="label">to revisit</div>
              </div>
              <div>
                <div className="big">{hints}</div>
                <div className="label">hints used</div>
              </div>
            </div>
            <p className="muted small center">Active time this session: {formatDuration(sessionActiveMs()) === '0m' ? 'under a minute' : formatDuration(sessionActiveMs())}</p>
          </section>
        ) : (
          <section className="card">
            <p className="muted">Nothing is due right now. New sentences unlock as you learn the words in them.</p>
          </section>
        )}
        <button className="cta" onClick={() => setPhase('start')}>
          <span>Back</span>
        </button>
      </>
    )
  }

  const item = queue[pos]
  const sentence = byId.get(item.sentenceId)!
  const next = queue[pos + 1] && byId.get(queue[pos + 1].sentenceId)
  return (
    <>
      <div className="progress-dots" aria-label={`Question ${pos + 1} of ${queue.length}`}>
        {queue.map((_, i) => (
          <span key={i} className={i <= pos ? 'on' : ''} />
        ))}
      </div>
      <DrillCard
        key={pos + ':' + item.sentenceId}
        sentence={sentence}
        direction={item.direction}
        onDone={(r) => void onFinished(item, r)}
        nextDev={next ? sentenceDevanagari(next) : ''}
        listenFirst={(deck.stats.get(sentence.id)?.npEnCorrect ?? 0) >= 2}
      />
    </>
  )
}

const REGISTER: Record<string, string> = {
  wife: 'their wife Chunu (timi)',
  'mother-in-law': 'their mother-in-law Aama (tapaai)',
  'father-in-law': 'their father-in-law Buwa (tapaai)',
  'in-laws': 'their in-laws (tapaai)',
  nephews: 'their young nephews (timi)',
}

function DrillCard({
  sentence,
  direction,
  onDone,
  nextDev,
  listenFirst,
}: {
  sentence: Sentence
  direction: SessionItem['direction']
  onDone: (r: Result) => void
  nextDev: string
  /** Translated correctly twice already: start with the text hidden. */
  listenFirst: boolean
}) {
  const voice = useVoiceSettings()
  const dev = sentenceDevanagari(sentence)
  const hasAudio = !!sentence.audioId
  const canPlay = hasAudio || !!dev
  const recording = useRef<Blob | null>(null)
  // Chunu's recordings are ear training: the text starts hidden.
  const [revealed, setRevealed] = useState(
    direction === 'en-np' || !(voice.hideText || hasAudio || (listenFirst && !!dev)),
  )
  const [heard, setHeard] = useState('')
  const [listening, setListening] = useState<Listening | null>(null)
  const [voiceError, setVoiceError] = useState('')
  const [ai, setAi] = useState<'checking' | AiVerdict | null>(null)
  const [hinted, setHinted] = useState<Set<number>>(new Set())
  const [answer, setAnswer] = useState('')
  const [checked, setChecked] = useState<null | {
    correct: boolean
    chunkOk?: boolean[]
    shown: string
    overridden?: boolean
    gaveUp?: boolean
    spoken?: boolean
    byAi?: boolean
  }>(null)
  const [saving, setSaving] = useState(false)

  const chunks = sentence.chunks.map((c, i) => ({ ...c, i })).filter((c) => c.en)
  const enToNp = direction === 'en-np'

  const play = (slow = false) => {
    setVoiceError('')
    const p = recording.current ? playRecording(recording.current, { slow }) : speak(dev, { slow })
    p.catch((e) => setVoiceError(explainError(e)))
  }

  // Nepali -> English: play the sentence as the card appears. Then warm up the next card.
  useEffect(() => {
    if (hasAudio) {
      void db.recordings.get(sentence.audioId!).then((r) => {
        recording.current = r ? recordingBlob(r) : null
        if (r && !enToNp && voice.autoplay) playRecording(recordingBlob(r)).catch(() => {})
      })
    } else if (!enToNp && voice.autoplay && dev) speak(dev).catch((e) => setVoiceError(explainError(e)))
    else prefetch(dev)
    prefetch(nextDev)
    return () => {
      stopSpeaking()
    }
  }, [])

  const register = sentence.tags.map((t) => REGISTER[t]).find(Boolean)

  /** Ask Claude for a second opinion when the app's matcher says wrong. */
  const secondOpinion = async (typed: string, spoken?: string) => {
    setAi('checking')
    const v = await aiGrade({
      direction,
      prompt: enToNp ? sentence.en : sentenceNepali(sentence),
      expected: enToNp
        ? [sentenceNepali(sentence), ...(sentence.npAlts ?? [])]
        : [sentence.en, ...(sentence.enAlts ?? [])],
      answer: typed,
      heard: spoken,
      register,
    })
    setAi(v)
    if (v.verdict === 'correct') setChecked((c) => (c ? { ...c, correct: true, byAi: true } : c))
  }

  /** After grading: read the right answer aloud; returns true when a second opinion is worth asking. */
  const afterCheck = (correct: boolean) => {
    if (enToNp && voice.autoplay && dev) speak(dev).catch(() => {})
    return !correct
  }

  const mic = async () => {
    if (listening) {
      listening.cancel()
      setListening(null)
      return
    }
    stopSpeaking()
    setVoiceError('')
    const l = listenOnce()
    setListening(l)
    try {
      const h = (await l.result).trim()
      setListening(null)
      if (!h) {
        setVoiceError("Didn't catch that. Tap the mic and try again.")
        return
      }
      const typed = romanize(h)
      setHeard(h)
      setAnswer(typed)
      const g = gradeSpoken(sentence, h)
      setChecked({ correct: g.correct, chunkOk: g.chunks.map((c) => c.ok), shown: sentenceNepali(sentence), spoken: true })
      if (afterCheck(g.correct)) void secondOpinion(typed, h)
    } catch (e) {
      setListening(null)
      setVoiceError(e instanceof ApiError || !navigator.onLine || !(e instanceof Error) ? explainError(e) : micMessage(e))
    }
  }

  const hint = (i: number) => {
    if (checked) return
    setHinted((p) => new Set(p).add(i))
  }

  const check = (gaveUp = false) => {
    if (gaveUp) {
      setHinted(new Set(chunks.map((c) => c.i)))
      setRevealed(true)
      listening?.cancel()
      if (enToNp && voice.autoplay && dev) speak(dev).catch(() => {})
      setChecked({
        correct: false,
        shown: enToNp ? sentenceNepali(sentence) : sentence.en,
        gaveUp: true,
        chunkOk: sentence.chunks.map(() => false),
      })
      return
    }
    setRevealed(true)
    let correct: boolean
    if (enToNp) {
      const g = gradeNepali(sentence, answer)
      correct = g.correct
      setChecked({ correct: g.correct, chunkOk: g.chunks.map((c) => c.ok), shown: g.bestAnswer })
    } else {
      const g = gradeEnglish(sentence, answer)
      correct = g.correct
      setChecked({ correct: g.correct, shown: g.correct ? g.closest : sentence.en })
    }
    if (afterCheck(correct)) void secondOpinion(answer)
  }

  /** override: 'right' = learner says the grader was too strict; 'wrong' = too generous. */
  const finish = async (override?: 'right' | 'wrong') => {
    if (!checked || saving || ai === 'checking') return
    setSaving(true)
    stopSpeaking()
    const correct = override === 'wrong' ? false : checked.correct || override === 'right'
    if (override === 'right') {
      await db.flags.add({
        sentenceId: sentence.id,
        answer,
        direction,
        at: new Date(),
        note: 'Marked correct by learner; check with tutor',
      })
    }
    await recordAttempt(db, { sentence, direction, hinted, chunkOk: checked.chunkOk, correct })
    onDone({ sentence, correct, hinted: hinted.size })
  }

  return (
    <>
      <section className={'card prompt-card' + (checked ? (checked.correct ? ' good' : ' bad') : '')}>
        <div className="chip-row">
          <span className="chip">{enToNp ? 'Say it in Nepali' : 'What does this mean?'}</span>
          {sentence.tags.slice(0, 2).map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
          {!sentence.verified && <span className="chip warn">Unverified</span>}
        </div>

        {enToNp ? (
          <>
            <p className="prompt">{sentence.en}</p>
            <div className="hint-row" aria-label="Tap for a hint">
              {chunks.map((c) => {
                const open = hinted.has(c.i) || !!checked
                return (
                  <button key={c.i} className={'hint-chip' + (open ? ' open' : '')} onClick={() => hint(c.i)}>
                    {open ? (
                      <>
                        <strong>{c.np}</strong>
                        <span>{c.en}</span>
                      </>
                    ) : (
                      <span>{c.en}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
          {canPlay && (
            <div className="listen-row">
              <button className="listen" onClick={() => play(false)} aria-label="Play the Nepali">
                <SpeakerIcon /> {hasAudio ? 'Chunu' : 'Listen'}
              </button>
              <button className="listen slow" onClick={() => play(true)} aria-label="Play slowly">
                <TurtleIcon /> Slow
              </button>
              {!revealed && (
                <button className="listen ghosty" onClick={() => setRevealed(true)}>
                  Show text
                </button>
              )}
            </div>
          )}
          <div className={'np-words' + (revealed ? '' : ' masked')} aria-hidden={!revealed}>
            {sentence.chunks.map((c, i) => {
              if (!c.en) return null
              const open = hinted.has(i) || !!checked
              const punct = sentence.chunks[i + 1] && !sentence.chunks[i + 1].en ? sentence.chunks[i + 1].np : ''
              return (
                <button
                  key={i}
                  className={'np-word' + (open ? ' open' : '')}
                  onClick={() => (revealed ? hint(i) : setRevealed(true))}
                >
                  <strong>
                    {c.np}
                    {punct && <em className="punct">{punct}</em>}
                  </strong>
                  <span>{open ? c.en : '\u00a0'}</span>
                </button>
              )
            })}
          </div>
          </>
        )}
        {!checked && (
          <p className="muted small">
            {revealed
              ? 'Tap a word for a hint.'
              : listenFirst && !voice.hideText
                ? "You've translated this twice, so listen first. Tap the text to show it."
                : 'Listening practice: the text is hidden. Tap it to show.'}
          </p>
        )}
        {voiceError && <p className="voice-error small">{voiceError}</p>}
      </section>

      {!checked ? (
        <>
          <form
            className="answer"
            onSubmit={(e) => {
              e.preventDefault()
              if (answer.trim()) check()
            }}
          >
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={enToNp ? 'Type in romanized Nepali' : 'Type the English meaning'}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            {enToNp && dev && (
              <button
                type="button"
                className={'mic' + (listening ? ' live' : '')}
                onClick={() => void mic()}
                aria-label={listening ? 'Stop listening' : 'Speak your answer'}
              >
                <MicIcon />
              </button>
            )}
            <button type="submit" disabled={!answer.trim()}>
              Check
            </button>
          </form>
          {listening && <p className="muted small center listening-note">Listening… say the sentence in Nepali.</p>}
          <button className="ghost center-btn" onClick={() => check(true)}>
            I don't know
          </button>
        </>
      ) : (
        <section className={'card feedback ' + (checked.correct ? 'good' : 'bad')}>
          <div className="feedback-head">
            <p className="eyebrow">
              {checked.correct ? (checked.byAi ? 'Correct (same meaning)' : 'Correct') : checked.gaveUp ? 'Here it is' : 'Not quite'}
            </p>
            {canPlay && (
              <span className="listen-row tight">
                <button className="listen icon" onClick={() => play(false)} aria-label="Play the Nepali">
                  <SpeakerIcon />
                </button>
                <button className="listen icon slow" onClick={() => play(true)} aria-label="Play slowly">
                  <TurtleIcon />
                </button>
              </span>
            )}
          </div>
          {enToNp ? (
            <p className="nepali">
              {sentence.chunks.map((c, i) => (
                <span
                  key={i}
                  className={
                    checked.correct || checked.gaveUp || !checked.chunkOk || !c.en ? '' : checked.chunkOk[i] ? 'ok' : 'miss'
                  }
                >
                  {c.np}
                  {i < sentence.chunks.length - 1 && sentence.chunks[i + 1].en ? ' ' : ''}
                </span>
              ))}
            </p>
          ) : (
            <>
              <p className="nepali">{checked.shown}</p>
              {!checked.correct && <p className="muted small">{sentenceNepali(sentence)}</p>}
            </>
          )}
          {checked.spoken && heard ? (
            <p className="muted small">You said (roughly): {answer}</p>
          ) : (
            answer && !checked.correct && <p className="muted small">You wrote: {answer}</p>
          )}
          {ai === 'checking' && <p className="muted small ai-note">Checking the meaning…</p>}
          {ai && ai !== 'checking' && ai.feedback && ai.verdict !== 'unknown' && (
            <p className="small ai-note">{ai.feedback}</p>
          )}
          {checked.correct && !enToNp && checked.shown !== sentence.en && (
            <p className="muted small">Also: {sentence.en}</p>
          )}
          {checked.correct && enToNp && checked.shown !== sentenceNepali(sentence) && (
            <p className="muted small">Also: {sentenceNepali(sentence)}</p>
          )}
          <div className="btn-row">
            {!checked.correct && !checked.gaveUp && ai !== 'checking' && (
              <button className="ghost" onClick={() => void finish('right')} disabled={saving}>
                I was right
              </button>
            )}
            {checked.correct && (
              <button className="ghost" onClick={() => void finish('wrong')} disabled={saving}>
                I got it wrong
              </button>
            )}
            <button className="cta small-cta" onClick={() => void finish()} disabled={saving || ai === 'checking'}>
              Continue <Arrow />
            </button>
          </div>
        </section>
      )}
    </>
  )
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function micMessage(e: Error): string {
  const m = e.message.toLowerCase()
  if (m.includes('permission') || m.includes('notallowed') || m.includes('denied'))
    return 'Microphone access is off. Allow it in Settings > Safari > Microphone (or for this app), then try again.'
  return 'Speech recognition failed: ' + e.message.slice(0, 120)
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="ico">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  )
}

function TurtleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="ico">
      <path d="M4 15c0-4 3.5-7 8-7s8 3 8 7z" />
      <path d="M20 13.5h1.5a1.5 1.5 0 0 0 0-3H19M6 15l-1 3M18 15l1 3M9 8.5l1.5 6.5M15 8.5l-1.5 6.5" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="ico">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  )
}
