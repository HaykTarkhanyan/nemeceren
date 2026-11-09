// The light daily mode (design: _knowledge/2026-11-06_light-daily-mode-design.md), as pure
// functions: which words the games use, the rounds of match pairs, the new words of the daily mix,
// and which steps of the mix have something to do.
// The games are practice: they never change the FSRS schedule (DECISIONS.md #25, #77).
import { isThemeLesson } from '../content/lessons.ts'
import type { Lesson, LessonProgress, ReviewState, WordSet } from '../content/schema.ts'
import { pathNewWords } from './plan.ts'
import type { PathReach } from './plan.ts'
import { lessonOfWords } from './review.ts'
import { shuffle } from './shuffle.ts'
import { LEARN_AHEAD_MS } from './srs.ts'
import { foldBare } from './text.ts'

export interface GameWord {
  id: string
  de: string
  en: string
}

/** Sizes of the daily mix (about 12 minutes). */
export const MIX = {
  warmupRounds: 2,
  pairsPerRound: 5,
  maxReviews: 15,
  maxNew: 5,
  /** New words come back while they are being learned; the new-word step stops after this many cards. */
  maxNewCards: 12,
  /** Due mistakes in the mix (Mistakes replay, DECISIONS.md #81). */
  maxMistakes: 5,
} as const

/** Match pairs needs at least 3 pairs. */
export const MIN_PAIRS = 3

/** A word is learned once its card was reviewed at least once. */
export function isLearned(state: ReviewState, id: string): boolean {
  return (state.cards[id]?.reps ?? 0) > 0
}

/** Words with a card that was reviewed at least once. */
export function introduced<W extends { id: string }>(words: W[], state: ReviewState): W[] {
  return words.filter((w) => isLearned(state, w.id))
}

/**
 * How a practice game picks its words (Hayk, 2026-11-09: "dont lock anything"). From Home
 * ("learned-first"): the learned words first, then words not learned yet in the order given, which
 * is path order, so a round is always full. From tiles on the Words map ("any"): any word of the
 * lessons, learned or not, at random.
 */
export type RoundPick = 'learned-first' | 'any'

/**
 * Words not learned yet, in the order a round takes them: `slots` drawn at random from the first
 * 2 x slots (so Play again brings some others), then the rest; both kept in the order given (path order).
 */
export function freshOrder<W extends { id: string }>(fresh: W[], slots: number, rand: () => number = Math.random): W[] {
  const n = Math.max(0, slots)
  const chosen = new Set(
    shuffle(fresh.slice(0, 2 * n), rand)
      .slice(0, n)
      .map((w) => w.id),
  )
  return [...fresh.filter((w) => chosen.has(w.id)), ...fresh.filter((w) => !chosen.has(w.id))]
}

export type WordKind = 'noun' | 'phrase' | 'word'

/** A rough kind for picking look-alike wrong options: nouns (with their article), phrases, other words. */
export function wordKind(de: string): WordKind {
  if (/^(der|die|das) \S/.test(de)) return 'noun'
  return /\s/.test(de.trim()) ? 'phrase' : 'word'
}

