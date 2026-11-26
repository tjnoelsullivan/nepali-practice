# Saathi: Nepali practice

A mobile-first PWA for practicing conversational Nepali (romanized), focused on talking with family.
Built in stages; see the plan doc in the project.

## Develop

```
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
npm run preview  # serve the build (service worker active)
npm test         # unit tests
```

## Content

The built-in deck lives in `content/` (sentences, word lexicon, grammar list) and is compiled with
`node scripts/build-deck.mjs` into `src/content/deck.json`. Tutor sentences are marked verified;
new sentences are unverified until the tutor checks them. Adding content never resets learning history.
`content/devanagari.tsv` gives the Devanagari for each lexicon form. It is used only for the Azure voice
and for matching speech, never shown in the app; the build fails if a form is missing.

## Deploy

Hosted on Vercel (framework preset: Vite). Every push to `main` deploys.
Secrets (set in Vercel → project Settings → Environments → Production and Preview, never committed):

- `ANTHROPIC_API_KEY`: second-opinion grading (`/api/grade`), later sentence generation and slide import
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`: Nepali voice (`/api/tts`) and speech recognition tokens (`/api/speech-token`)
- `APP_ACCESS_CODE` (optional): when set, the app must send this code (entered once in Library → Settings)

## Stages

- [x] 0. App shell: install to home screen, offline, visual style, navigation
- [x] 1. Text drill, hints, FSRS scheduling
- [x] 2. Azure voice in and out
- [x] 3. Streaks and active-time tracking
- [ ] 4. Tutor slide import
- [ ] 5. Wife's recorded sentences
- [ ] 6. Backup and polish
