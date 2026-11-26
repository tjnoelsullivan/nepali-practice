import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { db, upsertContent } from './db'
import { STARTER_ITEMS, STARTER_SENTENCES } from './content/starter'
import { startTracker } from './core/tracker'
import { requestPersistentStorage } from './backup'
import { registerSW } from 'virtual:pwa-register'

// Load new versions as soon as they're deployed. Without this, an installed iPhone app keeps
// running the old code until it's fully closed. Checks again whenever the app comes to the front.
const updateSW = registerSW({ immediate: true, onNeedRefresh: () => void updateSW(true) })
const checkForUpdate = () =>
  navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void checkForUpdate()
})

/** A quick hash of the built-in content, so a launch with no new content skips the database writes. */
function starterSignature(): string {
  const text = JSON.stringify([STARTER_ITEMS, STARTER_SENTENCES])
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${STARTER_SENTENCES.length}:${(h >>> 0).toString(36)}`
}

async function boot() {
  try {
    // Only rewrite the built-in sentences when they've changed since the last launch.
    const sig = starterSignature()
    const prev = await db.meta.get('starterSig')
    if (prev?.value !== sig) {
      await upsertContent(db, STARTER_ITEMS, STARTER_SENTENCES, { replaceSources: ['seed', 'tutor'] })
      await db.meta.put({ key: 'starterSig', value: sig })
    }
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

// Ask iOS to keep the app's data even when the phone is low on space.
requestPersistentStorage()
