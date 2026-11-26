import { GoalRing } from '../components/GoalRing'
import { InstallHint } from '../components/InstallHint'
import { OnTrack } from '../components/OnTrack'
import { currentStreak, dayKey } from '../core/activity'
import { usePrefs } from '../core/prefs'
import { isDue } from '../core/schedule'
import { useDays } from '../core/tracker'
import type { Deck } from '../hooks/useDeck'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Home({ deck, onStart }: { deck: Deck; onStart: () => void }) {
  const now = new Date()
  const due = [...deck.cards.values()].filter((c) => isDue(c, now)).length
  const { days } = useDays()
  const { goalMinutes: goal } = usePrefs()
  const today = days.get(dayKey(now))
  const streak = currentStreak(days, now, goal * 60_000)
  const minutesToday = Math.floor((today?.activeMs ?? 0) / 60_000)
  const goalMet = minutesToday >= goal
  const left = goal - minutesToday

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
        <div className={'card stat' + (goalMet ? ' lit' : '')}>
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
        <div className={'card stat' + (goalMet ? ' goal-met' : '')}>
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
        <span>{due > 0 ? `Practice · ${due} due` : 'Start practice'}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>

      <OnTrack deck={deck} />

      <section className="card">
        <h2>Today</h2>
        <ul className="focus-list">
          <li>
            <span className="dot" style={{ background: 'var(--flag-red)' }} />
            {due} words and patterns due for review
          </li>
          <li>
            <span className="dot" style={{ background: 'var(--flag-blue)' }} />
            {deck.reviewsToday} reviews done today
          </li>
          <li>
            <span className="dot" style={{ background: 'var(--flag-green)' }} />
            {deck.sentences.length} sentences in your deck
          </li>
        </ul>
        <p className="muted small">
          {goalMet
            ? 'Daily goal met. Nice work!'
            : streak > 0
              ? `${left} more active ${left === 1 ? 'minute' : 'minutes'} today to keep your ${streak}-day streak.`
              : `Reach your ${goal}-minute goal today to start a streak.`}
        </p>
      </section>
    </>
  )
}
