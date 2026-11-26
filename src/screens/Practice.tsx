import { useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { gradeEnglish, gradeNepali } from '../core/grade'
import { recordAttempt } from '../core/record'
import { isDue, isKnown } from '../core/schedule'
import { buildSession, type SessionItem } from '../core/session'
import { sentenceNepali, type Sentence } from '../core/types'
import type { Deck } from '../hooks/useDeck'

type Phase = 'start' | 'drill' | 'done'

type Result = { sentence: Sentence; correct: boolean; hinted: number }

export function Practice({ deck }: { deck: Deck }) {
  const [phase, setPhase] = useState<Phase>('start')
  const [queue, setQueue] = useState<SessionItem[]>([])
  const [pos, setPos] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  const requeued = useRef(new Set<string>())

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
    const lastSeen = new Map([...deck.stats].map(([k, v]) => [k, new Date(v.lastSeen)]))
    const q = buildSession(deck.sentences, deck.cards, new Date(), { size: 10, maxNewItems: 20, lastSeen })
    requeued.current = new Set()
    setQueue(q)
    setPos(0)
    setResults([])
    setPhase(q.length ? 'drill' : 'done')
  }

  const onFinished = async (item: SessionItem, r: Result) => {
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
      />
    </>
  )
}

function DrillCard({
  sentence,
  direction,
  onDone,
}: {
  sentence: Sentence
  direction: SessionItem['direction']
  onDone: (r: Result) => void
}) {
  const [hinted, setHinted] = useState<Set<number>>(new Set())
  const [answer, setAnswer] = useState('')
  const [checked, setChecked] = useState<null | {
    correct: boolean
    chunkOk?: boolean[]
    shown: string
    overridden?: boolean
    gaveUp?: boolean
  }>(null)
  const [saving, setSaving] = useState(false)

  const chunks = sentence.chunks.map((c, i) => ({ ...c, i })).filter((c) => c.en)
  const enToNp = direction === 'en-np'

  const hint = (i: number) => {
    if (checked) return
    setHinted((p) => new Set(p).add(i))
  }

  const check = (gaveUp = false) => {
    if (gaveUp) {
      setHinted(new Set(chunks.map((c) => c.i)))
      setChecked({
        correct: false,
        shown: enToNp ? sentenceNepali(sentence) : sentence.en,
        gaveUp: true,
        chunkOk: sentence.chunks.map(() => false),
      })
      return
    }
    if (enToNp) {
      const g = gradeNepali(sentence, answer)
      setChecked({ correct: g.correct, chunkOk: g.chunks.map((c) => c.ok), shown: g.bestAnswer })
    } else {
      const g = gradeEnglish(sentence, answer)
      setChecked({ correct: g.correct, shown: g.correct ? g.closest : sentence.en })
    }
  }

  const finish = async (override = false) => {
    if (!checked || saving) return
    setSaving(true)
    const correct = checked.correct || override
    if (override) {
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
          <div className="np-words">
            {sentence.chunks.map((c, i) => {
              if (!c.en) return null
              const open = hinted.has(i) || !!checked
              const punct = sentence.chunks[i + 1] && !sentence.chunks[i + 1].en ? sentence.chunks[i + 1].np : ''
              return (
                <button key={i} className={'np-word' + (open ? ' open' : '')} onClick={() => hint(i)}>
                  <strong>
                    {c.np}
                    {punct && <em className="punct">{punct}</em>}
                  </strong>
                  <span>{open ? c.en : '\u00a0'}</span>
                </button>
              )
            })}
          </div>
        )}
        {!checked && <p className="muted small">Tap a word for a hint.</p>}
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
            <button type="submit" disabled={!answer.trim()}>
              Check
            </button>
          </form>
          <button className="ghost center-btn" onClick={() => check(true)}>
            I don't know
          </button>
        </>
      ) : (
        <section className={'card feedback ' + (checked.correct ? 'good' : 'bad')}>
          <p className="eyebrow">{checked.correct ? 'Correct' : checked.gaveUp ? 'Here it is' : 'Not quite'}</p>
          {enToNp ? (
            <p className="nepali">
              {sentence.chunks.map((c, i) => (
                <span
                  key={i}
                  className={
                    checked.correct || !checked.chunkOk || !c.en ? '' : checked.chunkOk[i] ? 'ok' : 'miss'
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
          {answer && !checked.correct && <p className="muted small">You wrote: {answer}</p>}
          {checked.correct && !enToNp && checked.shown !== sentence.en && (
            <p className="muted small">Also: {sentence.en}</p>
          )}
          {checked.correct && enToNp && checked.shown !== sentenceNepali(sentence) && (
            <p className="muted small">Also: {sentenceNepali(sentence)}</p>
          )}
          <div className="btn-row">
            {!checked.correct && !checked.gaveUp && (
              <button className="ghost" onClick={() => void finish(true)} disabled={saving}>
                I was right
              </button>
            )}
            <button className="cta small-cta" onClick={() => void finish(false)} disabled={saving}>
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
