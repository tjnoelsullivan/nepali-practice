import { useSyncExternalStore } from 'react'

export type VoiceSettings = {
  voice: 'female' | 'male'
  /** Play the Nepali sentence automatically when a card appears. */
  autoplay: boolean
  /** Listening practice: hide the Nepali text until tapped. */
  hideText: boolean
}

const KEY = 'saathi.voice'
const DEFAULTS: VoiceSettings = { voice: 'female', autoplay: true, hideText: false }

let current: VoiceSettings = load()
const listeners = new Set<() => void>()

function load(): VoiceSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export function getVoiceSettings(): VoiceSettings {
  return current
}

export function setVoiceSettings(patch: Partial<VoiceSettings>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l())
}

export function useVoiceSettings(): VoiceSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
