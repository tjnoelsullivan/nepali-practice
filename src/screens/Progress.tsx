const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function Progress() {
  const week = [0, 0, 0, 0, 0, 0, 0]
  const goal = 15
  const todayIdx = (new Date().getDay() + 6) % 7
  return (
    <>
      <header className="hero compact">
        <p className="eyebrow">Progress</p>
        <h1>This week</h1>
      </header>

      <section className="card">
        <div className="week-head">
          <div>
            <div className="big">0h 0m</div>
            <div className="label">active this week</div>
          </div>
          <div className="right">
            <div className="big">0</div>
            <div className="label">day streak</div>
          </div>
        </div>
        <div className="bars">
          {week.map((m, i) => (
            <div key={i} className={'bar-col' + (i === todayIdx ? ' today' : '')}>
              <div className="bar-track">
                <div className="bar" style={{ height: `${Math.min(100, (m / goal) * 100)}%` }} />
                <div className="goal-line" />
              </div>
              <span>{DAYS[i]}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          Only active time counts. If you leave the app open and walk away, the clock stops after a
          minute. Tracking starts in Stage 3.
        </p>
      </section>

      <section className="card">
        <h2>Words and grammar</h2>
        <div className="mastery">
          <div>
            <div className="big">0</div>
            <div className="label">learning</div>
          </div>
          <div>
            <div className="big">0</div>
            <div className="label">due today</div>
          </div>
          <div>
            <div className="big">0</div>
            <div className="label">mastered</div>
          </div>
        </div>
      </section>
    </>
  )
}
