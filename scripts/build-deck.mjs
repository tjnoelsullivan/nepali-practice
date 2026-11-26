// Builds src/content/deck.json from content/deck.txt + content/lexicon.tsv + content/grammar.tsv.
// Run: node scripts/build-deck.mjs   (fails listing any word missing from the lexicon)
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

function tsv(p) {
  return read(p)
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split('\t').map((x) => x.trim()))
}

// lexicon: form \t itemId (or -) \t gloss \t [lemma np] \t [lemma en]
const lex = new Map()
const items = new Map()
for (const [form, id, gloss, lemmaNp, lemmaEn] of tsv('content/lexicon.tsv')) {
  lex.set(norm(form), { id, gloss })
  if (id !== '-' && !items.has(id)) {
    items.set(id, { id, kind: 'word', np: lemmaNp || form.toLowerCase(), en: lemmaEn || gloss, source: 'tutor', verified: true })
  } else if (id !== '-' && lemmaNp) {
    Object.assign(items.get(id), { np: lemmaNp, en: lemmaEn || items.get(id).en })
  }
}
for (const [id, np, en, verified] of tsv('content/grammar.tsv')) {
  items.set(id, { id, kind: 'grammar', np, en, source: 'tutor', verified: verified !== 'unverified' })
}

// devanagari: form \t Devanagari (for the Azure voice + speech matching; never displayed)
const dev = new Map()
for (const [form, d] of tsv('content/devanagari.tsv')) dev.set(norm(form), d)
const devPunct = (p) => p.replace(/\./g, '।')
const noDev = new Set()

const sentences = []
const missing = new Map()
let verified = true
let source = 'tutor'
let n = 0
for (const raw of read('content/deck.txt').split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  if (line.startsWith('@')) {
    verified = line.startsWith('@verified')
    source = /source=(\w+)/.exec(line)?.[1] ?? source
    continue
  }
  const [en, np, tags, grammar, alts] = line.split('||').map((x) => (x ?? '').trim())
  const chunks = []
  for (let tok of np.split(/\s+/)) {
    const tail = /([?.!,]+)$/.exec(tok)?.[1] ?? ''
    if (tail) tok = tok.slice(0, -tail.length)
    const g = [...tok.matchAll(/\{(g:[\w-]+)\}/g)].map((m) => m[1])
    tok = tok.replace(/\{g:[\w-]+\}/g, '')
    const text = tok.replace(/_/g, ' ')
    const entry = lex.get(norm(text))
    if (!entry) missing.set(norm(text), (missing.get(norm(text)) ?? []).concat(en))
    const d = dev.get(norm(text))
    if (!d) noDev.add(norm(text))
    chunks.push({ np: text, en: entry?.gloss ?? '?', dev: d ?? '', items: [...(entry && entry.id !== '-' ? [entry.id] : []), ...g] })
    if (tail) chunks.push({ np: tail, en: '', dev: devPunct(tail), items: [] })
  }
  const lineGrammar = grammar ? grammar.split(',').map((x) => x.trim()).filter(Boolean) : []
  const last = [...chunks].reverse().find((c) => c.en)
  if (last) last.items.push(...lineGrammar)
  for (const c of chunks) for (const id of c.items) if (id.startsWith('g:') && !items.has(id)) missing.set(id, ['grammar'])
  n++
  sentences.push({
    id: `${source}:${norm(en).replace(/ /g, '-').slice(0, 60)}`,
    en,
    enAlts: alts ? alts.split(';').map((x) => x.trim()).filter(Boolean) : undefined,
    chunks,
    tags: tags.split(',').map((x) => x.trim()).filter(Boolean),
    source,
    verified,
  })
}

if (missing.size) {
  console.error('Missing from lexicon/grammar:')
  for (const [k, v] of missing) console.error(`  ${k}\t(${v[0]})`)
  process.exit(1)
}
if (noDev.size) {
  console.error('Missing from devanagari.tsv:\n  ' + [...noDev].join('\n  '))
  process.exit(1)
}
const ids = new Set()
for (const s of sentences) {
  if (ids.has(s.id)) throw new Error('duplicate id ' + s.id)
  ids.add(s.id)
}
const used = new Set(sentences.flatMap((s) => s.chunks.flatMap((c) => c.items)))
const out = { items: [...items.values()].filter((i) => used.has(i.id)), sentences }
fs.writeFileSync(path.join(root, 'src/content/deck.json'), JSON.stringify(out, null, 1))
console.log(`Built ${n} sentences, ${out.items.length} items`)
