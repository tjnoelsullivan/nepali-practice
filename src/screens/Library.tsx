const ITEMS = [
  {
    title: 'Family sentences',
    body: 'Starter deck for your wife and in-laws, checked by your tutor.',
    stage: 'Stage 1',
    color: 'var(--flag-red)',
  },
  {
    title: 'Tutor lessons',
    body: 'Import slides twice a week; new words and grammar join your deck.',
    stage: 'Stage 4',
    color: 'var(--flag-blue)',
  },
  {
    title: "Your wife's voice",
    body: 'Record sentences together and train your ear on her voice.',
    stage: 'Stage 5',
    color: 'var(--flag-green)',
  },
  {
    title: 'Backup',
    body: 'Export everything to a file, and restore it on a new phone.',
    stage: 'Stage 6',
    color: 'var(--flag-yellow)',
  },
]

export function Library() {
  return (
    <>
      <header className="hero compact">
        <p className="eyebrow">Library</p>
        <h1>Your material</h1>
      </header>
      {ITEMS.map((it) => (
        <section key={it.title} className="card lib-item">
          <span className="lib-bar" style={{ background: it.color }} />
          <div>
            <h2>{it.title}</h2>
            <p className="muted">{it.body}</p>
          </div>
          <span className="chip">{it.stage}</span>
        </section>
      ))}
      <p className="muted small center">Version 0.1 · Stage 0</p>
    </>
  )
}
