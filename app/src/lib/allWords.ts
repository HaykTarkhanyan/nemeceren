// The "All words" list on the Words page (DECISIONS.md #59), as pure functions: one row per word
// (content words, locked or not, and Hayk's own words), its status, and the search, filters,
// counts and sort orders. FSRS state comes from the cards as they are (lib/srs.ts), and "known"
// is the Stats page's rule (lib/stats.ts KNOWN_DAYS).
import { lessonLabel } from '../content/lessons.ts'
import type { CourseLesson, CustomWord, Lesson, LessonProgress, ReviewLogEntry, ReviewState, StoredCard, ThemeLesson, Word } from '../content/schema.ts'
import { practiceWord, withoutArticle } from './customWords.ts'
import { daysBetween, localDay } from './dates.ts'
import { lockedWordIds } from './plan.ts'
import { KNOWN_DAYS } from './stats.ts'
import { foldBare, foldSpelled } from './text.ts'

/** In the order of the filter chips. "locked" is left out of "All" by default. */
export const WORD_STATUSES = ['not-started', 'new', 'learning', 'review', 'known', 'struggling', 'locked'] as const
export type WordStatus = (typeof WORD_STATUSES)[number]

export const STATUS_LABEL: Record<WordStatus, string> = {
  'not-started': 'not started',
  new: 'new',
  learning: 'learning',
  review: 'review',
  known: 'known',
  struggling: 'struggling',
  locked: 'locked',
}

/** Forgotten this often (FSRS lapses) makes a word "struggling". */
export const STRUGGLING_LAPSES = 2

/**
 * One status per word, first match wins:
 *   no card:  own word -> new (it is introduced right away); content word of an unopened lesson -> locked; else not started
 *   card never reviewed (reps 0, added from the "already in lesson" hint) -> new
 *   lapses >= 2, or the last scheduled review (practice does not count) was graded Again -> struggling
 *   FSRS state Review with an interval of 21 days or more -> known (the Stats page's rule)
 *   FSRS state Review -> review
 *   anything else (Learning, Relearning) -> learning
 */
export function wordStatus(w: { card: StoredCard | undefined; custom: boolean; locked: boolean; lastRating: number | null }): WordStatus {
  const { card } = w
  if (!card) return w.custom ? 'new' : w.locked ? 'locked' : 'not-started'
  if (card.reps === 0) return 'new'
  if (card.lapses >= STRUGGLING_LAPSES || w.lastRating === 1) return 'struggling'
  if (card.state === 2) return card.scheduled_days >= KNOWN_DAYS ? 'known' : 'review'
  return 'learning'
}

export type RowSource = { kind: 'custom' } | { kind: 'lesson'; lesson: Lesson } | { kind: 'bank' }

export interface WordRow {
  id: string
  /** As shown and practised: Claude's corrections replace Hayk's fields. */
  de: string
  en: string
  plural?: string
  example?: { de: string; en?: string }
  source: RowSource
  /** Every lesson that lists the word: course order, then theme lessons. */
  lessonIds: string[]
  status: WordStatus
  /** Next review (ISO). An own word not reviewed yet is due at once (its creation time); null for content words not started. */
  due: string | null
  /** Scheduled reviews in the loaded log (the last weeks; practice not counted, as on the Stats page). */
  reviews: number
  correct: number
  again: number
  lapses: number
  /** From the card, so all time. */
  lastReview: string | null
  /** words.json "added" (a date) or the own word's createdAt. */
  added: string
  /** Newest first, at most 10, practice included. */
  history: ReviewLogEntry[]
  /** The own word itself (for its note, Claude's check, edit and delete). */
  custom?: CustomWord
}

export const HISTORY_SIZE = 10

