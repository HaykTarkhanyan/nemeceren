// The Read page (content/readings.json): short texts with audio, word popups, a translation per
// sentence, questions with instant feedback and "Add N new words to review". Pure helpers, tested
// in readings.test.ts.
import { readingTestId } from '../content/readings.ts'
import type { Lesson, Reading, ReadingKind, ReadingSentence, Result, WordSet } from '../content/schema.ts'
import { finalScore } from './grading.ts'

export const KIND_LABEL: Record<ReadingKind, string> = { story: 'Story', fact: 'Fun fact', everyday: 'Everyday' }

export type ReadingFilter = 'all' | ReadingKind

export const READING_FILTERS: { value: ReadingFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'story', label: 'Stories' },
  { value: 'fact', label: 'Facts' },
  { value: 'everyday', label: 'Everyday' },
]

export function filterReadings(texts: Reading[], filter: ReadingFilter): Reading[] {
  return filter === 'all' ? texts : texts.filter((r) => r.kind === filter)
}

/** Units in ascending order, each with its texts in file order. */
export function byUnit(texts: Reading[]): { unit: number; texts: Reading[] }[] {
  const units = [...new Set(texts.map((r) => r.unit))].sort((a, b) => a - b)
  return units.map((unit) => ({ unit, texts: texts.filter((r) => r.unit === unit) }))
}

/**
 * A text counts as read once an attempt at its questions is saved (testId "r-<id>"); nothing else
 * is stored. `best` is the best attempt's score.
 */
export type ReadStatus = { kind: 'not-read' } | { kind: 'read'; attempts: number; best: { correct: number; total: number } }

export function readStatus(readingId: string, results: Result[]): ReadStatus {
  const testId = readingTestId(readingId)
  const mine = results.filter((r) => r.testId === testId)
  if (mine.length === 0) return { kind: 'not-read' }
  const scores = mine.map(finalScore)
  const best = scores.reduce((a, b) => (b.correct / Math.max(1, b.total) > a.correct / Math.max(1, a.total) ? b : a))
  return { kind: 'read', attempts: mine.length, best: { correct: best.correct, total: best.total } }
}

/** The text's new words that have no card yet: what "Add N new words to review" adds, in the text's order. */
export function wordsToAdd(reading: Reading, cards: Record<string, unknown>): string[] {
  return (reading.words ?? []).filter((id) => cards[id] === undefined)
}

/**
 * Words that only readings list (in no lesson and no word set). They wait for their reading's
 * "Add N new words" button, as theme words wait for their theme, instead of joining the path's
 * new words (lib/plan.ts pathNewWords takes words in no lesson right after the reachable lessons).
 */
export function readingOnlyWordIds(readings: Reading[], lessons: Lesson[], sets: WordSet[]): Set<string> {
  const elsewhere = new Set([...lessons.flatMap((l) => l.words ?? []), ...sets.flatMap((s) => s.words)])
  return new Set(readings.flatMap((r) => r.words ?? []).filter((id) => !elsewhere.has(id)))
}

/** The word bank for the review and the daily mix: reading-only words leave it until they have a card. */
export function withoutWaitingReadingWords<W extends { id: string }>(words: W[], readingOnly: ReadonlySet<string>, cards: Record<string, unknown>): W[] {
  return words.filter((w) => !readingOnly.has(w.id) || cards[w.id] !== undefined)
}

/** The voice of each sentence (lib/speech.ts dialogueVoice): speakers in order of appearance, 0 for a text without speakers. */
export function speakerIndexes(sentences: ReadingSentence[]): number[] {
  const order: string[] = []
  return sentences.map((s) => {
    if (s.speaker === undefined) return 0
    if (!order.includes(s.speaker)) order.push(s.speaker)
    return order.indexOf(s.speaker)
  })
}

/** check-content's line about content/readings.json. */
export function readingsCountText(texts: Reading[]): string {
  const n = (k: ReadingKind) => texts.filter((r) => r.kind === k).length
  const units = byUnit(texts)
    .map((u) => `unit ${u.unit}: ${u.texts.length}`)
    .join(', ')
  return `Read page: ${texts.length} texts (stories ${n('story')}, facts ${n('fact')}, everyday ${n('everyday')}; ${units}).`
}
