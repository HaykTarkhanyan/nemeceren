// What to study next, as pure functions: lesson status, which new words are available,
// the next lesson and test, weak words for practice, and how much prepared content is left.
// Used by the Home "Today" panel, the "What next" menu, the Stats page and check-content.
import { byCourseOrder, isThemeLesson } from '../content/lessons.ts'
import type { CourseLesson, Lesson, LessonProgress, Result, ReviewLogEntry, ReviewState, Test, ThemeLesson, Word } from '../content/schema.ts'
import type { StudyWord } from './customWords.ts'

// ---------- lessons ----------

export type LessonStatus = 'not-started' | 'in-progress' | 'done'

export function emptyLessonProgress(): LessonProgress {
  return { version: 1, lessons: {} }
}

export function lessonStatus(p: LessonProgress, lessonId: string): LessonStatus {
  const l = p.lessons[lessonId]
  if (!l) return 'not-started'
  return l.doneAt ? 'done' : 'in-progress'
}

/** Opening a lesson starts it (and unlocks its words). Returns the same object if already started. */
export function startLesson(p: LessonProgress, lessonId: string, now: Date): LessonProgress {
  if (p.lessons[lessonId]) return p
  const at = now.toISOString()
  return { ...p, lessons: { ...p.lessons, [lessonId]: { startedAt: at, updatedAt: at, lastSection: 0, doneAt: null } } }
}

export function setLastSection(p: LessonProgress, lessonId: string, section: number, now: Date): LessonProgress {
  const l = p.lessons[lessonId]
  if (!l) throw new Error(`Lesson "${lessonId}" was not started, so its position cannot be saved`)
  if (l.lastSection === section) return p
  return { ...p, lessons: { ...p.lessons, [lessonId]: { ...l, lastSection: section, updatedAt: now.toISOString() } } }
}

export function markLessonDone(p: LessonProgress, lessonId: string, done: boolean, now: Date): LessonProgress {
  const l = p.lessons[lessonId]
  if (!l) throw new Error(`Lesson "${lessonId}" was not started, so it cannot be marked`)
  const at = now.toISOString()
  return { ...p, lessons: { ...p.lessons, [lessonId]: { ...l, doneAt: done ? at : null, updatedAt: at } } }
}

/** The first course lesson in course order that is not done, with its status; null if all are done. Theme lessons are not part of the course. */
export function nextLesson(lessons: CourseLesson[], p: LessonProgress): { lesson: CourseLesson; status: LessonStatus } | null {
  for (const lesson of [...lessons].sort(byCourseOrder)) {
    const status = lessonStatus(p, lesson.id)
    if (status !== 'done') return { lesson, status }
  }
  return null
}

// ---------- words ----------

/** Ids of words that belong to a lesson (course or theme) that has not been started yet. */
export function lockedWordIds(lessons: Lesson[], p: LessonProgress): Set<string> {
  const unlocked = new Set<string>()
  const inLessons = new Set<string>()
  for (const l of lessons) {
    for (const id of l.words ?? []) {
      inLessons.add(id)
      if (lessonStatus(p, l.id) !== 'not-started') unlocked.add(id)
    }
  }
  return new Set([...inLessons].filter((id) => !unlocked.has(id)))
}

/**
 * Words the review queue may use, in words.json order: every word already introduced, plus new
 * words that belong to no lesson or to a started lesson. A lesson's words are introduced once
 * the lesson is opened, so Hayk meets them right after the explanation.
 */
export function studyWords<W extends { id: string }>(words: W[], lessons: Lesson[], p: LessonProgress, state: ReviewState): W[] {
  const locked = lockedWordIds(lessons, p)
  return words.filter((w) => state.cards[w.id] || !locked.has(w.id))
}

// ---------- where a word review takes its words from ----------

/** All words (the default), Hayk's own words, one unit, or one lesson (course or theme). Only filters the queue; FSRS is unchanged. */
export type WordSource = { kind: 'all' } | { kind: 'mine' } | { kind: 'unit'; unit: number } | { kind: 'lesson'; lessonId: string }

/** Course lessons that list words, in course order: the lessons and units a review can be limited to. */
export function sourceLessons(lessons: CourseLesson[]): CourseLesson[] {
  return lessons.filter((l) => (l.words ?? []).length > 0).sort(byCourseOrder)
}

