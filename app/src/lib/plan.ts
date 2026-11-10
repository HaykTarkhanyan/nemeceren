// What to study next, as pure functions: lesson status, which new words are available,
// the next lesson and test, weak words for practice, and how much prepared content is left.
// Used by the Home "Today" panel, the "What next" menu, the Stats page and check-content.
import { byCourseOrder, isCourseLesson, isThemeLesson } from '../content/lessons.ts'
import type { CourseLesson, Lesson, LessonProgress, Result, ReviewLogEntry, ReviewState, Test, ThemeLesson, Word } from '../content/schema.ts'
import type { StudyWord } from './customWords.ts'
import type { PathReach } from './path.ts'

export type { PathReach }

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
 * The course lessons whose words can come as new words (words follow the path, design
 * _knowledge/2026-11-07_practice-games-design.md): every lesson up to the one the path is at, the
 * next one (pre-learning), lessons with a station done ahead of the path, and the lesson after each
 * of those. So a test not passed (where "Du bist hier" stays) does not stop new words while Hayk
 * goes on with the lessons after it. All of them when the path is done. A lesson only opened far
 * ahead is not reached: its words wait.
 */
export function reachableLessons(lessons: CourseLesson[], reach: PathReach): Set<string> {
  const sorted = [...lessons].sort(byCourseOrder)
  if (reach.at === null) return new Set(sorted.map((l) => l.id))
  const at = sorted.findIndex((l) => l.id === reach.at)
  if (at < 0) throw new Error(`The path is at lesson "${reach.at}", which is not in the course`)
  const started = (i: number) => i >= 0 && reach.started.has(sorted[i].id)
  return new Set(sorted.filter((_, i) => i <= at + 1 || started(i) || started(i - 1)).map((l) => l.id))
}

/**
 * The one rule for new words, used by the Words page ("all") and the daily mix: content words with
 * no card yet, in course order (unit, lesson, then the word's place in the lesson's `words`) from
 * the reachable lessons; then the words of opened theme lessons. A word in two lessons comes at its
 * first place. `lessons` are all lessons, course and theme. Words in no lesson (the word bank: word
 * sets, readings, the A1 gaps) are not path words: they come after the whole course (withCourseRest),
 * or earlier when a set is picked (DECISIONS.md #111).
 */
export function pathNewWords<W extends { id: string }>(words: W[], lessons: Lesson[], p: LessonProgress, state: ReviewState, reach: PathReach): W[] {
  const byId = new Map(words.map((w) => [w.id, w]))
  const course = lessons.filter(isCourseLesson).sort(byCourseOrder)
  const reached = reachableLessons(course, reach)
  const order: string[] = []
  for (const l of course) if (reached.has(l.id)) order.push(...(l.words ?? []))
  for (const l of lessons) if (isThemeLesson(l) && lessonStatus(p, l.id) !== 'not-started') order.push(...(l.words ?? []))
  const seen = new Set<string>()
  const out: W[] = []
  for (const id of order) {
    const w = byId.get(id)
    if (!w || seen.has(id) || state.cards[id]) continue
    seen.add(id)
    out.push(w)
  }
  return out
}

/**
 * Words the review queue may use: every word already introduced (words.json order), then the new
 * words in path order (pathNewWords). The review takes new words from the front of the list.
 */
export function studyWords<W extends { id: string }>(words: W[], lessons: Lesson[], p: LessonProgress, state: ReviewState, reach: PathReach): W[] {
  return [...words.filter((w) => state.cards[w.id]), ...pathNewWords(words, lessons, p, state, reach)]
}

/**
 * The full order of words (2026-11-09, no locks): `pool` (introduced words, the path's new words, own
 * words), then every other word of the course lessons in course order, then the word bank (words in
 * no lesson), so the course always comes first and a round is always full (DECISIONS.md #111).
 * `lessons` are all lessons: theme words are never added here, they wait for their theme.
 */
