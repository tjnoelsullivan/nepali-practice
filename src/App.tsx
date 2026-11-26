import { useEffect, useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { PrayerFlags } from './components/PrayerFlags'
import { Home } from './screens/Home'
import { Practice } from './screens/Practice'
import { Progress } from './screens/Progress'
import { Library } from './screens/Library'

const TAB_KEY = 'saathi.tab'

function readTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY)
    if (t === 'home' || t === 'practice' || t === 'progress' || t === 'library') return t
  } catch {
    /* storage unavailable */
  }
  return 'home'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readTab)
  const [online, setOnline] = useState(navigator.onLine)

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
        {tab === 'home' && <Home onStart={() => setTab('practice')} />}
        {tab === 'practice' && <Practice />}
        {tab === 'progress' && <Progress />}
        {tab === 'library' && <Library />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}
