// Spaced repetition on top of ts-fsrs (FSRS algorithm, default parameters: 90% target
// retention, learning steps 1m and 10m). One schedule per word, shared by all review modes.
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs'
import type { Card, Grade } from 'ts-fsrs'
import type { ReviewState, StoredCard, Word } from '../content/schema.ts'

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

/** Local calendar day as YYYY-MM-DD. */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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

export function counts(words: Word[], state: ReviewState, now: Date, newLimit: number): { due: number; newLeft: number } {
  const end = endOfLocalDay(now).getTime()
  const due = words.filter((w) => state.cards[w.id] && Date.parse(state.cards[w.id].due) < end).length
  const unseen = words.filter((w) => !state.cards[w.id]).length
  const newLeft = Math.min(unseen, Math.max(0, newLimit - newIntroducedToday(state, now)))
  return { due, newLeft }
}

export type Next =
  | { kind: 'card'; word: Word; isNew: boolean }
  | { kind: 'wait'; due: Date }
  | { kind: 'done' }

/**
 * Pick the next card: anything due now first, then new words (up to the daily limit, in
 * words.json order), then cards due within LEARN_AHEAD_MS. If only later-today cards remain, wait.
 */
export function nextCard(words: Word[], state: ReviewState, now: Date, newLimit: number): Next {
  const seen = words
    .filter((w) => state.cards[w.id])
    .map((w) => ({ word: w, due: Date.parse(state.cards[w.id].due) }))
    .sort((a, b) => a.due - b.due)
  const first = seen[0]
  if (first && first.due <= now.getTime()) return { kind: 'card', word: first.word, isNew: false }
  if (counts(words, state, now, newLimit).newLeft > 0) {
    const fresh = words.find((w) => !state.cards[w.id])
    if (fresh) return { kind: 'card', word: fresh, isNew: true }
  }
  if (first && first.due <= now.getTime() + LEARN_AHEAD_MS) return { kind: 'card', word: first.word, isNew: false }
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
  return {
    before,
    after,
    state: {
      ...state,
      updatedAt: now.toISOString(),
      newToday: { date: localDay(now), count: before ? introduced : introduced + 1 },
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
 * Merge two review states (used in phone mode: the build-time snapshot from the repo plus
 * what this browser already has). Per word, the card with the later last review wins.
 */
export function mergeStates(a: ReviewState, b: ReviewState): ReviewState {
  const lastReview = (c: StoredCard) => (c.last_review ? Date.parse(c.last_review) : -Infinity)
  const cards = { ...a.cards }
  for (const [id, card] of Object.entries(b.cards)) {
    const mine = cards[id]
    if (!mine || lastReview(card) > lastReview(mine)) cards[id] = card
  }
  let newToday = a.newToday
  if (a.newToday.date === b.newToday.date) {
    newToday = { date: a.newToday.date, count: Math.max(a.newToday.count, b.newToday.count) }
  } else if (b.newToday.date > a.newToday.date) {
    newToday = b.newToday
  }
  const updatedAt = Date.parse(a.updatedAt) >= Date.parse(b.updatedAt) ? a.updatedAt : b.updatedAt
  return { version: 1, scheduler: 'fsrs', updatedAt, newToday, cards }
}
