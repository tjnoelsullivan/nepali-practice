import { useSyncExternalStore } from 'react'

export type Prefs = { goalMinutes: number }
export const GOAL_CHOICES = [5, 10, 15, 20, 30, 45, 60]

const KEY = 'saathi.prefs'
let current: Prefs = load()
const listeners = new Set<() => void>()

function load(): Prefs {
  try {
    return { goalMinutes: 15, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { goalMinutes: 15 }
  }
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l())
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