export function withCourseRest<W extends { id: string }>(pool: W[], words: W[], lessons: Lesson[]): W[] {
  const byId = new Map(words.map((w) => [w.id, w]))
  const seen = new Set(pool.map((w) => w.id))
  const rest: W[] = []
  for (const l of lessons.filter(isCourseLesson).sort(byCourseOrder)) {
    for (const id of l.words ?? []) {
      const w = byId.get(id)
      if (!w || seen.has(id)) continue
      seen.add(id)
      rest.push(w)
    }
  }
  const inLessons = new Set(lessons.flatMap((l) => l.words ?? []))
  for (const w of words) {
    if (inLessons.has(w.id) || seen.has(w.id)) continue
    seen.add(w.id)
    rest.push(w)
  }
  return [...pool, ...rest]
}

// ---------- where a word review takes its words from ----------

/**
 * All words (the default), Hayk's own words, one unit, one lesson (course or theme), or several
 * lessons (ticked tiles on the Words map). Only filters the queue; FSRS is unchanged.
 */
export type WordSource =
  | { kind: 'all' }
  | { kind: 'mine' }
  | { kind: 'unit'; unit: number }
  | { kind: 'lesson'; lessonId: string }
  | { kind: 'lessons'; lessonIds: string[] }

/** The last part of a link or key for several lessons: the lesson ids joined by commas. Ids are slugs, so they hold no comma. */
export function lessonsPart(lessonIds: readonly string[]): string {
  if (lessonIds.length === 0) throw new Error('A pick of map tiles needs at least one lesson')
  return lessonIds.join(',')
}

/** The lessons a part names ("u1-01-a" or "u1-01-a,u1-02-b"), in that order; an empty part, a repeat or an unknown id is a problem to show. */
export function lessonsOfPart<L extends { id: string }>(part: string, lessons: readonly L[]): { lessons: L[] } | { problem: string } {
  const ids = part.split(',')
  const out: L[] = []
  for (const id of ids) {
    if (id === '') return { problem: `The lesson list "${part}" has an empty part.` }
    if (out.some((l) => l.id === id)) return { problem: `The lesson list "${part}" names "${id}" twice.` }
    const lesson = lessons.find((l) => l.id === id)
    if (!lesson) return { problem: `There is no lesson "${id}" to practise.` }
    out.push(lesson)
  }
  return { lessons: out }
}

/** The review source for ticked lessons: one lesson as "lesson", several as "lessons". */
export function lessonsSource(lessonIds: readonly string[]): WordSource {
  if (lessonIds.length === 0) throw new Error('A review of map tiles needs at least one lesson')
  return lessonIds.length === 1 ? { kind: 'lesson', lessonId: lessonIds[0] } : { kind: 'lessons', lessonIds: [...lessonIds] }
}

/** Course lessons that list words, in course order: the lessons and units a review can be limited to. */
export function sourceLessons(lessons: CourseLesson[]): CourseLesson[] {
  return lessons.filter((l) => (l.words ?? []).length > 0).sort(byCourseOrder)
}

/** Theme lessons that list words, in the order given: the "Themes" group of the picker. */
export function sourceThemes(themes: ThemeLesson[]): ThemeLesson[] {
  return themes.filter((l) => (l.words ?? []).length > 0)
}

/**
 * The words a review session uses. "all" is studyWords plus Hayk's own words: new words follow
 * the path (`reach`), and a theme lesson's words wait until it is opened. "mine" is his own words
 * only. A unit, a lesson or several lessons take every word their lessons list, opened or not,
 * because picking them is the explicit choice to learn them (DECISIONS.md #50); those keep
 * words.json order. Own words come after the content words, oldest first. `lessons` are all
 * lessons, course and theme; a lesson id of "lessons" that is not among them is an error.
 */
