// Light or dark colours, chosen per device with the header button: "system" follows the device
// setting. The choice is kept in localStorage. index.html applies it before the first paint
// (same key and values); this module reports storage problems, applies changes and follows the
// device setting while "system" is chosen. styles.css keys the dark colours on data-theme.
import { useSyncExternalStore } from 'react'
import { messageOf, reportError } from './errors.ts'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

const KEY = 'nemeceren.theme'

/** The button cycles System -> Light -> Dark -> System. */
export function nextTheme(t: Theme): Theme {
  return THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]
}

/** The colours to show: "system" becomes light or dark from the device setting. */
export function resolveTheme(t: Theme, systemDark: boolean): 'light' | 'dark' {
  if (t === 'system') return systemDark ? 'dark' : 'light'
  return t
}

/** The saved choice. An unreadable or unknown value means "system", and the reason is reported. */
export function readTheme(storage: Pick<Storage, 'getItem'>): Theme {
  let raw: string | null
  try {
    raw = storage.getItem(KEY)
  } catch (err) {
    reportError(`The theme choice cannot be read on this device, so the app follows the system theme: ${messageOf(err)}`)
    return 'system'
  }
  if (raw === null) return 'system'
  const known = THEMES.find((t) => t === raw)
  if (!known) reportError(`The saved theme "${raw}" is unknown, so the app follows the system theme.`)
  return known ?? 'system'
}

let theme: Theme = 'system'
let media: MediaQueryList | null = null
const listeners = new Set<() => void>()

function apply(): void {
  if (!media) throw new Error('initTheme() must run before the theme is changed')
  document.documentElement.dataset.theme = resolveTheme(theme, media.matches)
  listeners.forEach((l) => l())
}

/** Call once at start-up, before rendering. */
export function initTheme(): void {
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch (err) {
    reportError(`The theme choice cannot be read on this device, so the app follows the system theme: ${messageOf(err)}`)
  }
  theme = storage ? readTheme(storage) : 'system'
  media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', () => {
    if (theme === 'system') apply()
  })
  apply()
}

export function setTheme(next: Theme): void {
  try {
    window.localStorage.setItem(KEY, next)
  } catch (err) {
    reportError(`The theme choice could not be saved on this device, so it lasts until the page is reloaded: ${messageOf(err)}`)
  }
  theme = next
  apply()
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => theme,
  )
}
