import { useState } from 'react'
import { DEMO } from '../data/demo'

export function Practice() {
  const s = DEMO
  const [revealed, setRevealed] = useState(false)
  const [hinted, setHinted] = useState<Set<number>>(new Set())
  const [answer, setAnswer] = useState('')

  const toggleHint = (i: number) =>
    setHinted((prev) => {
      const next = new Set(prev)
      next.add(i)
      return next
    })

  return (
    <>
      <header className="hero compact">
        <p className="eyebrow">Practice preview</p>
        <h1>Say it in Nepali</h1>
      </header>

      <div className="progress-dots" aria-label="Question 1 of 10">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={i === 0 ? 'on' : ''} />
        ))}
      </div>

      <section className="card prompt-card">
        <div className="chip-row">
          <span className="chip">{s.context}</span>
          {!s.verified && <span className="chip warn">Unverified</span>}
        </div>
        <p className="prompt">{s.english}</p>

        <div className="hint-row" aria-label="Tap a word for a hint">
          {s.nepali
            .filter((c) => c.gloss)
            .map((c, i) => (
              <button
                key={i}
                className={'hint-chip' + (hinted.has(i) || revealed ? ' open' : '')}
                onClick={() => toggleHint(i)}
              >
                {hinted.has(i) || revealed ? (
                  <>
                    <strong>{c.text}</strong>
                    <span>{c.gloss}</span>
                  </>
                ) : (
                  <span>Hint {i + 1}</span>
                )}
              </button>
            ))}
        </div>
        {hinted.size > 0 && !revealed && (
          <p className="muted small">Hinted words will come back sooner in review.</p>
        )}
      </section>

      <button className="mic" disabled aria-label="Speak your answer (coming in Stage 2)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
        </svg>
      </button>
      <p className="muted small center">Speaking arrives in Stage 2. Type for now.</p>

      <form
        className="answer"
        onSubmit={(e) => {
          e.preventDefault()
          setRevealed(true)
        }}
      >
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type in romanized Nepali"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit">Check</button>
      </form>

      {revealed && (
        <section className="card reveal">
          <p className="eyebrow">One correct answer</p>
          <p className="nepali">{s.nepali.map((c) => c.text).join(' ').replace(' ?', '?')}</p>
          <p className="muted small">
            Grading arrives in Stage 1. This preview only shows the answer.
          </p>
          <button
            className="ghost"
            onClick={() => {
              setRevealed(false)
              setHinted(new Set())
              setAnswer('')
            }}
          >
            Try again
          </button>
        </section>
      )}
    </>
  )
}
