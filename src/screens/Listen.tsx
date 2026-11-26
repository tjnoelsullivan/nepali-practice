import { useEffect, useMemo, useRef, useState } from 'react'
import type { Deck } from '../hooks/useDeck'
import { formatDuration } from '../core/activity'
import { listenPool, planEpisode, scenesByTag, type Scene } from '../listen/episode'
import { renderEpisode, type Progress } from '../listen/render'
import { captionAt, loadSavedEpisode, saveEpisode, seek, setEpisode, toggle, usePlayer } from '../listen/player'
import { api, explainError } from '../voice/api'
import '../listen/Listen.css'

type Build =
  | { step: 'idle' }
  | { step: 'writing' }
  | { step: 'rendering'; p: Progress }
  | { step: 'error'; message: string }

const LENGTHS = [15, 30]

async function writeScenes(deck: Deck, ids: string[]): Promise<Scene[]> {
  const byId = new Map(deck.sentences.map((s) => [s.id, s]))
  try {
    const r = await api('/api/scenes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sentences: ids.map((id) => ({ id, en: byId.get(id)!.en, tags: byId.get(id)!.tags })) }),
    })
    const j = (await r.json()) as { scenes: Scene[] }
    if (j.scenes?.length) {
      // Sentences Claude left out still get heard, grouped by topic.
      const used = new Set(j.scenes.flatMap((s) => s.lines.map((l) => l.id)))
      return [...j.scenes, ...scenesByTag(ids.filter((id) => !used.has(id)), byId)]
    }
  } catch {
    /* offline or Claude unavailable: fall back below */
  }
  return scenesByTag(ids, byId)
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function Listen({ deck }: { deck: Deck }) {
  const player = usePlayer()
  const [minutes, setMinutes] = useState(15)
  const [build, setBuild] = useState<Build>({ step: 'idle' })
  const [showText, setShowText] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (player.episode) return
    void loadSavedEpisode().then((e) => e && setEpisode(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pool = useMemo(() => listenPool(deck.sentences, deck.cards), [deck.sentences, deck.cards])
  const sayCount = [...pool.values()].filter((m) => m === 'say').length

  const make = async () => {
    const byId = new Map(deck.sentences.map((s) => [s.id, s]))
    abort.current = new AbortController()
    try {
      setBuild({ step: 'writing' })
      // Known lines first, then ones being learned; at most 120 to keep the request small.
      const ids = [
        ...shuffle([...pool].filter(([, m]) => m === 'say').map(([id]) => id)),
        ...shuffle([...pool].filter(([, m]) => m === 'repeat').map(([id]) => id)),
      ].slice(0, 120)
      const scenes = await writeScenes(deck, ids)
      // Plan long, then stop at the right moment once real voice lengths are known.
      const steps = planEpisode(shuffle(scenes), pool, byId, Math.round(minutes * 1.6))
      if (!steps.length) throw new Error('Nothing to play yet.')
      setBuild({ step: 'rendering', p: { done: 0, total: 1, stage: 'voices' } })
      const r = await renderEpisode(steps, (p) => setBuild({ step: 'rendering', p }), abort.current.signal, minutes * 60 - 20)
      const episode = {
        ...r,
        minutes,
        createdAt: new Date(),
        scenes: [...new Set(r.cues.map((c) => c.caption.scene))].filter((s) => !['Welcome', 'Done', 'Quick review'].includes(s)),
      }
      await saveEpisode(episode).catch(() => {})
      setEpisode(episode)
      setBuild({ step: 'idle' })
    } catch (e) {
      if ((e as Error).name === 'AbortError') setBuild({ step: 'idle' })
      else setBuild({ step: 'error', message: e instanceof Error && !('status' in e) && navigator.onLine ? e.message : explainError(e) })
    }
  }

  const ep = player.episode
  const caption = ep ? captionAt(ep.cues, player.time) : undefined
  const building = build.step === 'writing' || build.step === 'rendering'

  return (
    <>
      <header className="hero compact">
        <p className="eyebrow">Listen</p>
        <h1>Hands-free practice</h1>
        <p className="sub">For the car or the shower. Press play once and speak in the pauses.</p>
      </header>

      {pool.size === 0 ? (
        <section className="card">
          <p className="muted">
            Episodes use only sentences you've practiced. Do a few Practice sessions first, then come back here.
          </p>
        </section>
      ) : (
        <>
          {ep && (
            <section className="card listen-player">
              <div className="lp-scene">{caption?.scene ?? 'Ready'}</div>
              <button
                className={'lp-play' + (player.playing ? ' on' : '')}
                aria-label={player.playing ? 'Pause' : 'Play'}
                onClick={toggle}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {player.playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l11-6.5z" />}
                </svg>
              </button>
              <div className="lp-bar">
                <button aria-label="Back 15 seconds" onClick={() => seek(player.time - 15)}>
                  −15
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.round(ep.seconds)}
                  value={Math.round(player.time)}
                  onChange={(e) => seek(Number(e.target.value))}
                  aria-label="Position"
                />
                <button aria-label="Forward 15 seconds" onClick={() => seek(player.time + 15)}>
                  +15
                </button>
              </div>
              <div className="lp-times muted small">
                <span>{clock(player.time)}</span>
                <span>{clock(ep.seconds)}</span>
              </div>
              <button className="lp-text-toggle ghost tiny" onClick={() => setShowText(!showText)}>
                {showText ? 'Hide words' : 'Show words'}
              </button>
              {showText && caption && (caption.en || caption.np) && (
                <div className="lp-caption">
                  {caption.en && <div>{caption.en}</div>}
                  {caption.np && <div className="lp-np">{caption.np}</div>}
                </div>
              )}
              <p className="muted small">
                Keeps playing with the screen locked. Use your lock screen, car or AirPods to pause. Listening time counts
                toward your daily goal and streak.
              </p>
            </section>
          )}

          <section className="card">
            <h2>{ep ? 'New episode' : 'Make an episode'}</h2>
            <p className="muted small">
              {sayCount} sentences you can say, {pool.size - sayCount} you're still learning. Lines you know, you'll be
              asked to say first. New ones you'll repeat.
            </p>
            <div className="segmented small-seg" role="radiogroup" aria-label="Length">
              {LENGTHS.map((m) => (
                <button key={m} className={minutes === m ? 'on' : ''} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                  {m} min
                </button>
              ))}
            </div>
            {building ? (
              <div className="lp-build">
                <div className="lp-progress">
                  <span
                    style={{
                      width:
                        build.step === 'rendering'
                          ? `${Math.round(((build.p.stage === 'voices' ? 0 : 60) + (build.p.done / Math.max(1, build.p.total)) * (build.p.stage === 'voices' ? 60 : 40)))}%`
                          : '5%',
                    }}
                  />
                </div>
                <p className="small muted">
                  {build.step === 'writing'
                    ? 'Writing scenes…'
                    : build.p.stage === 'voices'
                      ? `Recording voices ${build.p.done} of ${build.p.total}…`
                      : 'Putting it together…'}
                </p>
                <button className="ghost" onClick={() => abort.current?.abort()}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="cta" onClick={() => void make()}>
                <span>{ep ? `Make a new ${minutes}-minute episode` : `Make a ${minutes}-minute episode`}</span>
              </button>
            )}
            {build.step === 'error' && <p className="small error-text">{build.message}</p>}
            {ep && !building && (
              <p className="muted small">
                Current episode: {formatDuration(ep.seconds * 1000)}, made {ep.createdAt.toLocaleDateString()}. It stays on
                your phone, so it plays without a signal.
              </p>
            )}
          </section>
        </>
      )}
    </>
  )
}
