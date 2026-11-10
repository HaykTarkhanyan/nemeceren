// Small easter eggs for one learner who loves cardio (Hayk, 2026-11-10; DECISIONS.md #116): a
// greeting on Home with a line that changes daily, and the zone meter in the daily mix (lib/zones.ts).
// Keyed by sign-in email like onlyFor (#95); the test account is listed for browser checks. The app
// bundle and the repo are public, so nothing here is private.
import { daysBetween } from './dates.ts'

const CARDIO_FANS: Record<string, string> = {
  'anahit@nemeceren.example': 'Anahit',
  'claude-test@example.com': 'Test',
}

/** The name to greet, or null when this learner has no cardio easter eggs (also for a guest). */
export function cardioFan(email: string | null): string | null {
  return email === null ? null : (CARDIO_FANS[email.toLowerCase()] ?? null)
}

/** One line a day under the greeting: short A1 German with its English. */
export const CARDIO_LINES: readonly { de: string; en: string }[] = [
  { de: 'Heute Zone 2 oder Zone 5?', en: 'Today Zone 2 or Zone 5?' },
  { de: 'Langsam laufen, schnell lernen.', en: 'Run slowly, learn fast.' },
  { de: "Zehn Wörter, zehn Minuten. Los geht's!", en: "Ten words, ten minutes. Let's go!" },
  { de: 'Heute: laufen und lernen.', en: 'Today: run and learn.' },
  { de: 'Eine Pause ist auch gut.', en: 'A break is good too.' },
  { de: 'Zone 1 oder schon Zone 3?', en: 'Zone 1 or Zone 3 already?' },
]

/** The line for a local day ("2026-11-10"): the same all day, the next one tomorrow. */
export function cardioLine(day: string): { de: string; en: string } {
  const n = CARDIO_LINES.length
  const line = CARDIO_LINES[((daysBetween('2026-01-01', day) % n) + n) % n]
  if (!line) throw new Error(`No cardio line for ${day}`)
  return line
}
