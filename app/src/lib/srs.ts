// Spaced repetition on top of ts-fsrs (FSRS algorithm, default parameters: 90% target
// retention, learning steps 1m and 10m). One schedule per word, shared by all review modes.
// Hayk's own words (ids "u-...") are introduced right away, outside the daily new-word limit,
// because he chose them (DECISIONS.md #58); after that they are normal FSRS cards.
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs'
import type { Card, Grade } from 'ts-fsrs'
import type { ReviewState, StoredCard } from '../content/schema.ts'
import { isCustomWordId } from './customWords.ts'
import { localDay } from './dates.ts'

export { Rating, State }
export type { Grade }

const scheduler = fsrs({ enable_fuzz: true })

/** When nothing is due right now and no new cards are left, cards due within this window are shown early. */
export const LEARN_AHEAD_MS = 20 * 60 * 1000

export function toStored(card: Card): StoredCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  }
}

export function fromStored(s: StoredCard): Card {
  return {
    ...s,
    due: new Date(s.due),
    state: s.state as State,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  }
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

export function emptyState(now: Date): ReviewState {
  return { version: 1, scheduler: 'fsrs', updatedAt: now.toISOString(), newToday: { date: localDay(now), count: 0 }, cards: {} }
}

export function newIntroducedToday(state: ReviewState, now: Date): number {
  return state.newToday.date === localDay(now) ? state.newToday.count : 0
}

/** Extra new words Hayk asked for today on top of the daily limit ("learn more new words"). */
export function extraToday(state: ReviewState, now: Date): number {
  return state.newToday.date === localDay(now) ? (state.newToday.extra ?? 0) : 0
}

function newTodayWith(now: Date, count: number, extra: number): ReviewState['newToday'] {
  return extra > 0 ? { date: localDay(now), count, extra } : { date: localDay(now), count }
}

/** Allow n more new words today only. */
export function addExtraNew(state: ReviewState, n: number, now: Date): ReviewState {
  return {
    ...state,
    updatedAt: now.toISOString(),
    newToday: newTodayWith(now, newIntroducedToday(state, now), extraToday(state, now) + n),
  }
}

/** New content words still allowed today (the daily limit plus today's extra, minus those introduced). */
function contentNewLeft(state: ReviewState, now: Date, newLimit: number): number {
  return Math.max(0, newLimit + extraToday(state, now) - newIntroducedToday(state, now))
}

/** Due today, and new words left today: every unseen custom word plus content words up to the limit. */
export function counts(words: { id: string }[], state: ReviewState, now: Date, newLimit: number): { due: number; newLeft: number } {
  const end = endOfLocalDay(now).getTime()
  const due = words.filter((w) => state.cards[w.id] && Date.parse(state.cards[w.id].due) < end).length
  const unseen = words.filter((w) => !state.cards[w.id])
  const custom = unseen.filter((w) => isCustomWordId(w.id)).length
  const newLeft = custom + Math.min(unseen.length - custom, contentNewLeft(state, now, newLimit))
  return { due, newLeft }
}

export type Next<W = { id: string }> =
  | { kind: 'card'; word: W; isNew: boolean }
  | { kind: 'wait'; due: Date }
  | { kind: 'done' }

/**
 * Pick the next card: anything due now first, then new words (custom words first and without a
 * limit, then content words up to the daily limit, in words.json order), then cards due within
 * LEARN_AHEAD_MS. If only later-today cards remain, wait. A card that exists but was never
 * reviewed (reps 0: a content word Hayk added from the "already in lesson" hint) is new too.
 */
export function nextCard<W extends { id: string }>(words: W[], state: ReviewState, now: Date, newLimit: number): Next<W> {
  const seen = words
    .filter((w) => state.cards[w.id])
    .map((w) => ({ word: w, due: Date.parse(state.cards[w.id].due) }))
    .sort((a, b) => a.due - b.due)
  const first = seen[0]
  if (first && first.due <= now.getTime()) return { kind: 'card', word: first.word, isNew: state.cards[first.word.id].reps === 0 }
  const custom = words.find((w) => !state.cards[w.id] && isCustomWordId(w.id))
  if (custom) return { kind: 'card', word: custom, isNew: true }
  if (contentNewLeft(state, now, newLimit) > 0) {
    const fresh = words.find((w) => !state.cards[w.id])
    if (fresh) return { kind: 'card', word: fresh, isNew: true }
  }
  if (first && first.due <= now.getTime() + LEARN_AHEAD_MS) return { kind: 'card', word: first.word, isNew: state.cards[first.word.id].reps === 0 }
  if (first && first.due < endOfLocalDay(now).getTime()) return { kind: 'wait', due: new Date(first.due) }
  return { kind: 'done' }
}

export interface ReviewOutcome {
  state: ReviewState
  before: StoredCard | null
  after: StoredCard
}

/** Apply a grade to a word and return the new state (the input state is not modified). */
export function review(state: ReviewState, wordId: string, grade: Grade, now: Date): ReviewOutcome {
  const before = state.cards[wordId] ?? null
  const card = before ? fromStored(before) : createEmptyCard(now)
  const after = toStored(scheduler.next(card, now, grade).card)
  const introduced = newIntroducedToday(state, now)
  // Custom words do not count against the daily limit (the store derives the count the same way, lib/outbox.ts).
  const counted = (before === null || before.reps === 0) && !isCustomWordId(wordId)
  return {
    before,
    after,
    state: {
      ...state,
      updatedAt: now.toISOString(),
      newToday: newTodayWith(now, counted ? introduced + 1 : introduced, extraToday(state, now)),
      cards: { ...state.cards, [wordId]: after },
    },
  }
}

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]

/** Time until the next review for each grade, e.g. { 1: "1m", 2: "6m", 3: "10m", 4: "8d" }. */
export function previewIntervals(state: ReviewState, wordId: string, now: Date): Record<Grade, string> {
  const stored = state.cards[wordId]
  const card = stored ? fromStored(stored) : createEmptyCard(now)
  const preview = scheduler.repeat(card, now)
  const out = {} as Record<Grade, string>
  for (const g of GRADES) out[g] = formatInterval(preview[g].card.due.getTime() - now.getTime())
  return out
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min}m`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 31) return `${days}d`
  return `${(days / 30).toFixed(1)}mo`
}

/**
 * The newer of two versions of the same card: the later last review wins, and on a tie the
 * second one (the local change). The API applies the same rule (DECISIONS.md #36).
 */
export function laterCard(a: StoredCard, b: StoredCard): StoredCard {
  const lastReview = (c: StoredCard) => (c.last_review ? Date.parse(c.last_review) : -Infinity)
  return lastReview(a) > lastReview(b) ? a : b
}

/** A card for a word that is introduced now but not reviewed yet (reps 0, no last review): it is due at once. */
export function introducedCard(now: Date): StoredCard {
  return toStored(createEmptyCard(now))
}
