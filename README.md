# Saathi: Nepali practice

A mobile-first PWA for practicing conversational Nepali (romanized), focused on talking with family.
Built in stages; see the plan doc in the project.

## Develop

```
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
npm run preview  # serve the build (service worker active)
```

## Deploy

Hosted on Vercel (framework preset: Vite). Every push to `main` deploys.
Secrets (set in Vercel → Settings → Environment Variables, never committed):

- `ANTHROPIC_API_KEY`: grading, sentence generation, slide import (Stage 1+)
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`: Nepali speech (Stage 2+)

## Stages

- [x] 0. App shell: install to home screen, offline, visual style, navigation
- [ ] 1. Text drill, hints, FSRS scheduling
- [ ] 2. Azure voice in and out
- [ ] 3. Streaks and active-time tracking
- [ ] 4. Tutor slide import
- [ ] 5. Wife's recorded sentences
- [ ] 6. Backup and polish
