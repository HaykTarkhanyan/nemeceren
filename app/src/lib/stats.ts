// Study statistics as pure functions over plain event arrays. They do not know where the
// events come from (lib/storage.ts builds them from the progress in Neon, plus unsynced changes).
// Definitions:
//   study day   a local calendar day with at least one word review (practice included), one
//               answered test item (lesson exercises included), or one study session of the timer
//               (also one added by hand; DECISIONS.md #62)
//   streak      consecutive study days ending today, or ending yesterday if today has none yet
//   activity    one word review, or one test attempt with at least one answered item
//   session     activities with no gap of SESSION_GAP_MS or more between them; counted on the
//               local day of the session's first activity
//   minutes     sum of measured activity time: each review's card time (capped at
//               REVIEW_CAP_MS) plus each test item's screen time (capped at TEST_ITEM_CAP_MS),
//               counted on the activity's local day
//   timer       study sessions timed with the study timer (or added by hand): their active minutes,
//               counted on the local day the session started; kept apart from the measured minutes
//   known word  FSRS state Review with an interval of KNOWN_DAYS days or more
import type { ReviewState, Word } from '../content/schema.ts'
import { addDays, daysBetween, localDay, mondayOf } from './dates.ts'
import { counts } from './srs.ts'

export const SESSION_GAP_MS = 30 * 60_000
export const REVIEW_CAP_MS = 2 * 60_000
export const TEST_ITEM_CAP_MS = 20 * 60_000
export const KNOWN_DAYS = 21

export interface ReviewEvent {
  /** When the card was graded (ms since epoch). */
  at: number
  /** Local day recorded when it happened; if missing, computed from `at` in the viewer's time zone. */
  localDay?: string
  /** Time from showing the card to grading it; missing for old log lines. */
  timeMs?: number
  /** 1 Again, 2 Hard, 3 Good, 4 Easy. Anything but Again counts as correct. */
  rating: number
  isNew: boolean
  /** Practice of weak words: counts as study time, but not as a scheduled review. */
  practice?: boolean
}

export interface TestItemEvent {
  /** Groups the items of one test attempt. */
  attemptId: string
  startedAt: number
  submittedAt: number
  /** Local day at submit time; if missing, computed from submittedAt in the viewer's time zone. */
  localDay?: string
  timeMs: number
  answered: boolean
}

export interface DayStats {
  day: string
  reviews: number
  correct: number
  newWords: number
  testItems: number
  activeMs: number
  sessions: number
  /** Practice reviews (not in reviews, correct or newWords). */
  practice: number
  /** Reviews without a measured time (old log lines); they count everywhere except minutes. */
  untimed: number
}

interface Activity {
  start: number
  end: number
  day: string
  activeMs: number
  reviews: number
  correct: number
  newWords: number
  testItems: number
  practice: number
  untimed: number
}

function reviewActivity(e: ReviewEvent, timeZone?: string): Activity {
  const ms = e.timeMs === undefined ? 0 : Math.min(e.timeMs, REVIEW_CAP_MS)
  return {
    start: e.at - ms,
    end: e.at,
    day: e.localDay ?? localDay(new Date(e.at), timeZone),
    activeMs: ms,
    reviews: e.practice ? 0 : 1,
    correct: !e.practice && e.rating >= 2 ? 1 : 0,
    newWords: !e.practice && e.isNew ? 1 : 0,
    testItems: 0,
    practice: e.practice ? 1 : 0,
    untimed: e.timeMs === undefined ? 1 : 0,
  }
}

/** One activity per attempt that has at least one answered item. */
function testActivities(items: TestItemEvent[], timeZone?: string): Activity[] {
  const byAttempt = new Map<string, TestItemEvent[]>()
  for (const it of items) byAttempt.set(it.attemptId, [...(byAttempt.get(it.attemptId) ?? []), it])
  const out: Activity[] = []
  for (const group of byAttempt.values()) {
    const answered = group.filter((i) => i.answered).length
    if (answered === 0) continue
    const first = group[0]
    out.push({
      start: first.startedAt,
      end: first.submittedAt,
      day: first.localDay ?? localDay(new Date(first.submittedAt), timeZone),
      activeMs: group.reduce((sum, i) => sum + Math.min(i.timeMs, TEST_ITEM_CAP_MS), 0),
      reviews: 0,
      correct: 0,
      newWords: 0,
      testItems: answered,
      practice: 0,
      untimed: 0,
    })
  }
  return out
}

function emptyDay(day: string): DayStats {
  return { day, reviews: 0, correct: 0, newWords: 0, testItems: 0, activeMs: 0, sessions: 0, practice: 0, untimed: 0 }
}