/** Theme lessons that list words, in the order given: the "Themes" group of the picker. */
export function sourceThemes(themes: ThemeLesson[]): ThemeLesson[] {
  return themes.filter((l) => (l.words ?? []).length > 0)
}

/**
 * The words a review session uses. "all" is studyWords plus Hayk's own words: a lesson's words
 * wait until the lesson (course or theme) is opened. "mine" is his own words only. A unit or
 * lesson takes every word its lessons list, opened or not, because picking it is the explicit
 * choice to learn them (DECISIONS.md #50). Content words keep words.json order, as always; own
 * words come after them, oldest first. `lessons` are all lessons, course and theme.
 */
export function wordsForSource(
  source: WordSource,
  words: Word[],
  custom: StudyWord[],
  lessons: Lesson[],
  p: LessonProgress,
  state: ReviewState,
): StudyWord[] {
  if (source.kind === 'all') return [...studyWords(words, lessons, p, state), ...custom]
  if (source.kind === 'mine') return custom
  const picked = lessons.filter((l) => (source.kind === 'unit' ? l.unit === source.unit : l.id === source.lessonId))
  const ids = new Set(picked.flatMap((l) => l.words ?? []))
  return words.filter((w) => ids.has(w.id))
}

/** How a source is saved per device: "all", "mine", "unit:2" or "lesson:u2-03-plural". */
export function sourceKey(s: WordSource): string {
  if (s.kind === 'all' || s.kind === 'mine') return s.kind
  return s.kind === 'unit' ? `unit:${s.unit}` : `lesson:${s.lessonId}`
}

/** A saved source. One whose unit or lesson (with words) no longer exists becomes "all", with a note to show. `lessons` are all lessons, course and theme. */
export function parseSourceKey(key: string, lessons: Lesson[]): { source: WordSource; note: string | null } {
  if (key === 'all') return { source: { kind: 'all' }, note: null }
  if (key === 'mine') return { source: { kind: 'mine' }, note: null }
  const usable = lessons.filter((l) => (l.words ?? []).length > 0)
  const unit = /^unit:(\d+)$/.exec(key)
  if (unit && usable.some((l) => l.unit === Number(unit[1]))) return { source: { kind: 'unit', unit: Number(unit[1]) }, note: null }
  const lesson = /^lesson:(.+)$/.exec(key)
  if (lesson && usable.some((l) => l.id === lesson[1])) return { source: { kind: 'lesson', lessonId: lesson[1] }, note: null }
  return { source: { kind: 'all' }, note: `Your last pick ("${key}") no longer exists, so the review uses all words.` }
}

export function sourceLabel(s: WordSource, lessons: Lesson[]): string {
  if (s.kind === 'all') return 'all words'
  if (s.kind === 'mine') return 'my words'
  if (s.kind === 'unit') return `Unit ${s.unit}`
  const l = lessons.find((x) => x.id === s.lessonId)
  if (!l) throw new Error(`No lesson "${s.lessonId}" for the word review`)
  return isThemeLesson(l) ? `Theme: ${l.theme.title}` : `${l.unit}.${l.order} ${l.title}`
}

export interface WeakWord<W = StudyWord> {
  word: W
  reasons: string[]
  score: number
}

export const WEAK_WINDOW_DAYS = 14

/**
 * Words worth extra practice: graded Again or a near miss in the last 14 days (scheduled reviews
 * only, not earlier practice), or forgotten before (FSRS lapses). Strongest first, at most limit.
 */
export function weakWords<W extends { id: string }>(words: W[], state: ReviewState, log: ReviewLogEntry[], now: Date, limit = 10): WeakWord<W>[] {
  const since = now.getTime() - WEAK_WINDOW_DAYS * 86_400_000
  const byId = new Map<string, { again: number; near: number; last: number }>()
  for (const e of log) {
    const at = Date.parse(e.ts)
    if (e.practice || at < since) continue
    const cur = byId.get(e.wordId) ?? { again: 0, near: 0, last: 0 }
    if (e.rating === 1) cur.again += 1
    if (e.nearMiss && e.nearMiss.length > 0) cur.near += 1
    cur.last = Math.max(cur.last, at)
    byId.set(e.wordId, cur)
  }
  const out: (WeakWord<W> & { last: number })[] = []
  for (const w of words) {
    const card = state.cards[w.id]
    if (!card) continue
    const recent = byId.get(w.id) ?? { again: 0, near: 0, last: 0 }
    const reasons: string[] = []
    if (recent.again > 0) reasons.push(`Again ${recent.again}x recently`)
    if (recent.near > 0) reasons.push(`close ${recent.near}x recently`)
    if (card.lapses > 0) reasons.push(`forgotten ${card.lapses}x`)
    const score = 2 * recent.again + recent.near + card.lapses
    if (score > 0) out.push({ word: w, reasons, score, last: recent.last })
  }
  return out
    .sort((a, b) => b.score - a.score || b.last - a.last)
    .slice(0, limit)
    .map(({ word, reasons, score }) => ({ word, reasons, score }))
}

