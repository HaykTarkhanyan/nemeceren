// Quick tasks for a busy day (Hayk, 2026-11-24; DECISIONS.md #119): two small things made from the progress, shown on
// Home and sent to kachayt each morning (backend/scripts/progress.py daily-tasks). Each opens a short run of its own
// (#/daily/review, #/daily/new) and ticks itself once today's log shows it done. The daily goal is unchanged (Q73):
// the quick review is a review round of up to 10 cards, so 10 of them count like a Words-page round (#86); new words
// alone don't.
import type { ReviewLogEntry } from '../content/schema.ts'

export const QUICK = {
  /** Cards in the quick review; 10 also makes it count for the daily goal (GOAL_ROUND_MIN). */
  reviews: 10,
  newWords: 3,
  /** Cards a quick new-word run may show (new words come back while they are being learned). */
  newCards: 8,
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
