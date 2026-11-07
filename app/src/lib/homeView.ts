// What the path Home remembers per device (localStorage): folded units, the dismissed change notice,
// and milestones already shown. Per-viewer conveniences only: if the storage is blocked or damaged,
// the error is reported and Home shows the defaults (units folded as the current position suggests,
// the notice and the milestone card again).
import { messageOf, reportError } from './errors.ts'

const OPEN_UNITS_KEY = 'nemeceren.pathOpenUnits'
const NOTICE_KEY = 'nemeceren.pathNoticeSeen'
const MILESTONE_KEY = 'nemeceren.milestoneSeen'
const REVIEW_SOUND_KEY = 'nemeceren.reviewSound'
const ARTICLE_STREAK_KEY = 'nemeceren.articleBestStreak'

function read(key: string, what: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (err) {
    reportError(`${what} cannot be read on this device: ${messageOf(err)}`)
    return null
  }
}

function write(key: string, value: string, what: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (err) {
    reportError(`Could not remember ${what} on this device: ${messageOf(err)}`)
  }
}

function readJson(key: string, what: string): unknown {
  const raw = read(key, what)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    reportError(`Browser storage "${key}" is not valid JSON, so ${what} starts fresh: ${messageOf(err)}`)
    return null
  }
}

/** Units folded open (true) or closed (false) by hand; a unit not in here follows the default. */
export function readOpenUnits(): Record<string, boolean> {
  const v = readJson(OPEN_UNITS_KEY, 'which lines are folded open')
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, boolean>) : {}
}

export function writeOpenUnits(v: Record<string, boolean>): void {
  write(OPEN_UNITS_KEY, JSON.stringify(v), 'which lines are folded open')
}

export function noticeSeen(): boolean {
  return read(NOTICE_KEY, 'Whether the new-goal notice was dismissed') === '1'
}

export function markNoticeSeen(): void {
  write(NOTICE_KEY, '1', 'that the new-goal notice was dismissed')
}

function seenMilestones(): string[] {
  const v = readJson(MILESTONE_KEY, 'the milestones already shown')
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function milestoneSeen(n: number, day: string): boolean {
  return seenMilestones().includes(`${n}:${day}`)
}

export function markMilestoneSeen(n: number, day: string): void {
  write(MILESTONE_KEY, JSON.stringify([...seenMilestones(), `${n}:${day}`].slice(-20)), 'the milestones already shown')
}

/** The focus review reads each word aloud when its answer shows, unless switched off on this device. */
export function readReviewSound(): boolean {
  return read(REVIEW_SOUND_KEY, 'Whether review cards are read aloud') !== 'off'
}

export function writeReviewSound(on: boolean): void {
  write(REVIEW_SOUND_KEY, on ? 'on' : 'off', 'whether review cards are read aloud')
}

/** The best streak in the der/die/das drill on this device (0 when none yet or the storage is damaged). */
export function readBestStreak(): number {
  const n = Number(read(ARTICLE_STREAK_KEY, 'Your best der/die/das streak') ?? '0')
  return Number.isInteger(n) && n >= 0 ? n : 0
}

export function writeBestStreak(n: number): void {
  write(ARTICLE_STREAK_KEY, String(n), 'your best der/die/das streak')
}