/** Introduced words with an example sentence, most recently reviewed first (for listening practice). */
export function listeningWords(words: Word[], state: ReviewState, limit = 5): Word[] {
  return words
    .filter((w) => w.example && state.cards[w.id])
    .sort((a, b) => (state.cards[b.id].last_review ?? '').localeCompare(state.cards[a.id].last_review ?? ''))
    .slice(0, limit)
}

// ---------- tests ----------

/** Tests in course order: unit (from the test, or its lesson), lesson order, then oldest first. Tests with no unit come last. */
export function courseTests(tests: Test[], lessons: Lesson[]): Test[] {
  const lessonById = new Map(lessons.map((l) => [l.id, l]))
  const key = (t: Test) => {
    const l = t.lesson ? lessonById.get(t.lesson) : undefined
    return { unit: t.unit ?? l?.unit ?? Infinity, order: l?.order ?? Infinity }
  }
  return [...tests].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka.unit - kb.unit || ka.order - kb.order || a.created.localeCompare(b.created) || a.id.localeCompare(b.id)
  })
}

export function takenTestIds(results: Result[]): Set<string> {
  return new Set(results.filter((r) => r.lessonId === undefined).map((r) => r.testId))
}

/** The first test in course order that has never been submitted; null if all were taken. */
export function nextTest(tests: Test[], lessons: Lesson[], results: Result[]): Test | null {
  const taken = takenTestIds(results)
  return courseTests(tests, lessons).find((t) => !taken.has(t.id)) ?? null
}

// ---------- content runway (for Claude as the author) ----------

export interface Runway {
  /** New words not introduced yet, all of them. */
  newWords: number
  /** ...of which available now (no lesson, or their lesson is started). */
  newWordsAvailable: number
  /** ...of which wait for a lesson to be started. */
  newWordsInLessons: number
  /** Days of new words at the given daily limit (null when the limit is 0). */
  days: number | null
  testsLeft: number
  lessonsLeft: number
  totals: { words: number; tests: number; lessons: number }
}

/** Prepared content left: `lessons` are the course lessons (lessons left counts only those); `themes` only hold their words back until opened. */
export function contentRunway(
  input: { words: Word[]; tests: Test[]; lessons: CourseLesson[]; themes: ThemeLesson[] },
  p: LessonProgress,
  state: ReviewState,
  results: Result[],
  newPerDay: number,
): Runway {
  const locked = lockedWordIds([...input.lessons, ...input.themes], p)
  const fresh = input.words.filter((w) => !state.cards[w.id])
  const inLessons = fresh.filter((w) => locked.has(w.id)).length
  const taken = takenTestIds(results)
  return {
    newWords: fresh.length,
    newWordsAvailable: fresh.length - inLessons,
    newWordsInLessons: inLessons,
    days: newPerDay > 0 ? Math.ceil(fresh.length / newPerDay) : null,
    testsLeft: input.tests.filter((t) => !taken.has(t.id)).length,
    lessonsLeft: input.lessons.filter((l) => lessonStatus(p, l.id) !== 'done').length,
    totals: { words: input.words.length, tests: input.tests.length, lessons: input.lessons.length },
  }
}

export function runwayText(r: Runway, newPerDay: number): string {
  const days = r.days === null ? '' : ` (about ${r.days} day${r.days === 1 ? '' : 's'} at ${newPerDay} a day)`
  const lessonNote = r.newWordsInLessons > 0 ? `, ${r.newWordsInLessons} of them unlock when their lesson is opened` : ''
  return (
    `${r.newWords} of ${r.totals.words} words not introduced yet${days}${lessonNote}; ` +
    `${r.testsLeft} of ${r.totals.tests} tests not taken; ${r.lessonsLeft} of ${r.totals.lessons} lessons not done`
  )
}
