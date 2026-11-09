// The word review rounds on the Words page (DECISIONS.md #85): round sizes, the direction of each
// card, der/die/das, a German word said into the mic, the suggested grade, the end-of-round summary
// and the lesson a word comes from. Pure functions.
import { byCourseOrder, isCourseLesson } from '../content/lessons.ts'
import type { Lesson, ReviewLogEntry, ReviewMode, ReviewState } from '../content/schema.ts'
import { localDay } from './dates.ts'
import type { Typed } from './reviewEntries.ts'
import { bestAlternative, compareSpoken, spokenWords } from './speaking.ts'
import { Rating } from './srs.ts'
import type { Grade } from './srs.ts'
import type { Comparison } from './text.ts'

/** A round has at most this many cards; then the end screen, and "Next round" if more are waiting. */
export const ROUND_SIZE = 20
/** A round that ends with at least this many cards counts for the daily goal (Hayk's Q23, 2026-11-07). */
export const GOAL_ROUND_MIN = 10
/**
 * Words, Review has no daily limit on new words (Hayk, 2026-11-09: "I want to be able to do as many
 * as I want"): after the due cards it brings new words in path order, round after round. The
 * setting newPerDay now only limits the daily mix.
 */
export const REVIEW_NEW_LIMIT = Number.POSITIVE_INFINITY

/** Hayk chooses the direction per round (Q24); "mixed" picks one for each card. */
export type SessionMode = ReviewMode | 'mixed'

const ALL_MODES: ReviewMode[] = ['recognition', 'production', 'listening']

/**
 * The direction of the next card: the round's own, or for "mixed" one at random (listening only with a
 * German voice). In "mixed" a new word is a flip card first: it cannot be recalled before it was seen.
 */
export function pickMode(mode: SessionMode, canListen: boolean, rand: () => number = Math.random, isNew = false): ReviewMode {
  if (mode !== 'mixed') return mode
  if (isNew) return 'recognition'
  const modes = canListen ? ALL_MODES : ALL_MODES.filter((m) => m !== 'listening')
  return modes[Math.min(modes.length - 1, Math.floor(rand() * modes.length))]
}

export type Article = 'der' | 'die' | 'das'

/** "der Termin" -> { article: "der", rest: "Termin" }; a word without an article keeps all of it. */
export function splitArticle(de: string): { article: Article | null; rest: string } {
  const m = de.match(/^(der|die|das) (.+)$/)
  return m ? { article: m[1] as Article, rest: m[2] } : { article: null, rest: de }
}

const ARTICLES: readonly string[] = ['der', 'die', 'das']

/**
 * An English to German card answered by voice: the recognition alternative closest to the German,
 * checked like a typed answer, so it goes into the log as one (the answer is what was heard).
 *   - Every word of the German must be heard, the rule of "Say the words" (games.ts spokenWordRight).
 *   - A noun also needs its article, said right before it, because a typed answer needs it too.
 *     Heard without one, or with another, it is the same near miss as typed (article_missing,
 *     article_wrong).
 *   - Case and punctuation never count: the recognizer decides them.
 */
export function spokenAnswer(de: string, alternatives: string[]): Typed {
  const answer = bestAlternative(de, alternatives)
  const { article, rest } = splitArticle(de)
  const result = (correct: boolean, nearMiss: Comparison['nearMiss'] = null): Typed => ({ answer, check: { correct, nearMiss } })
  if (compareSpoken(rest, answer).score < 1) return result(false)
  if (!article) return result(true)
  const heard = spokenWords(answer)
  const at = heard.indexOf(spokenWords(rest)[0])
  const said = at > 0 && ARTICLES.includes(heard[at - 1]) ? heard[at - 1] : null
  if (said === article) return result(true)
  return result(false, [said === null ? 'article_missing' : 'article_wrong'])
}

/** How a card that asks for the German was answered: the typed or heard text with its check. */
export interface CardAnswer {
  typed: Typed
  spoken: boolean
}

/**
 * The grade a card suggests (the learner always grades): Good for a right answer, typed or said;
 * Again for a wrong typed one. None when the answer was shown after the mic heard something else,
 * because that can be the recognizer's miss rather than the learner's.
 */
export function suggestedGrade(answer: CardAnswer | null): Grade | null {
  if (!answer) return null
  if (answer.typed.check.correct) return Rating.Good
  return answer.spoken ? null : Rating.Again
}

export interface RoundSummary {
  cards: number
  /** Graded Good or Easy. */
  right: number
  percent: number
  minutes: number
  /** New words introduced in the round. */
  fresh: number
  /** Words graded Again or Hard at least once, in the order they came. */
  hardIds: string[]
}

export function roundSummary(entries: ReviewLogEntry[]): RoundSummary {
  const right = entries.filter((e) => e.rating >= Rating.Good).length
  const hardIds = [...new Set(entries.filter((e) => e.rating <= Rating.Hard).map((e) => e.wordId))]
  const ms = entries.reduce((sum, e) => sum + (e.timeMs ?? 0), 0)
  return {
    cards: entries.length,
    right,
    percent: entries.length === 0 ? 0 : Math.round((100 * right) / entries.length),
    minutes: Math.round(ms / 60_000),
    fresh: entries.filter((e) => e.isNew).length,
    hardIds,
  }
}

/** How many of the given words have their next review on that local day. */
export function dueOnDay(state: ReviewState, wordIds: Set<string>, day: string, timeZone?: string): number {
  let n = 0
  for (const id of wordIds) {
    const card = state.cards[id]
    if (card && localDay(new Date(card.due), timeZone) === day) n += 1
  }
  return n
}

/** Each word's lesson: the first course lesson (in course order) that lists it, else a theme lesson that does. */
export function lessonOfWords(lessons: Lesson[]): Map<string, Lesson> {
  const course = lessons.filter(isCourseLesson).sort(byCourseOrder)
  const others = lessons.filter((l) => !isCourseLesson(l))
  const map = new Map<string, Lesson>()
  for (const l of [...course, ...others]) for (const id of l.words ?? []) if (!map.has(id)) map.set(id, l)
  return map
}
