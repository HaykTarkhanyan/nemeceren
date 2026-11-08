// The Words map (#/words/map; design: _knowledge/2026-11-07_practice-games-design.md, part 6), as
// pure functions: one tile per lesson, grouped by unit (theme lessons last), with how many of its
// words are known and how strong they are on average (allWords.ts strengthOf, 0-4). Several tiles
// can be practised together: their lesson ids go into the game link, joined by commas.
import { byCourseOrder } from '../content/lessons.ts'
import type { CourseLesson, Lesson, LessonProgress, ThemeLesson } from '../content/schema.ts'
import { strengthOf } from './allWords.ts'
import type { WordStatus } from './allWords.ts'
import { MIN_PAIRS, MIN_PICK_WORDS } from './daily.ts'
import { lessonStatus } from './plan.ts'

export interface LessonTile {
  lesson: Lesson
  /** The lesson's words (each once). */
  total: number
  /** Words with the status "known" (next review 21+ days away). */
  known: number
  /** The average strength of the words, 0-4, divided by 4: 0 nothing started, 1 all known. */
  strength: number
  /** Not reached yet (a course lesson further along the path, an unopened theme) and none of its words learned. */
  locked: boolean
}

export interface TileGroup {
  /** The unit, or null for the theme lessons. */
  unit: number | null
  tiles: LessonTile[]
}

export function lessonTiles(input: {
  rows: { id: string; status: WordStatus }[]
  lessons: CourseLesson[]
  themes: ThemeLesson[]
  /** Course lessons the path reaches (lib/plan.ts reachableLessons). */
  reachable: ReadonlySet<string>
  progress: LessonProgress
}): TileGroup[] {
  const status = new Map(input.rows.map((r) => [r.id, r.status]))
  const tile = (lesson: Lesson, reached: boolean): LessonTile => {
    const ids = [...new Set(lesson.words ?? [])]
    const statuses = ids.map((id) => {
      const s = status.get(id)
      if (s === undefined) throw new Error(`Lesson "${lesson.id}" lists the word "${id}", which has no row`)
      return s
    })
    const started = statuses.some((s) => s !== 'locked' && s !== 'not-started')
    return {
      lesson,
      total: ids.length,
      known: statuses.filter((s) => s === 'known').length,
      strength: ids.length === 0 ? 0 : statuses.reduce((sum, s) => sum + strengthOf(s), 0) / (4 * ids.length),
      locked: !reached && !started,
    }
  }
  const course = input.lessons.filter((l) => (l.words ?? []).length > 0).sort(byCourseOrder)
  const groups: TileGroup[] = [...new Set(course.map((l) => l.unit))].map((unit) => ({
    unit,
    tiles: course.filter((l) => l.unit === unit).map((l) => tile(l, input.reachable.has(l.id))),
  }))
  const themes = input.themes.filter((l) => (l.words ?? []).length > 0)
  if (themes.length > 0) groups.push({ unit: null, tiles: themes.map((l) => tile(l, lessonStatus(input.progress, l.id) !== 'not-started')) })
  return groups
}

/** How much of the unit colour a tile shows, in percent: faint (8) with nothing known, nearly full (88) with all known. */
export function tileShade(strength: number): number {
  return Math.round(8 + 80 * Math.min(1, Math.max(0, strength)))
}

/** The count on a tile: "known/total", or for a locked tile its number of words ("12 words, locked"). */
export function tileCount(t: Pick<LessonTile, 'known' | 'total' | 'locked'>): string {
  return t.locked ? `${t.total} word${t.total === 1 ? '' : 's'}, locked` : `${t.known}/${t.total}`
}

// ---------- several tiles together ----------

/** The last part of a game link on map tiles (#/daily/<game>/<lessons>): the lesson ids joined by commas. Ids are slugs, so they hold no comma. */
export function lessonsPart(lessonIds: readonly string[]): string {
  if (lessonIds.length === 0) throw new Error('A game on map tiles needs at least one lesson')
  return lessonIds.join(',')
}

/** The lessons a game link names ("u1-01-a" or "u1-01-a,u1-02-b"), in that order; an empty part, a repeat or an unknown id is a problem to show. */
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

/** The words of several lessons, each once, in lesson order: what a game on several tiles plays with. */
export function unionWordIds(lessons: readonly { words?: string[] }[]): string[] {
  return [...new Set(lessons.flatMap((l) => l.words ?? []))]
}

/** How many of these words are learned (reviewed at least once), the only words a game takes. */
export function learnedCount(ids: readonly string[], rows: { id: string; status: WordStatus }[]): number {
  const status = new Map(rows.map((r) => [r.id, r.status]))
  return ids.filter((id) => {
    const s = status.get(id)
    if (s === undefined) throw new Error(`The word "${id}" has no row`)
    return s !== 'locked' && s !== 'not-started' && s !== 'new'
  }).length
}

/** The fewest learned words a game can start with: match pairs and listen and pick need a few (lib/daily.ts); the others say themselves when they need more of a kind, such as nouns. */
export function minLearned(game: string): number {
  return game === 'match' ? MIN_PAIRS : game === 'listen' ? MIN_PICK_WORDS : 1
}
