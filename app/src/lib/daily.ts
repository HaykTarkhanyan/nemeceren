// Which days of content/daily.json Hayk can see: day 1 unlocks on startDate (local date), then
// one more per calendar day. Later days stay hidden, so each day is a surprise.
import type { Daily } from '../content/schema.ts'
import { addDays, daysBetween } from './dates.ts'

export type DailyDay = Daily['days'][number] & { number: number; date: string }

export interface DailyView {
  /** Today's day, or null before startDate and after the last day. */
  today: DailyDay | null
  /** Unlocked days before today, newest first. */
  archive: DailyDay[]
  /** Days that unlock after today. */
  left: number
  total: number
  /** The date day 1 unlocks, when that is still ahead. */
  startsOn: string | null
}

/** `today` is a local day ("YYYY-MM-DD", dates.ts localDay). */
export function dailyView(daily: Daily, today: string): DailyView {
  const days = daily.days.map((d, i) => ({ ...d, number: i + 1, date: addDays(daily.startDate, i) }))
  const index = daysBetween(daily.startDate, today)
  const unlocked = days.slice(0, Math.max(0, Math.min(index + 1, days.length)))
  const todayDay = index >= 0 && index < days.length ? days[index] : null
  return {
    today: todayDay,
    archive: unlocked.filter((d) => d !== todayDay).reverse(),
    left: days.length - unlocked.length,
    total: days.length,
    startsOn: index < 0 ? daily.startDate : null,
  }
}

/** For check-content: how much is left, so Claude knows when to write more. */
export function dailyRunwayText(v: DailyView, today: string): string {
  const start = v.startsOn ? `, day 1 unlocks on ${v.startsOn}` : ''
  return `Daily page: ${v.total} day(s), ${v.left} left after today (${today})${start}.`
}
