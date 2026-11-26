const COLORS = ['var(--flag-blue)', 'var(--flag-white)', 'var(--flag-red)', 'var(--flag-green)', 'var(--flag-yellow)']

export function PrayerFlags() {
  const flags = Array.from({ length: 15 }, (_, i) => i)
  return (
    <div className="flags" aria-hidden="true">
      <svg viewBox="0 0 400 40" preserveAspectRatio="none" className="flags-line">
        <path d="M0 6 Q200 26 400 6" />
      </svg>
      <div className="flags-row">
        {flags.map((i) => {
          const x = (i + 0.5) / flags.length
          const sag = 4 * x * (1 - x) * 20
          return (
            <span
              key={i}
              className="flag"
              style={{
                background: COLORS[i % COLORS.length],
                transform: `translateY(${sag}px)`,
                animationDelay: `${(i * 0.17) % 1.6}s`,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
