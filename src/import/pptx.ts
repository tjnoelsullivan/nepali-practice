// Reads the text of a PowerPoint (.pptx) file on the phone. A .pptx is a zip of XML files;
// we only open the slide XML (not images), so even big decks are quick.
import { unzip } from 'fflate'

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

/** Text lines of one slide's XML: one line per paragraph, empty ones dropped. */
export function slideLines(xml: string): string[] {
  const lines: string[] = []
  for (const p of xml.split(/<a:p[ >]/).slice(1)) {
    const runs = [...p.matchAll(/<a:t>([^<]*)<\/a:t>|<a:t [^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1] ?? m[2] ?? '')
    const line = decode(runs.join('')).replace(/\s+/g, ' ').trim()
    if (line) lines.push(line)
  }
  return lines
}

export async function extractSlides(file: File): Promise<string[][]> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(buf, { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) }, (err, out) =>
      err ? reject(new Error('This file is not a PowerPoint (.pptx) file.')) : resolve(out),
    ),
  )
  const td = new TextDecoder()
  const num = (n: string) => Number(/(\d+)\.xml$/.exec(n)?.[1] ?? 0)
  return Object.keys(files)
    .sort((a, b) => num(a) - num(b))
    .map((name) => slideLines(td.decode(files[name])))
    .filter((lines) => lines.length > 0)
}
