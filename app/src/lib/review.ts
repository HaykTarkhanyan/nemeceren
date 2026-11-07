// The word review rounds on the Words page (DECISIONS.md #85): round sizes, the direction of each
// card, der/die/das, the end-of-round summary and the lesson a word comes from. Pure functions.
import { byCourseOrder, isCourseLesson } from '../content/lessons.ts'
import type { Lesson, ReviewLogEntry, ReviewMode, ReviewState } from '../content/schema.ts'
import { localDay } from './dates.ts'
import { Rating } from './srs.ts'

/** A round has at most this many cards; then the end screen, and "Next round" if more are waiting. */
export const ROUND_SIZE = 20
/** A round that ends with at least this many cards counts for the daily goal (Hayk's Q23, 2026-11-07). */
export const GOAL_ROUND_MIN = 10

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
