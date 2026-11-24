// Quick tasks for a busy day (Hayk, 2026-11-24; DECISIONS.md #119): two things made from the progress, shown on
// Home and sent to kachayt each morning (backend/scripts/progress.py daily-tasks). Each opens a short run of its own
// (#/daily/review, #/daily/new) and ticks itself once today's log shows it done. The daily goal is unchanged (Q73):
// a quick review of 10+ cards counts like a Words-page round (#86); new words alone don't. "Due" here means a word
// already reviewed whose card is due now: what the quick review can show at once. A card never reviewed (reps 0) is a
// new word, in the new-word task: one at the front of the due list stopped the first quick review at once (Hayk's
// report, 2026-11-24).
import type { ReviewLogEntry } from '../content/schema.ts'

export const QUICK = {
  /** Words in the quick review (Hayk, 2026-11-24: 30 instead of 10); 10+ graded also count for the daily goal (GOAL_ROUND_MIN). */
  reviews: 30,
  /** New words to learn (Hayk: 10 instead of 3). */
  newWords: 10,
  /** "Review 10 more" and "Learn 5 more" after a run. */
  moreReviews: 10,
  moreNew: 5,
  /** A new word comes back while it is being learned: a run may show this many cards per new word. */
  cardsPerNewWord: 3,
  /** Rough time per card, for the "~3 min" label. */
  secondsPerReview: 18,
  secondsPerNewWord: 40,
} as const

export type QuickTaskId = 'review' | 'new'

export interface QuickTask {
  id: QuickTaskId
  label: string
  minutes: number
  /** Done today / the task's target, e.g. 4 of 10. */
  doneCount: number
  target: number
  done: boolean
}

/** Today's scheduled reviews and first reviews of new words (practice is left out: it moves no schedule). */
export function todayCounts(log: readonly Pick<ReviewLogEntry, 'localDay' | 'isNew' | 'practice'>[], today: string): { reviewed: number; learned: number } {
  let reviewed = 0
  let learned = 0
  for (const e of log) {
    if (e.localDay !== today || e.practice) continue
    if (e.isNew) learned += 1
    else reviewed += 1
  }
  return { reviewed, learned }
}

function minutes(cards: number, secondsEach: number): number {
  return Math.max(1, Math.round((cards * secondsEach) / 60))
}

/**
 * The quick tasks for now. A task appears when there is something to do or it was done today: the review needs due
 * words (or reviews done today), the new words need words left to learn (or words learned today).
 */
export function quickTasks(input: { reviewed: number; learned: number; due: number; newAvailable: number }): QuickTask[] {
  const tasks: QuickTask[] = []
  const reviewTarget = Math.min(QUICK.reviews, input.reviewed + input.due)
  if (reviewTarget > 0) {
    tasks.push({
      id: 'review',
      label: reviewTarget === QUICK.reviews ? `Review ${reviewTarget} words` : `Review the ${reviewTarget} due word${reviewTarget === 1 ? '' : 's'}`,
      minutes: minutes(reviewTarget, QUICK.secondsPerReview),
      doneCount: Math.min(input.reviewed, reviewTarget),
      target: reviewTarget,
      done: input.reviewed >= reviewTarget,
    })
  }
  const newTarget = Math.min(QUICK.newWords, input.learned + input.newAvailable)
  if (newTarget > 0) {
    tasks.push({
      id: 'new',
      label: `Learn ${newTarget} new word${newTarget === 1 ? '' : 's'}`,
      minutes: minutes(newTarget, QUICK.secondsPerNewWord),
      doneCount: Math.min(input.learned, newTarget),
      target: newTarget,
      done: input.learned >= newTarget,
    })
  }
  return tasks
}
