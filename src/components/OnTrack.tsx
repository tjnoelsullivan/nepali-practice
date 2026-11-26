import { useEffect, useMemo, useState } from "react";
import { addDays, dayKey } from "../core/activity";
import {
  lastStudyDay,
  measurePace,
  planUntilLesson,
  type Pace,
} from "../core/plan";
import { GOAL_CHOICES, setPrefs, usePrefs } from "../core/prefs";
import { useDays } from "../core/tracker";
import { db } from "../db";
import type { Deck } from "../hooks/useDeck";
import "./OnTrack.css";

/** Reviews from the last four weeks, to measure items graded per answer. */
function useReviewTimes(deck: Deck) {
  const [times, setTimes] = useState<number[]>([]);
  useEffect(() => {
    const since = addDays(new Date(), -28);
    void db.reviews
      .where("at")
      .aboveOrEqual(since)
      .toArray()
      .then((rs) => setTimes(rs.map((r) => new Date(r.at).getTime())));
  }, [deck.cards]);
  return times;
}

export function OnTrack({ deck }: { deck: Deck }) {
  const { days } = useDays();
  const { goalMinutes: goal, lessonDays } = usePrefs();
  const times = useReviewTimes(deck);
  const now = new Date();
  const todayKey = dayKey(now);

  const pace: Pace = useMemo(() => {
    const cutoff = dayKey(addDays(new Date(), -28));
    return measurePace(
      [...days.values()].filter((d) => d.date >= cutoff),
      times,
    );
  }, [days, times]);

  const doneToday = (days.get(todayKey)?.activeMs ?? 0) / 60_000;
  const plan = useMemo(
    () =>
      planUntilLesson(
        deck.sentences,
        deck.cards,
        new Date(),
        lessonDays,
        pace,
        doneToday,
      ),
    // Recompute when the deck, pace, lesson days, or day changes; not every active minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck.sentences, deck.cards, lessonDays, pace, todayKey],
  );

  if (!deck.ready) return null;
  if (!plan) {
    return (
      <section className="card on-track">
        <h2>On track</h2>
        <p className="muted small">
          Set your lesson days in Library → Settings to see how much to practice
          before each lesson.
        </p>
      </section>
    );
  }

  const perDay = Math.max(1, plan.minutesPerDay);
  const leftToday = Math.max(0, Math.ceil(perDay - doneToday));
  const until = lastStudyDay(plan, now);
  const suggested =
    GOAL_CHOICES.find((g) => g >= perDay) ??
    GOAL_CHOICES[GOAL_CHOICES.length - 1];
  const status = plan.answers === 0 ? "clear" : perDay <= goal ? "ok" : "over";

  return (
    <section className={"card on-track " + status}>
      <div className="ot-head">
        <h2>On track for {plan.lessonDayName}</h2>
        <span className="ot-days">
          {plan.daysLeft} {plan.daysLeft === 1 ? "day" : "days"} left
        </span>
      </div>

      {status === "clear" ? (
        <p className="ot-big">
          You're all caught up before {plan.lessonDayName}'s lesson.
        </p>
      ) : (
        <>
          <p className="ot-big">
            <strong>~{perDay} min</strong>{" "}
            {until === "today" ? "today" : `a day through ${until}`}
          </p>
          <ul className="ot-parts">
            {plan.newItems > 0 && (
              <li>
                <b>{plan.newItems}</b> new{" "}
                {plan.newItems === 1 ? "word or pattern" : "words and patterns"}{" "}
                to learn
              </li>
            )}
            {plan.dueItems > 0 && (
              <li>
                <b>{plan.dueItems}</b> you know coming up for review
              </li>
            )}
            <li>
              About <b>{plan.answers}</b> sentences in all
            </li>
          </ul>
          <p className="muted small">
            {leftToday > 0
              ? `${leftToday} more ${leftToday === 1 ? "minute" : "minutes"} today keeps you on pace.`
              : "On pace for today."}{" "}
            {status === "over" && `That's more than your ${goal}-minute goal.`}
          </p>
          {status === "over" && suggested !== goal && (
            <button
              className="ot-goal"
              onClick={() => setPrefs({ goalMinutes: suggested })}
            >
              Make {suggested} min my daily goal
            </button>
          )}
        </>
      )}
      <p className="ot-note">
        {pace.measured
          ? `Based on your pace: about ${Math.round(pace.secPerAnswer)} seconds a sentence.`
          : `Guessing ${pace.secPerAnswer} seconds a sentence until there's more practice to measure.`}
      </p>
    </section>
  );
}
