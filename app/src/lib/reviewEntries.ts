// The log entries of a word review, shared by the Words page, the practice sessions and the daily
// mix: a scheduled review moves the FSRS schedule; practice (weak words, word sets, the games of
// the daily mix) is only logged, with practice: true, so the schedule stays as it is (DECISIONS.md #25).
import type { ReviewLogEntry, ReviewMode, ReviewState, StoredCard } from '../content/schema.ts'
import { localDay } from './dates.ts'
import { review } from './srs.ts'
import type { Grade } from './srs.ts'
import type { Comparison } from './text.ts'

export interface Typed {
  answer: string
  check: Comparison
}

/** A graded scheduled review: the log entry and the word's new card. */
export function scheduledEntry(input: {
  state: ReviewState
  word: { id: string; de: string }
  isNew: boolean
  mode: ReviewMode
  rating: Grade
  typed: Typed | null
  timeMs: number
  at: Date
}): { entry: ReviewLogEntry; card: StoredCard } {
  const { state, word, isNew, mode, rating, typed, timeMs, at } = input
  const out = review(state, word.id, rating, at)
  const entry: ReviewLogEntry = {
    ts: at.toISOString(),
    localDay: localDay(at),
    timeMs,
    wordId: word.id,
    de: word.de,
    mode,
    rating,
    answer: typed ? typed.answer : null,
    correct: typed ? typed.check.correct : null,
    nearMiss: typed ? typed.check.nearMiss : null,
    isNew,
    stateBefore: out.before ? out.before.state : 0,
    stateAfter: out.after.state,
    due: out.after.due,
  }
  return { entry, card: out.after }
}

/**
 * Whether a practice answer to this word is logged: only when the word has a card. The games also
 * ask words not learned yet (2026-11-09); an answer to one of those is not logged at all, so
 * practice never creates a card, never moves a schedule and never writes a row that could pass
 * for a first review (DECISIONS.md #25).
 */
export function logsPractice(state: ReviewState, wordId: string): boolean {
  return state.cards[wordId] !== undefined
}

/**
 * A practice answer: logged with practice: true, the card unchanged. Throws if the word has no
 * card; callers that may hold such a word check logsPractice first.
 */
export function practiceEntry(input: {
  state: ReviewState
  word: { id: string; de: string }
  mode: ReviewMode
  rating: Grade
  /** The typed or picked answer, and whether it was right; null for a flip card graded by Hayk. */
  answer: { text: string; correct: boolean; nearMiss: Comparison['nearMiss'] } | null
  timeMs: number
  at: Date
}): ReviewLogEntry {
  const { state, word, mode, rating, answer, timeMs, at } = input
  const card = state.cards[word.id]
  if (!card) throw new Error(`Practice word "${word.id}" has never been reviewed`)
  return {
    ts: at.toISOString(),
    localDay: localDay(at),
    timeMs,
    wordId: word.id,
    de: word.de,
    mode,
    rating,
    answer: answer ? answer.text : null,
    correct: answer ? answer.correct : null,
    nearMiss: answer ? answer.nearMiss : null,
    isNew: false,
    stateBefore: card.state,
    stateAfter: card.state,
    due: card.due,
    practice: true,
  }
}
