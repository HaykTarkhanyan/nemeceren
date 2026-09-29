// Per-device settings, kept in localStorage in both modes.
import { useSyncExternalStore } from 'react'
import { z } from 'zod'

export const RATES = [0.7, 0.85, 1] as const

const Settings = z.object({
  voiceURI: z.string().nullable(),
  rate: z.union([z.literal(0.7), z.literal(0.85), z.literal(1)]),
  newPerDay: z.number().int().min(0).max(100),
  /** Where word reviews take their words from, as plan.ts sourceKey: "all", "unit:2", "lesson:<id>". */
  wordSource: z.string(),
})
export type Settings = z.infer<typeof Settings>

const KEY = 'nemeceren.settings'
const DEFAULTS: Settings = { voiceURI: null, rate: 0.85, newPerDay: 10, wordSource: 'all' }

let current: Settings | null = null
const listeners = new Set<() => void>()

function load(): Settings {
  const raw = localStorage.getItem(KEY)
  if (raw === null) return DEFAULTS
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Settings saved in this browser (localStorage "${KEY}") are not valid JSON: ${(err as Error).message}`)
  }
  const parsed = Settings.safeParse({ ...DEFAULTS, ...(stored as object) })
  if (!parsed.success) {
    throw new Error(`Settings saved in this browser (localStorage "${KEY}") are invalid: ${parsed.error.message}`)
  }
  return parsed.data
}

export function getSettings(): Settings {
  if (current === null) current = load()
  return current
}

/** Throws if the browser refuses to store the value; callers show the error. */
export function updateSettings(patch: Partial<Settings>): void {
  const next = Settings.parse({ ...getSettings(), ...patch })
  localStorage.setItem(KEY, JSON.stringify(next))
  current = next
  listeners.forEach((l) => l())
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getSettings,
  )
}