export function buildRows(input: {
  words: Word[]
  custom: CustomWord[]
  lessons: CourseLesson[]
  themes: ThemeLesson[]
  progress: LessonProgress
  state: ReviewState
  log: ReviewLogEntry[]
}): WordRow[] {
  const { state } = input
  const allLessons: Lesson[] = [...input.lessons, ...input.themes]
  const locked = lockedWordIds(allLessons, input.progress)
  const lessonsOf = new Map<string, Lesson[]>()
  for (const l of allLessons) {
    for (const id of l.words ?? []) {
      const list = lessonsOf.get(id)
      if (list) list.push(l)
      else lessonsOf.set(id, [l])
    }
  }

  const byWord = new Map<string, ReviewLogEntry[]>()
  for (const e of input.log) {
    const list = byWord.get(e.wordId)
    if (list) list.push(e)
    else byWord.set(e.wordId, [e])
  }

  function logStats(id: string) {
    const entries = [...(byWord.get(id) ?? [])].sort((a, b) => a.ts.localeCompare(b.ts))
    const scheduled = entries.filter((e) => !e.practice)
    return {
      reviews: scheduled.length,
      correct: scheduled.filter((e) => e.rating >= 2).length,
      again: scheduled.filter((e) => e.rating === 1).length,
      lastRating: scheduled.length > 0 ? scheduled[scheduled.length - 1].rating : null,
      history: entries.reverse().slice(0, HISTORY_SIZE),
    }
  }

  const rows: WordRow[] = []
  for (const w of input.words) {
    const card = state.cards[w.id]
    const stats = logStats(w.id)
    const lessons = lessonsOf.get(w.id) ?? []
    rows.push({
      id: w.id,
      de: w.de,
      en: w.en,
      ...(w.plural !== undefined ? { plural: w.plural } : {}),
      ...(w.example ? { example: w.example } : {}),
      source: lessons.length > 0 ? { kind: 'lesson', lesson: lessons[0] } : { kind: 'bank' },
      lessonIds: lessons.map((l) => l.id),
      status: wordStatus({ card, custom: false, locked: locked.has(w.id), lastRating: stats.lastRating }),
      due: card?.due ?? null,
      reviews: stats.reviews,
      correct: stats.correct,
      again: stats.again,
      lapses: card?.lapses ?? 0,
      lastReview: card?.last_review ?? null,
      added: w.added,
      history: stats.history,
    })
  }
  for (const c of input.custom) {
    const w = practiceWord(c)
    const card = state.cards[c.id]
    const stats = logStats(c.id)
    rows.push({
      id: c.id,
      de: w.de,
      en: w.en,
      ...(w.plural !== undefined ? { plural: w.plural } : {}),
      ...(w.example ? { example: w.example } : {}),
      source: { kind: 'custom' },
      lessonIds: [],
      status: wordStatus({ card, custom: true, locked: false, lastRating: stats.lastRating }),
      due: card?.due ?? c.createdAt,
      reviews: stats.reviews,
      correct: stats.correct,
      again: stats.again,
      lapses: card?.lapses ?? 0,
      lastReview: card?.last_review ?? null,
      added: c.createdAt,
      history: stats.history,
      custom: c,
    })
  }
  return rows
}

// ---------- search, filters, counts ----------

/** "All" shows every status but locked; the chips pick one status. */
export type StatusFilter = 'all' | WordStatus
/** "all", "custom" (My words), "bank" (content words in no lesson), or "lesson:<id>". */
export type SourceFilter = string

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** German or English contains the query, ignoring case and umlauts ("uber", "ueber" and "über" all find "über"). */
export function matchesSearch(row: { de: string; en: string }, query: string): boolean {
  const q = fold(query)
  if (q === '') return true
  const hay = [row.de, row.en].map(fold)
  return hay.some((h) => foldBare(h).includes(foldBare(q)) || foldSpelled(h).includes(foldSpelled(q)))
}

export function matchesSource(row: WordRow, source: SourceFilter): boolean {
  if (source === 'all') return true
  if (source === 'custom') return row.source.kind === 'custom'
  if (source === 'bank') return row.source.kind === 'bank'
  const m = /^lesson:(.+)$/.exec(source)
  if (!m) throw new Error(`Unknown source filter "${source}"`)
  return row.lessonIds.includes(m[1])
}

