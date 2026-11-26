import { GoalRing } from '../components/GoalRing'
import { InstallHint } from '../components/InstallHint'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Home({ onStart }: { onStart: () => void }) {
  const streak = 0
  const minutesToday = 0
  const goal = 15

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{greeting()}</p>
        <h1>
          Namaste, <span className="accent">TJ</span>
        </h1>
        <p className="sub">Ready for a few sentences with the family?</p>
      </header>

      <InstallHint />

      <section className="stat-row">
        <div className="card stat">
          <div className="flame" aria-hidden="true">
            <svg viewBox="0 0 24 32">
              <path d="M12 1c1 6 9 9 9 18a9 9 0 0 1-18 0c0-5 3-7 4-11 1 3 2 4 3 4 0-4 1-8 2-11z" />
            </svg>
          </div>
          <div>
            <div className="big">{streak}</div>
            <div className="label">day streak</div>
          </div>
        </div>
        <div className="card stat">
          <GoalRing value={minutesToday} goal={goal} />
          <div>
            <div className="big">
              {minutesToday}
              <small>/{goal}</small>
            </div>
            <div className="label">active min today</div>
          </div>
        </div>
      </section>

      <button className="cta" onClick={onStart}>
        <span>Start practice</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>

      <section className="card">
        <h2>Today's focus</h2>
        <ul className="focus-list">
          <li>
            <span className="dot" style={{ background: 'var(--flag-red)' }} />
            Mealtime with your in-laws
          </li>
          <li>
            <span className="dot" style={{ background: 'var(--flag-blue)' }} />
            Asking how someone is
          </li>
          <li>
            <span className="dot" style={{ background: 'var(--flag-green)' }} />
            Making plans with your wife
          </li>
        </ul>
        <p className="muted small">Sample topics. Real ones arrive in Stage 1.</p>
      </section>
    </>
  )
}
