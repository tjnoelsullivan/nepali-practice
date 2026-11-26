import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { db, upsertContent } from './db'
import { STARTER_ITEMS, STARTER_SENTENCES } from './content/starter'

async function boot() {
  try {
    await upsertContent(db, STARTER_ITEMS, STARTER_SENTENCES, { replaceSources: ['seed', 'tutor'] })
  } catch (e) {
    console.error('Could not load starter content', e)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
