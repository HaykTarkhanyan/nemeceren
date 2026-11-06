// Lesson helpers shared by the app, check-content and the tests.
import type { CourseLesson, Item, Lesson, LessonBlock, Result, Test, ThemeKind, ThemeLesson } from './schema.ts'

export type ExerciseSection = { section: number; number: number; block: Extract<LessonBlock, { type: 'exercise' }> }

/** The exercise blocks of a lesson, numbered 1, 2, ... in order. */
export function exerciseSections(lesson: Lesson): ExerciseSection[] {
  const out: ExerciseSection[] = []
  lesson.sections.forEach((block, section) => {
    if (block.type === 'exercise') out.push({ section, number: out.length + 1, block })
  })
  return out
}

/** The testId under which a lesson exercise's results are saved, e.g. "u1-01-hallo-ex2". */
export function exerciseTestId(lessonId: string, number: number): string {
  return `${lessonId}-ex${number}`
}

/** Index of the section with this `id`, or -1. */
export function sectionIndex(lesson: Lesson, id: string): number {
  return lesson.sections.findIndex((b) => b.id === id)
}

/**
 * The section a lesson page scrolls to when it opens: the one a link asked for (e.g. from the
 * Topics page), else where Hayk left off last time, else none (the top of the page).
 */
export function openAt(linked: number | null, lastSection: number): number | null {
  if (linked !== null) return linked
  return lastSection > 0 ? lastSection : null
}

/** Lessons in course order: unit, then order within the unit. */
export function byCourseOrder(a: CourseLesson, b: CourseLesson): number {
  return a.unit - b.unit || a.order - b.order
}

export function isThemeLesson(l: Lesson): l is ThemeLesson {
  return l.theme !== undefined
}

export function isCourseLesson(l: Lesson): l is CourseLesson {
  return l.theme === undefined && l.unit !== undefined && l.order !== undefined
}

export const THEME_KIND_LABEL: Record<ThemeKind, string> = { song: 'Song', video: 'Video', article: 'Article', topic: 'Topic' }

/** The external link's text: "Listen" for a song, "Watch", "Read"; a topic has no source. */
export const THEME_LINK_LABEL: Record<Exclude<ThemeKind, 'topic'>, string> = { song: 'Listen', video: 'Watch', article: 'Read' }

/** Where a word or a result comes from: "Lesson 1.3" or "Theme: <title>". */
export function lessonLabel(l: Lesson): string {
  if (isThemeLesson(l)) return `Theme: ${l.theme.title}`
  if (!isCourseLesson(l)) throw new Error(`Lesson "${l.id}" has neither a theme nor a unit and order`)
  return `Lesson ${l.unit}.${l.order}`
}

// ---------- Mistakes replay (DECISIONS.md #81) ----------

/**
 * A redo in Mistakes replay is saved as an ordinary one-item attempt whose testId is this prefix,
 * the id of the test or lesson exercise the item comes from, and "-i" plus the item's index:
 * "m-u1-t1-vorstellen-sprachen-i7". No test or lesson id may start with it (check-content).
 */
export const MISTAKE_PREFIX = 'm-'

export function redoTestId(sourceId: string, index: number): string {
  return `${MISTAKE_PREFIX}${sourceId}-i${index}`
}

/** The source id and item index of a redo attempt's testId; null for any other testId. */
export function parseRedoTestId(testId: string): { sourceId: string; index: number } | null {
  const m = /^m-(.+)-i(\d+)$/.exec(testId)
  return m ? { sourceId: m[1], index: Number(m[2]) } : null
}

/** Where a mistake comes from: a test or a lesson exercise, its items, and the lesson to reread. */
export interface MistakeSource {
  id: string
  title: string
  level: Test['level']
  items: Item[]
  /** The lesson to reread: the exercise's own lesson, or the lesson a test comes after; null if none. */
  reread: Lesson | null
  kind: 'test' | 'exercise'
}

export function findSource(sourceId: string, tests: Test[], lessons: Lesson[]): MistakeSource | null {
  const test = tests.find((t) => t.id === sourceId)
  if (test) {
    const reread = test.lesson ? (lessons.find((l) => l.id === test.lesson) ?? null) : null
    return { id: test.id, title: test.title, level: test.level, items: test.items, reread, kind: 'test' }
  }
  for (const lesson of lessons) {
    for (const ex of exerciseSections(lesson)) {
      if (exerciseTestId(lesson.id, ex.number) !== sourceId) continue
      const where = isThemeLesson(lesson) ? lesson.theme.title : `${lesson.unit}.${lesson.order} ${lesson.title}`
      return { id: sourceId, title: `${where}: ${ex.block.title ?? `exercise ${ex.number}`}`, level: lesson.level, items: ex.block.items, reread: lesson, kind: 'exercise' }
    }
  }
  return null
}

/** The items a saved result was made from (a test, or an exercise in a lesson), if they still exist. */
export function itemsForResult(result: Result, tests: Test[], lessons: Lesson[]): Item[] | undefined {
  const redo = parseRedoTestId(result.testId)
  if (redo) {
    const item = findSource(redo.sourceId, tests, lessons)?.items[redo.index]
    return item ? [item] : undefined
  }
  if (result.lessonId !== undefined) {
    const block = lessons.find((l) => l.id === result.lessonId)?.sections[result.section ?? -1]
    return block?.type === 'exercise' ? block.items : undefined
  }
  return tests.find((t) => t.id === result.testId)?.items
}
