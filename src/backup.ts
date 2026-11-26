import { db, type SaathiDB } from './db'

/**
 * Backup file format. Everything lives on the phone, so this file is the only copy outside it.
 * Dates and audio bytes don't survive JSON, so they're tagged and restored on the way back in.
 */
export type BackupFile = {
  app: 'saathi'
  format: 1
  exportedAt: string
  dbVersion: number
  tables: Record<string, unknown[]>
  /** App settings from localStorage (saathi.* keys), minus the access code. */
  settings: Record<string, string>
}

const SKIP_SETTINGS = new Set(['saathi.accessCode', 'saathi.lastBackup'])
const LAST_BACKUP = 'saathi.lastBackup'

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(b64: string): ArrayBuffer {
  const s = atob(b64)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes.buffer
}

/** Tag values JSON can't hold: Date -> {$date}, ArrayBuffer -> {$bytes}. */
export function encode(v: unknown): unknown {
  if (v instanceof Date) return { $date: v.toISOString() }
  if (v instanceof ArrayBuffer) return { $bytes: toBase64(v) }
  if (Array.isArray(v)) return v.map(encode)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = encode(x)
    return out
  }
  return v
}

export function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode)
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const keys = Object.keys(o)
    if (keys.length === 1 && typeof o.$date === 'string') return new Date(o.$date)
    if (keys.length === 1 && typeof o.$bytes === 'string') return fromBase64(o.$bytes)
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(o)) out[k] = decode(x)
    return out
  }
  return v
}

async function blobToArrayBuffer(b: Blob): Promise<ArrayBuffer> {
  return b.arrayBuffer()
}

export async function buildBackup(d: SaathiDB = db): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {}
  for (const t of d.tables) {
    let rows = await t.toArray()
    // Recordings from before audio was stored as bytes may still hold a Blob.
    if (t.name === 'recordings') {
      rows = await Promise.all(
        rows.map(async (r: Record<string, unknown>) => {
          if (r.blob instanceof Blob) {
            const { blob, ...rest } = r
            return { ...rest, data: await blobToArrayBuffer(blob as Blob) }
          }
          return r
        }),
      )
    }
    // The current Listen episode is a large audio file that's quick to make again.
    if (t.name === 'meta') rows = rows.filter((r: { key?: string }) => r.key !== 'listenEpisode')
    tables[t.name] = rows.map(encode)
  }
  const settings: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.startsWith('saathi.') && !SKIP_SETTINGS.has(k)) settings[k] = localStorage.getItem(k) ?? ''
    }
  } catch {
    /* private mode */
  }
  return { app: 'saathi', format: 1, exportedAt: new Date().toISOString(), dbVersion: d.verno, tables, settings }
}

export type BackupSummary = { exportedAt: Date; sentences: number; reviews: number; recordings: number; days: number }

/** Check a file is a Saathi backup and summarize it, without changing anything. */
export function readBackup(text: string): { file: BackupFile; summary: BackupSummary } {
  let file: BackupFile
  try {
    file = JSON.parse(text)
  } catch {
    throw new Error("This file isn't a Saathi backup.")
  }
  if (file?.app !== 'saathi' || !file.tables) throw new Error("This file isn't a Saathi backup.")
  if (file.format > 1) throw new Error('This backup is from a newer version of Saathi. Update the app first.')
  const n = (t: string) => file.tables[t]?.length ?? 0
  return {
    file,
    summary: {
      exportedAt: new Date(file.exportedAt),
      sentences: n('sentences'),
      reviews: n('reviews'),
      recordings: n('recordings'),
      days: n('days'),
    },
  }
}

/** Replace everything on this phone with the backup. */
export async function restoreBackup(file: BackupFile, d: SaathiDB = db) {
  const names = d.tables.map((t) => t.name)
  await d.transaction('rw', d.tables, async () => {
    for (const name of names) {
      const t = d.table(name)
      await t.clear()
      const rows = file.tables[name]
      if (rows?.length) await t.bulkPut(rows.map(decode) as never[])
    }
  })
  try {
    for (const [k, v] of Object.entries(file.settings ?? {})) {
      if (k.startsWith('saathi.') && !SKIP_SETTINGS.has(k)) localStorage.setItem(k, v)
    }
  } catch {
    /* private mode */
  }
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `saathi-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`
}

export function markBackedUp(at = new Date()) {
  try {
    localStorage.setItem(LAST_BACKUP, at.toISOString())
  } catch {
    /* private mode */
  }
}

export function lastBackup(): Date | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP)
    return v ? new Date(v) : null
  } catch {
    return null
  }
}

/** Ask the browser not to clear app storage when space runs low. */
export function requestPersistentStorage() {
  void navigator.storage?.persist?.().catch(() => {})
}
