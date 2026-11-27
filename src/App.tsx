import { lazy, Suspense, useEffect, useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { PrayerFlags } from './components/PrayerFlags'
import { Home } from './screens/Home'
import { Practice } from './screens/Practice'
import { Progress } from './screens/Progress'
import { useDeck } from './hooks/useDeck'

// The Library (lesson import, recordings, backup) is only needed when opened, so it loads separately.
const Library = lazy(() => import('./screens/Library').then((m) => ({ default: m.Library })))

// Listen includes the MP3 encoder, so it also loads only when opened.
const Listen = lazy(() => import('./screens/Listen').then((m) => ({ default: m.Listen })))

const TAB_KEY = 'saathi.tab'

function readTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY)
    if (t === 'home' || t === 'practice' || t === 'listen' || t === 'progress' || t === 'library') return t
  } catch {
    /* storage unavailable */
  }
  return 'home'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readTab)
  const [online, setOnline] = useState(navigator.onLine)
  const deck = useDeck()

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab)
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0 })
  }, [tab])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <div className="app">
      <div className="sky" aria-hidden="true" />
      <PrayerFlags />
      {!online && <div className="offline-pill">Offline. Practice still works.</div>}
      <main className="screen" key={tab}>
        {tab === 'home' && <Home deck={deck} onStart={() => setTab('practice')} />}
        {tab === 'practice' && <Practice deck={deck} />}
        {tab === 'listen' && (
          <Suspense fallback={<p className="muted center">Loading…</p>}>
            <Listen deck={deck} />
          </Suspense>
        )}
        {tab === 'progress' && <Progress deck={deck} />}
        {tab === 'library' && (
          <Suspense fallback={<p className="muted center">Loading…</p>}>
            <Library deck={deck} />
          </Suspense>
        )}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}
