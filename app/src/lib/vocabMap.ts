// The Words map (#/words/map; design: _knowledge/2026-11-07_practice-games-design.md, part 6), as
// pure functions: one tile per lesson, grouped by unit (theme lessons last), with how many of its
// words are known and how strong they are on average (allWords.ts strengthOf, 0-4).
import { byCourseOrder } from '../content/lessons.ts'
import type { CourseLesson, Lesson, LessonProgress, ThemeLesson } from '../content/schema.ts'
import { strengthOf } from './allWords.ts'
import type { WordStatus } from './allWords.ts'
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
