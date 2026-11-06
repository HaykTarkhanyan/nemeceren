// Practice lists for the Words page (DECISIONS.md #77), as pure functions: the topic word sets
// (content/sets.json) and their progress, words learned recently, and the words of a practice pick.
// Practice is only for words with a reviewed card; it never changes the review schedule.
import type { ReviewLogEntry, ReviewState, WordSet } from '../content/schema.ts'
import { KNOWN_DAYS } from './stats.ts'

/** A practice run takes at most this many words. */
export const PRACTICE_MAX = 20
/** "Learned recently" means introduced in the last 7 days. */
export const RECENT_DAYS = 7

const learned = (state: ReviewState, id: string) => (state.cards[id]?.reps ?? 0) > 0

/** How far a word set is: words learned (reviewed at least once), known (interval of 21 days or more), and the total. */
export function setProgress(set: WordSet, state: ReviewState): { learned: number; known: number; total: number } {
  let l = 0
  let k = 0
  for (const id of set.words) {
    if (!learned(state, id)) continue
    l += 1
    const c = state.cards[id]
    if (c.state === 2 && c.scheduled_days >= KNOWN_DAYS) k += 1
  }
  return { learned: l, known: k, total: set.words.length }
}

/** The set's words that can be practised (learned), in set order. */
export function learnedSetWords(set: WordSet, state: ReviewState): string[] {
  return set.words.filter((id) => learned(state, id))
}

/**
 * Words introduced in the last `days` days, newest first: the first scheduled review of a new word
 * (isNew, not practice) in the loaded log, for words that still have a reviewed card.
 */
export function recentlyLearned(log: ReviewLogEntry[], state: ReviewState, now: Date, days = RECENT_DAYS): string[] {
  const since = now.getTime() - days * 86_400_000
  const at = new Map<string, number>()
  for (const e of log) {
    if (!e.isNew || e.practice) continue
    const t = Date.parse(e.ts)
    if (t < since) continue
    at.set(e.wordId, Math.max(at.get(e.wordId) ?? 0, t))
  }
  return [...at.entries()]
    .filter(([id]) => learned(state, id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
}

/** The learned words among ids, in the given order, at most PRACTICE_MAX. */
export function practiceIds(ids: readonly string[], state: ReviewState): string[] {
  return ids.filter((id) => learned(state, id)).slice(0, PRACTICE_MAX)
}