export function matchesStatus(row: WordRow, status: StatusFilter): boolean {
  return status === 'all' ? row.status !== 'locked' : row.status === status
}

/** Search and source first (the chip counts are taken there), then the status. */
export function filterRows(rows: WordRow[], f: { query: string; source: SourceFilter; status: StatusFilter }): WordRow[] {
  return rows.filter((r) => matchesSearch(r, f.query) && matchesSource(r, f.source) && matchesStatus(r, f.status))
}

/** The counts on the status chips, for the rows that pass the search and source filter. "all" leaves locked words out, like the filter. */
export function statusCounts(rows: WordRow[], f: { query: string; source: SourceFilter }): Record<StatusFilter, number> {
  const out = Object.fromEntries([['all', 0], ...WORD_STATUSES.map((s) => [s, 0])]) as Record<StatusFilter, number>
  for (const r of rows) {
    if (!matchesSearch(r, f.query) || !matchesSource(r, f.source)) continue
    out[r.status] += 1
    if (r.status !== 'locked') out.all += 1
  }
  return out
}

// ---------- sorting ----------

export type SortKey = 'due' | 'alpha' | 'hardest' | 'recent'

export const SORT_LABEL: Record<SortKey, string> = { due: 'Next review', alpha: 'A to Z', hardest: 'Hardest first', recent: 'Recently added' }

const alphaKey = (r: WordRow) => withoutArticle(r.de)
const byAlpha = (a: WordRow, b: WordRow) => alphaKey(a).localeCompare(alphaKey(b), 'de') || a.id.localeCompare(b.id)

/** % correct of the scheduled reviews in the loaded log, or null without reviews. */
export function correctPct(r: WordRow): number | null {
  return r.reviews > 0 ? Math.round((100 * r.correct) / r.reviews) : null
}

/**
 * due: soonest first, words without a review date last. alpha: German without its article.
 * hardest: most lapses and Again grades first (2 per lapse, 1 per Again), then the lower % correct;
 * words never reviewed last. recent: newest first.
 */
export function sortRows(rows: WordRow[], key: SortKey): WordRow[] {
  const out = [...rows]
  switch (key) {
    case 'due':
      return out.sort((a, b) => (a.due === null ? 1 : 0) - (b.due === null ? 1 : 0) || (a.due ?? '').localeCompare(b.due ?? '') || byAlpha(a, b))
    case 'alpha':
      return out.sort(byAlpha)
    case 'hardest': {
      const tried = (r: WordRow) => (r.reviews > 0 || r.lapses > 0 ? 0 : 1)
      const score = (r: WordRow) => 2 * r.lapses + r.again
      return out.sort((a, b) => tried(a) - tried(b) || score(b) - score(a) || (correctPct(a) ?? 101) - (correctPct(b) ?? 101) || byAlpha(a, b))
    }
    case 'recent':
      return out.sort((a, b) => b.added.localeCompare(a.added) || byAlpha(a, b))
  }
}

/** "today" (also when overdue), "tomorrow", "in 3 days"; null stays "-". */
export function relativeDue(due: string | null, now: Date): string {
  if (due === null) return '-'
  const days = daysBetween(localDay(now), localDay(new Date(due)))
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/** "today", "yesterday", "3 days ago"; null is "-". */
export function relativePast(at: string | null, now: Date): string {
  if (at === null) return '-'
  const days = daysBetween(localDay(new Date(at)), localDay(now))
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** The row's source as text: "My words", "Lesson 1.3", "Theme: <title>", "Word bank". */
export function sourceText(s: RowSource): string {
  if (s.kind === 'custom') return 'My words'
  if (s.kind === 'bank') return 'Word bank'
  return lessonLabel(s.lesson)
}
