import { useState } from 'react'
import { isKnown } from '../core/schedule'
import { LessonImport } from '../components/LessonImport'
import { VoiceSettings } from '../components/VoiceSettings'
import { sentenceDevanagari, sentenceNepali } from '../core/types'
import { speak, unlockAudio } from '../voice/tts'
import type { Deck } from '../hooks/useDeck'

const LATER = [
  { title: "Your wife's voice", body: 'Record sentences together and train your ear on her voice.', stage: 'Stage 5', color: 'var(--flag-green)' },
  { title: 'Backup', body: 'Export everything to a file, and restore it on a new phone.', stage: 'Stage 6', color: 'var(--flag-yellow)' },
]

export function Library({ deck }: { deck: Deck }) {
  const [tab, setTab] = useState<'sentences' | 'words'>('sentences')
  const items = [...deck.items.values()].sort((a, b) => a.np.localeCompare(b.np))
  const unverified = deck.sentences.filter((s) => !s.verified).length

  return (
    <>
      <header className="hero compact">
        <p className="eyebrow">Library</p>
        <h1>Your material</h1>
      </header>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'sentences'} className={tab === 'sentences' ? 'on' : ''} onClick={() => setTab('sentences')}>
          Sentences · {deck.sentences.length}
        </button>
        <button role="tab" aria-selected={tab === 'words'} className={tab === 'words' ? 'on' : ''} onClick={() => setTab('words')}>
          Words & grammar · {items.length}
        </button>
      </div>

      {(unverified > 0 || deck.flagCount > 0) && (
        <p className="muted small">
          {unverified} unverified · {deck.flagCount} flagged for your tutor
        </p>
      )}

      {tab === 'sentences' ? (
        <section className="card list">
          {deck.sentences.map((s) => (
            <div
              key={s.id}
              className="row tappable"
              onClick={() => {
                unlockAudio()
                speak(sentenceDevanagari(s)).catch(() => {})
              }}
            >
              <div>
                <div className="row-np">{sentenceNepali(s)}</div>
                <div className="muted small">{s.en}</div>
              </div>
              {!s.verified && <span className="chip warn">Unverified</span>}
            </div>
          ))}
        </section>
      ) : (
        <section className="card list">
          {items.map((i) => (
            <div key={i.id} className="row">
              <div>
                <div className="row-np">{i.np}</div>
                <div className="muted small">{i.en}</div>
              </div>
              <span className="chip">{i.kind === 'grammar' ? 'grammar' : isKnown(deck.cards.get(i.id)) ? 'learning' : 'new'}</span>
            </div>
          ))}
        </section>
      )}

      <LessonImport deck={deck} />

      <VoiceSettings />

      {LATER.map((it) => (
        <section key={it.title} className="card lib-item">
          <span className="lib-bar" style={{ background: it.color }} />
          <div>
            <h2>{it.title}</h2>
            <p className="muted">{it.body}</p>
          </div>
          <span className="chip">{it.stage}</span>
        </section>
      ))}
      <p className="muted small center">Version 0.5 · Stage 4 · Tap a sentence to hear it</p>
    </>
  )
}
