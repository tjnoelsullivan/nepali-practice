import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { db, upsertContent } from './db'
import { STARTER_ITEMS, STARTER_SENTENCES } from './content/starter'
import { startTracker } from './core/tracker'
import { registerSW } from 'virtual:pwa-register'

// Load new versions as soon as they're deployed. Without this, an installed iPhone app keeps
// running the old code until it's fully closed. Checks again whenever the app comes to the front.
const updateSW = registerSW({ immediate: true, onNeedRefresh: () => void updateSW(true) })
const checkForUpdate = () =>
  navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void checkForUpdate()
})

async function boot() {
  try {
    await upsertContent(db, STARTER_ITEMS, STARTER_SENTENCES, { replaceSources: ['seed', 'tutor'] })
  } catch (e) {
    console.error('Could not load starter content', e)
  }
  startTracker()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
