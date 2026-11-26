export function GoalRing({ value, goal, size = 52 }: { value: number; goal: number; size?: number }) {
  const r = 20
  const c = 2 * Math.PI * r
  const pct = Math.min(1, goal ? value / goal : 0)
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r={r} className="ring-track" />
      <circle
        cx="24"
        cy="24"
        r={r}
        className="ring-fill"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
      />
    </svg>
  )
}