/** How a German or English text is compared for "the same answer": case, punctuation and spaces ignored. */
function sameKey(s: string): string {
  return foldBare(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Up to n words for a game, with distinct German and distinct English, so every pair has exactly
 * one right answer. "learned-first" (RoundPick): learned words first, recent and hard ones before
 * the others (a pool of the most recently reviewed words plus the hardest ones by FSRS difficulty,
 * sampled at random), then words not learned yet in the order given (freshOrder). "any": all words
 * at random.
 */
export function pickGameWords<W extends GameWord>(words: W[], state: ReviewState, n: number, pick: RoundPick = 'learned-first', rand: () => number = Math.random): W[] {
  let order: W[]
  if (pick === 'any') order = shuffle(words, rand)
  else {
    const usable = introduced(words, state)
    const lastReview = (w: W) => state.cards[w.id].last_review ?? ''
    const recent = [...usable].sort((a, b) => lastReview(b).localeCompare(lastReview(a))).slice(0, 2 * n)
    const hard = [...usable].sort((a, b) => state.cards[b.id].difficulty - state.cards[a.id].difficulty).slice(0, n)
    const poolIds = new Set([...recent, ...hard].map((w) => w.id))
    const pool = shuffle(
      usable.filter((w) => poolIds.has(w.id)),
      rand,
    )
    const rest = shuffle(
      usable.filter((w) => !poolIds.has(w.id)),
      rand,
    )
    const fresh = words.filter((w) => !isLearned(state, w.id))
    order = [...pool, ...rest, ...freshOrder(fresh, n - usable.length, rand)]
  }
  const out: W[] = []
  const de = new Set<string>()
  const en = new Set<string>()
  for (const w of order) {
    if (out.length >= n) break
    const kd = sameKey(w.de)
    const ke = sameKey(w.en)
    if (de.has(kd) || en.has(ke)) continue
    de.add(kd)
    en.add(ke)
    out.push(w)
  }
  return out
}

/** Rounds of match pairs: each round has up to `size` words, at least MIN_PAIRS, no word twice in the run. */
export function matchRounds<W extends GameWord>(
  words: W[],
  state: ReviewState,
  rounds: number,
  size: number,
  pick: RoundPick = 'learned-first',
  rand: () => number = Math.random,
): W[][] {
  const picked = pickGameWords(words, state, rounds * size, pick, rand)
  const out: W[][] = []
  for (let i = 0; i < rounds; i++) {
    const round = picked.slice(i * size, (i + 1) * size)
    if (round.length >= MIN_PAIRS) out.push(round)
  }
  return out
}

/**
 * New words for the daily mix, in order: the active word set's words that are not introduced yet,
 * or, with no active set, the new words in path order: pathNewWords, the same rule as the Words
 * page (the lesson the path is at and the next one, so the mix pre-learns the next lesson).
 * `from` names where the first new word comes from. `lessons` are all lessons, course and theme.
 */
export function mixNewWords<W extends { id: string }>(input: {
  words: W[]
  lessons: Lesson[]
  progress: LessonProgress
  state: ReviewState
  set: WordSet | null
  reach: PathReach
}): { words: W[]; from: string } {
  const { words, lessons, progress, state, set, reach } = input
  const byId = new Map(words.map((w) => [w.id, w]))
  if (set) {
    const left = set.words.filter((id) => !state.cards[id] && byId.has(id)).map((id) => byId.get(id) as W)
    if (left.length > 0) return { words: left, from: `the word set "${set.title}"` }
  }
  // A finished set gives way to the path, and the text says so.
  const setDone = set ? `the word set "${set.title}" is done, so ` : ''
  const fresh = pathNewWords(words, lessons, progress, state, reach)
  if (fresh.length === 0) return { words: [], from: `${setDone}the course` }
  const first = lessonOfWords(lessons).get(fresh[0].id)
  const where = !first ? 'the word bank' : isThemeLesson(first) ? `the theme "${first.theme.title}"` : `lesson ${first.unit}.${first.order} ${first.title}`
  return { words: fresh, from: `${setDone}${where}` }
}

/** Cards due now (or within the learn-ahead window) among the words that have a card. */
export function dueNow<W extends { id: string }>(words: W[], state: ReviewState, now: Date): number {
  const limit = now.getTime() + LEARN_AHEAD_MS
  return words.filter((w) => {
    const c = state.cards[w.id]
    return c !== undefined && Date.parse(c.due) <= limit
  }).length
}

export type MixStep = 'warmup' | 'reviews' | 'new' | 'mistakes'

export const MIX_STEP_LABEL: Record<MixStep, string> = {
  warmup: 'Warm-up: match pairs',
  reviews: 'Word reviews',
  new: 'New words',
  mistakes: 'Your mistakes',
}

/**
 * The steps of the mix that have something to do, in order. Listen and pick is not one of them: Hayk
 * found it too easy (2026-11-09, DECISIONS.md #101); it stays a game of its own.
 */
export function mixSteps(input: { introduced: number; due: number; newAvailable: number; mistakes?: number }): MixStep[] {
  const steps: MixStep[] = []
  if (input.introduced >= MIN_PAIRS) steps.push('warmup')
  if (input.due > 0) steps.push('reviews')
  if (input.newAvailable > 0) steps.push('new')
  if ((input.mistakes ?? 0) > 0) steps.push('mistakes')
  return steps
}

/**
 * The mix ran to its end: every planned step finished, no Stop. Only then does it count for the
 * daily goal (DECISIONS.md #83); a mix with no steps never counts.
 */
export function mixFinished(stopped: boolean, step: number, steps: number): boolean {
  return !stopped && steps > 0 && step >= steps
}
