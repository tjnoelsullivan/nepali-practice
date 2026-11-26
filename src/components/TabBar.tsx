export type Tab = 'home' | 'practice' | 'progress' | 'library'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z" />
    ),
  },
  {
    id: 'practice',
    label: 'Practice',
    icon: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
      </>
    ),
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
  {
    id: 'library',
    label: 'Library',
    icon: (
      <>
        <path d="M4 4.5h5a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H4z" />
        <path d="M20 4.5h-5a3 3 0 0 0-3 3V20a2.5 2.5 0 0 1 2.5-2.5H20z" />
      </>
    ),
  },
]

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={'tab' + (tab === t.id ? ' active' : '')}
          onClick={() => onChange(t.id)}
          aria-current={tab === t.id ? 'page' : undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {t.icon}
          </svg>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
