import { bestStreak, currentStreak, dayPracticed, formatDuration, weekKeys } from '../core/activity'
import { usePrefs } from '../core/prefs'
import { isDue, isKnown, isMastered } from '../core/schedule'
import { useDays } from '../core/tracker'
import type { Deck } from '../hooks/useDeck'

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function Progress({ deck }: { deck: Deck }) {
  const now = new Date()
  const cards = [...deck.cards.values()]
  const learning = cards.filter((c) => isKnown(c) && !isMastered(c)).length
  const due = cards.filter((c) => isDue(c, now)).length
  const mastered = cards.filter((c) => isMastered(c)).length

  const { days } = useDays()
  const { goalMinutes: goal } = usePrefs()
  const thisWeek = weekKeys(now)
  const lastWeek = weekKeys(now, 1)
  const ms = (k: string) => days.get(k)?.activeMs ?? 0
  const week = thisWeek.map((k) => ms(k) / 60_000)
  const weekMs = thisWeek.reduce((n, k) => n + ms(k), 0)
  const lastWeekMs = lastWeek.reduce((n, k) => n + ms(k), 0)
  const daysPracticed = thisWeek.filter((k) => dayPracticed(days.get(k))).length
  const goalDays = week.filter((m) => m >= goal).length
  const scale = Math.max(goal, ...week) * 1.1
  const todayIdx = (now.getDay() + 6) % 7
  const streak = currentStreak(days, now, goal * 60_000)
  const best = bestStreak(days, goal * 60_000)

  return (
    <>
      <header className="hero compact">
        <p className="eyebrow">Progress</p>
        <h1>This week</h1>
      </header>

      <section className="card">
        <div className="week-head">
          <div>
            <div className="big">{formatDuration(weekMs)}</div>
            <div className="label">active this week</div>
          </div>
          <div className="right">
            <div className="big">{streak}</div>
            <div className="label">day streak{best > streak ? ` · best ${best}` : ''}</div>
          </div>
        </div>
        <div className="bars" role="img" aria-label="Active minutes per day this week">
          {week.map((m, i) => (
            <div key={i} className={'bar-col' + (i === todayIdx ? ' today' : '')}>
              <div className="mins">{m >= 1 ? Math.floor(m) : ''}</div>
              <div className="bar-track">
                <div className={'bar' + (m >= goal ? ' met' : '')} style={{ height: `${(m / scale) * 100}%` }} />
                <div className="goal-line" style={{ top: `${(1 - goal / scale) * 100}%` }} />
              </div>
              <span>{DAYS[i]}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          {daysPracticed} of 7 days practiced · goal of {goal} min reached on {goalDays} {goalDays === 1 ? 'day' : 'days'}
          {lastWeekMs > 0 ? ` · last week ${formatDuration(lastWeekMs)}` : ''}
        </p>
        <p className="muted small">
          Only active time counts: the clock stops 30 seconds after your last tap, word or sound. Your streak grows on
          days you reach your goal.
        </p>
      </section>

      <section className="card">
        <h2>Words and grammar</h2>
        <div className="mastery">
          <div>
            <div className="big">{learning}</div>
            <div className="label">learning</div>
          </div>
          <div>
            <div className="big">{due}</div>
            <div className="label">due now</div>
          </div>
          <div>
            <div className="big">{mastered}</div>
            <div className="label">mastered</div>
          </div>
        </div>
        <p className="muted small">Mastered means you're expected to remember it for 3+ weeks.</p>
      </section>
    </>
  )
}
