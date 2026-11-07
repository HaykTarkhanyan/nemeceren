// The daily goal and the goal-based streak (DECISIONS.md #83). Pure functions over the synced
// history, so every device derives the same streak and freezes and nothing extra is stored.
//   goal day     a local day with a station done (lesson step or theme lesson), a submitted attempt
//                of a course test (pass or fail), a daily mix run to its end, or a word review round
//                that ended with 10+ cards graded (DECISIONS.md #86)
//   streak       before the launch day: consecutive study days (the old rule, stats.ts); from the
//                launch day on: consecutive goal days, where a missed day is covered by a freeze
//                if one is held and there is a streak to keep (a frozen day keeps the streak but does not
//                add to it); before the launch day a goal day counts as a study day too
//   freezes      every learner starts with STARTER_FREEZES on the launch day, holds at most
//                MAX_FREEZES, and earns one for every FREEZE_EVERY goal days in a row
// Design: _knowledge/2026-11-07_path-home-design.md, section 5.4.
import type { Result } from '../content/schema.ts'
import { addDays, localDay } from './dates.ts'
import type { PathEventLike } from './path.ts'
import { streaks } from './stats.ts'

export const MILESTONES = [7, 30, 100] as const
export const FREEZE_EVERY = 7
export const MAX_FREEZES = 2
/** Hayk's Q14 (2026-11-07): everyone starts with one freeze when the new rule begins. */
export const STARTER_FREEZES = 1

/** Every local day on which the daily goal was met. */
export function goalDays(input: { events: PathEventLike[]; results: Result[]; courseTestIds: Set<string>; timeZone?: string }): Set<string> {
  const days = new Set<string>()
  for (const e of input.events) if (e.deletedAt === undefined) days.add(e.localDay)
  for (const r of input.results) {
    if (r.lessonId !== undefined || !input.courseTestIds.has(r.testId)) continue
    days.add(r.localDay ?? localDay(new Date(r.submittedAt), input.timeZone))
  }
  return days
}

export interface GoalStreak {
  current: number
  longest: number
  /** Freezes held now. */
  freezes: number
  /** Missed days a freeze covered. */
  frozenDays: Set<string>
  todayMet: boolean
  /** The milestone (7, 30, 100) reached today, if any. */
  milestoneToday: number | null
  freezeEarnedToday: boolean
}

export function goalStreak(input: { studyDays: Set<string>; goalDays: Set<string>; launchDay: string; today: string }): GoalStreak {
  const { studyDays, goalDays: goal, launchDay, today } = input
  // Before the launch day a goal day (e.g. a station read without an exercise) is a study day too, so the
  // ring and the streak agree on deploy day and that day still carries the streak across the launch.
  const withGoal = new Set([...studyDays, ...[...goal].filter((d) => d < launchDay)])
  if (today < launchDay) {
    const old = streaks(withGoal, today)
    // The streak still follows the old rule, but the goal ring already shows today's goal.
    return { current: old.current, longest: old.longest, freezes: STARTER_FREEZES, frozenDays: new Set(), todayMet: goal.has(today), milestoneToday: null, freezeEarnedToday: false }
  }
  const beforeLaunch = addDays(launchDay, -1)
  const oldDays = new Set([...withGoal].filter((d) => d < launchDay))
  const old = streaks(oldDays, beforeLaunch)
  // The old streak carries on only if it reached the day before the launch.
  let current = oldDays.has(beforeLaunch) ? old.current : 0
  let longest = Math.max(old.longest, current)
  let held = STARTER_FREEZES
  let run = 0
  let freezeEarnedToday = false
  const frozenDays = new Set<string>()
  for (let day = launchDay; day <= today; day = addDays(day, 1)) {
    if (goal.has(day)) {
      current += 1
      run += 1
      if (run % FREEZE_EVERY === 0 && held < MAX_FREEZES) {
        held += 1
        if (day === today) freezeEarnedToday = true
      }
    } else if (day === today) {
      // Today is still open: not met yet is not a miss.
    } else if (held > 0 && current > 0) {
      // A freeze keeps a streak; with no streak there is nothing to keep, so it stays.
      held -= 1
      frozenDays.add(day)
    } else {
      current = 0
      run = 0
    }
    longest = Math.max(longest, current)
  }
  const todayMet = goal.has(today)
  const milestoneToday = todayMet && (MILESTONES as readonly number[]).includes(current) ? current : null
  return { current, longest, freezes: held, frozenDays, todayMet, milestoneToday, freezeEarnedToday }
}
