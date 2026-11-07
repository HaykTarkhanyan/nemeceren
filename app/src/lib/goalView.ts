// The one place the app turns synced progress into the path and the goal streak, for Home, the
// Stats streak line and the goal toast. Glue only: the rules are in path.ts and goal.ts.
import { useMemo } from 'react'
import { content } from '../content/load.ts'
import { PATH_LAUNCH_DAY } from './config.ts'
import { localDay } from './dates.ts'
import { goalDays, goalStreak } from './goal.ts'
import type { GoalStreak } from './goal.ts'
import { courseStations, pathProgress } from './path.ts'
import type { PathProgress, Station } from './path.ts'
import { dailyStats, studyDays } from './stats.ts'
import { activityOf, useProgress } from './storage.ts'
import type { ProgressView } from './storage.ts'

/** Every station of the course; content does not change while the app runs. */
export const STATIONS: Station[] = courseStations(content.lessons, content.tests)
const COURSE_TEST_IDS = new Set(STATIONS.filter((s) => s.kind === 'test').map((s) => s.testId!))

export interface GoalView {
  goal: GoalStreak
  path: PathProgress
  stations: Station[]
  today: string
}

export function computeGoal(progress: ProgressView, today: string): GoalView {
  const results = progress.results.map((r) => r.result)
  const path = pathProgress(STATIONS, { events: progress.pathEvents, lessonProgress: progress.lessonProgress, results })
  const activity = activityOf(progress)
  // The same study days as the Stats page: the server's, plus unsynced activity.
  const study = new Set([...progress.studyDays, ...studyDays(dailyStats(activity.reviews, activity.testItems))])
  const goal = goalStreak({
    studyDays: study,
    goalDays: goalDays({ events: progress.pathEvents, results, courseTestIds: COURSE_TEST_IDS }),
    launchDay: PATH_LAUNCH_DAY,
    today,
  })
  return { goal, path, stations: STATIONS, today }
}

// Home, the goal toast and the Stats page all read the same progress object: compute once per state.
let last: { progress: ProgressView; today: string; view: GoalView } | null = null

export function useGoal(): GoalView {
  const progress = useProgress()
  const today = localDay(new Date())
  return useMemo(() => {
    if (last && last.progress === progress && last.today === today) return last.view
    const view = computeGoal(progress, today)
    last = { progress, today, view }
    return view
  }, [progress, today])
}