/** Per-day totals, keyed by local day. */
export function dailyStats(reviews: ReviewEvent[], testItems: TestItemEvent[], timeZone?: string): Map<string, DayStats> {
  const acts = [...reviews.map((r) => reviewActivity(r, timeZone)), ...testActivities(testItems, timeZone)].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  )
  const days = new Map<string, DayStats>()
  const get = (day: string) => {
    let d = days.get(day)
    if (!d) {
      d = emptyDay(day)
      days.set(day, d)
    }
    return d
  }
  let sessionEnd = -Infinity
  for (const a of acts) {
    const d = get(a.day)
    if (a.start - sessionEnd >= SESSION_GAP_MS) d.sessions += 1
    sessionEnd = Math.max(sessionEnd, a.end)
    d.reviews += a.reviews
    d.correct += a.correct
    d.newWords += a.newWords
    d.testItems += a.testItems
    d.activeMs += a.activeMs
    d.practice += a.practice
    d.untimed += a.untimed
  }
  return days
}

export function studyDays(days: Map<string, DayStats>): Set<string> {
  return new Set([...days.values()].filter((d) => d.reviews > 0 || d.practice > 0 || d.testItems > 0).map((d) => d.day))
}

export function streaks(study: Set<string>, today: string): { current: number; longest: number } {
  let current = 0
  let d = study.has(today) ? today : addDays(today, -1)
  while (study.has(d)) {
    current += 1
    d = addDays(d, -1)
  }
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const day of [...study].sort()) {
    run = prev !== null && daysBetween(prev, day) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = day
  }
  return { current, longest }
}

/** Study days in the current week (Monday to today) and the current calendar month. */
export function daysThisWeekAndMonth(study: Set<string>, today: string): { week: number; month: number } {
  const monday = mondayOf(today)
  const month = today.slice(0, 7)
  let week = 0
  let inMonth = 0
  for (const day of study) {
    if (day > today) continue
    if (day >= monday) week += 1
    if (day.startsWith(month)) inMonth += 1
  }
  return { week, month: inMonth }
}

/** The last n days ending today, oldest first, with zeros for days without activity. */
export function lastDays(days: Map<string, DayStats>, today: string, n: number): DayStats[] {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - (n - 1))
    return days.get(day) ?? emptyDay(day)
  })
}

// ---------- the study timer ----------

/** One study session, as the timer stats need it. */
export interface TimerSession {
  /** Local day of the session's start. */
  localDay: string
  activeMs: number
}

export interface TimerDay {
  day: string
  activeMs: number
  sessions: number
}

/** Timer time per local day (the day each session started). */
export function timerByDay(sessions: TimerSession[]): Map<string, TimerDay> {
  const days = new Map<string, TimerDay>()
  for (const x of sessions) {
    const d = days.get(x.localDay) ?? { day: x.localDay, activeMs: 0, sessions: 0 }
    d.activeMs += x.activeMs
    d.sessions += 1
    days.set(x.localDay, d)
  }
  return days
}

/** The last n days ending today, oldest first, with zeros for days without a session. */
export function lastTimerDays(days: Map<string, TimerDay>, today: string, n: number): TimerDay[] {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - (n - 1))
    return days.get(day) ?? { day, activeMs: 0, sessions: 0 }
  })
}

export interface TimerTotals {
  todayMs: number
  /** Monday to today. */
  weekMs: number
  /** The calendar month up to today. */
  monthMs: number
  /** Days with at least one session among the last `n` days, and their average time (null when there is none). */
  daysWithSession: number
  averageMs: number | null
}

export function timerTotals(days: Map<string, TimerDay>, today: string, n: number): TimerTotals {
  const monday = mondayOf(today)
  const month = today.slice(0, 7)
  const first = addDays(today, -(n - 1))
  let todayMs = 0
  let weekMs = 0
  let monthMs = 0
  let windowMs = 0
  let daysWithSession = 0
  for (const d of days.values()) {
    if (d.day > today) continue
    if (d.day === today) todayMs += d.activeMs
    if (d.day >= monday) weekMs += d.activeMs
    if (d.day.startsWith(month)) monthMs += d.activeMs
    if (d.day >= first && d.sessions > 0) {
      windowMs += d.activeMs
      daysWithSession += 1
    }
  }
  return { todayMs, weekMs, monthMs, daysWithSession, averageMs: daysWithSession > 0 ? windowMs / daysWithSession : null }
}

export interface WordProgress {
  total: number
  introduced: number
  learning: number
  known: number
  notStarted: number
  dueToday: number
}

/** Word-bank progress from the FSRS review state (only words that are still in the bank count). */
export function wordProgress(words: Word[], state: ReviewState, now: Date): WordProgress {
  let introduced = 0
  let known = 0
  for (const w of words) {
    const card = state.cards[w.id]
    if (!card) continue
    introduced += 1
    if (card.state === 2 && card.scheduled_days >= KNOWN_DAYS) known += 1
  }
  return {
    total: words.length,
    introduced,
    learning: introduced - known,
    known,
    notStarted: words.length - introduced,
    // The due count does not depend on the new-word limit.
    dueToday: counts(words, state, now, 0).due,
  }
}
