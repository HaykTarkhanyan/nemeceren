// The Speak page (Hayk, 2026-11-26; DECISIONS.md #121): which words "Say the words" plays, from Hayk's choices. Pure,
// so the page and the tests share it. Where the words come from is the page's job; this filters and orders them.
import type { ReviewLogEntry, ReviewState } from '../content/schema.ts'
import { isLearned } from './daily.ts'
import { addDays } from './dates.ts'
import { weakestFirst } from './games.ts'
import { shuffle } from './shuffle.ts'

export const SPEAK_WHICH = ['learned', 'due', 'hard', 'recent', 'missed', 'new', 'any'] as const
export type SpeakWhich = (typeof SPEAK_WHICH)[number]

export const SPEAK_WHICH_LABEL: Record<SpeakWhich, string> = {
  learned: 'All learned words',
  due: 'Due now',
  hard: 'Hard: missed at least once',
  recent: 'Learned in the last 7 days',
  missed: 'Got wrong in the last 7 days',
  new: 'New: not learned yet',
  any: 'Everything, learned or not',
}

export const SPEAK_KINDS = ['noun', 'verb', 'adjective', 'phrase', 'other'] as const
export type SpeakKind = (typeof SPEAK_KINDS)[number]

export const SPEAK_KIND_LABEL: Record<SpeakKind, string> = {
  noun: 'Nouns',
  verb: 'Verbs',
  adjective: 'Adjectives and adverbs',
  phrase: 'Phrases',
  other: 'Other (numbers, small words)',
}

export const SPEAK_ORDERS = ['weakest', 'random', 'course'] as const
export type SpeakOrder = (typeof SPEAK_ORDERS)[number]

export const SPEAK_ORDER_LABEL: Record<SpeakOrder, string> = {
  weakest: 'Weakest first',
  random: 'Random',
  course: 'Course order',
}

/** Words per round; 0 = keep going through every matching word. */
export const SPEAK_SIZES = [8, 15, 30, 0] as const

/** "Recent" and "missed" look this many days back, today included. */
export const SPEAK_DAYS = 7

/**
 * A word's kind, from the card itself where it can tell: a noun has der/die/das, a phrase has several words or ends
 * with ?, ! or ., a verb's English starts with "to". Otherwise the glossary's part of speech decides between adjective
 * (or adverb) and other; `pos` is null while the glossary is still loading, and then such a word counts as "other".
 */
export function wordKind(w: { de: string; en: string }, pos: ReadonlySet<string> | null): SpeakKind {
  const de = w.de.trim()
  if (/^(der|die|das)\s/i.test(de)) return 'noun'
  if (/\s/.test(de) || /[?!.]$/.test(de)) return 'phrase'
  if (/^to\s/i.test(w.en) || /;\s*to\s/i.test(w.en)) return 'verb'
  if (pos && (pos.has('adjective') || pos.has('adverb'))) return 'adjective'
  return 'other'
}

/** Words first reviewed (recent) and words answered wrong (missed) in the last SPEAK_DAYS days. */
export function recentAndMissed(log: readonly Pick<ReviewLogEntry, 'wordId' | 'localDay' | 'isNew' | 'practice' | 'rating'>[], today: string): {
  recent: Set<string>
  missed: Set<string>
} {
  const since = addDays(today, -(SPEAK_DAYS - 1))
  const recent = new Set<string>()
  const missed = new Set<string>()
  for (const e of log) {
    if (!e.localDay || e.localDay < since || e.localDay > today) continue
    if (e.isNew && !e.practice) recent.add(e.wordId)
    if (e.rating === 1) missed.add(e.wordId)
  }
  return { recent, missed }
}

export function matchesWhich(id: string, which: SpeakWhich, state: ReviewState, now: Date, recentIds: ReadonlySet<string>, missedIds: ReadonlySet<string>): boolean {
  const card = state.cards[id]
  switch (which) {
    case 'learned':
      return isLearned(state, id)
    case 'due':
      return isLearned(state, id) && Date.parse(card.due) <= now.getTime()
    case 'hard':
      return isLearned(state, id) && card.lapses > 0
    case 'recent':
      return recentIds.has(id)
    case 'missed':
      return missedIds.has(id)
    case 'new':
      return !isLearned(state, id)
    case 'any':
      return true
  }
}

/** The order to play them in: weakest first (learned words by misses and stability, then the rest as given), random, or as given (course order). */
export function orderSpeak<W extends { id: string }>(words: W[], state: ReviewState, order: SpeakOrder, rand: () => number = Math.random): W[] {
  if (order === 'random') return shuffle(words, rand)
  if (order === 'course') return words
  const weak = weakestFirst(words, state)
  const ids = new Set(weak.map((w) => w.id))
  return [...weak, ...words.filter((w) => !ids.has(w.id))]
}

export interface SpeakChoice {
  which: SpeakWhich
  kinds: readonly SpeakKind[]
  order: SpeakOrder
}

/** The words to play, in order: those of `words` (course order, each once) that match `which` and one of `kinds`. */
export function speakSelection<W extends { id: string; de: string; en: string }>(input: {
  words: W[]
  state: ReviewState
  log: readonly Pick<ReviewLogEntry, 'wordId' | 'localDay' | 'isNew' | 'practice' | 'rating'>[]
  now: Date
  today: string
  choice: SpeakChoice
  posOf: (de: string) => ReadonlySet<string> | null
  rand?: () => number
}): W[] {
  const { recent, missed } = recentAndMissed(input.log, input.today)
  const kinds = new Set(input.choice.kinds)
  const picked = input.words.filter(
    (w) => matchesWhich(w.id, input.choice.which, input.state, input.now, recent, missed) && kinds.has(wordKind(w, input.posOf(w.de))),
  )
  return orderSpeak(picked, input.state, input.choice.order, input.rand)
}