export function wordsForSource(
  source: WordSource,
  words: Word[],
  custom: StudyWord[],
  lessons: Lesson[],
  p: LessonProgress,
  state: ReviewState,
  reach: PathReach,
): StudyWord[] {
  // No locks (Hayk, 2026-11-09: "as many as I want"): after the path's new words comes the rest of
  // the course in course order, so the review never runs dry. Theme words still wait for their theme.
  if (source.kind === 'all') return [...withCourseRest(studyWords(words, lessons, p, state, reach), words, lessons), ...custom]
  if (source.kind === 'mine') return custom
  let picked: Lesson[]
  if (source.kind === 'lessons') {
    const named = lessonsOfPart(lessonsPart(source.lessonIds), lessons)
    if ('problem' in named) throw new Error(`The word review cannot use these lessons: ${named.problem}`)
    picked = named.lessons
  } else picked = lessons.filter((l) => (source.kind === 'unit' ? l.unit === source.unit : l.id === source.lessonId))
  const ids = new Set(picked.flatMap((l) => l.words ?? []))
  return words.filter((w) => ids.has(w.id))
}

/** A unit's words (each once) and how many are not learned yet (never reviewed), for the test station's sheet. */
export function unitWordsLeft(unit: number, lessons: CourseLesson[], state: ReviewState): { total: number; left: number } {
  const ids = new Set(lessons.filter((l) => l.unit === unit).flatMap((l) => l.words ?? []))
  const left = [...ids].filter((id) => (state.cards[id]?.reps ?? 0) === 0).length
  return { total: ids.size, left }
}

/** How a source is saved per device: "all", "mine", "unit:2", "lesson:u2-03-plural" or "lessons:u2-01-a,u2-02-b". */
export function sourceKey(s: WordSource): string {
  if (s.kind === 'all' || s.kind === 'mine') return s.kind
  if (s.kind === 'unit') return `unit:${s.unit}`
  if (s.kind === 'lesson') return `lesson:${s.lessonId}`
  return `lessons:${lessonsPart(s.lessonIds)}`
}

/**
 * A saved source. One whose unit or lesson (with words) no longer exists becomes "all", with a note
 * to show; so does a list of lessons with an empty part, a repeat or an unknown id, and the note
 * names the problem. `lessons` are all lessons, course and theme.
 */
export function parseSourceKey(key: string, lessons: Lesson[]): { source: WordSource; note: string | null } {
  if (key === 'all') return { source: { kind: 'all' }, note: null }
  if (key === 'mine') return { source: { kind: 'mine' }, note: null }
  const usable = lessons.filter((l) => (l.words ?? []).length > 0)
  const unit = /^unit:(\d+)$/.exec(key)
  if (unit && usable.some((l) => l.unit === Number(unit[1]))) return { source: { kind: 'unit', unit: Number(unit[1]) }, note: null }
  const lesson = /^lesson:(.+)$/.exec(key)
  if (lesson && usable.some((l) => l.id === lesson[1])) return { source: { kind: 'lesson', lessonId: lesson[1] }, note: null }
  const several = /^lessons:(.*)$/.exec(key)
  if (several) {
    const named = lessonsOfPart(several[1], usable)
    if ('problem' in named) return { source: { kind: 'all' }, note: `Your last pick ("${key}") cannot be used: ${named.problem} The review uses all words.` }
    return { source: { kind: 'lessons', lessonIds: named.lessons.map((l) => l.id) }, note: null }
  }
  return { source: { kind: 'all' }, note: `Your last pick ("${key}") no longer exists, so the review uses all words.` }
}

export function sourceLabel(s: WordSource, lessons: Lesson[]): string {
  if (s.kind === 'all') return 'all words'
  if (s.kind === 'mine') return 'my words'
  if (s.kind === 'unit') return `Unit ${s.unit}`
  const find = (id: string) => {
    const l = lessons.find((x) => x.id === id)
    if (!l) throw new Error(`No lesson "${id}" for the word review`)
    return l
  }
  if (s.kind === 'lessons') {
    const names = s.lessonIds.map((id) => {
      const l = find(id)
      return isThemeLesson(l) ? l.theme.title : `${l.unit}.${l.order}`
    })
    return `${names.length} lessons: ${names.join(', ')}`
  }
  const l = find(s.lessonId)
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
