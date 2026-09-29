// Lesson helpers shared by the app, check-content and the tests.
import type { Item, Lesson, LessonBlock, Result, Test } from './schema.ts'

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

/** Lessons in course order: unit, then order within the unit. */
export function byCourseOrder(a: Lesson, b: Lesson): number {
  return a.unit - b.unit || a.order - b.order
}

/** The items a saved result was made from (a test, or an exercise in a lesson), if they still exist. */
export function itemsForResult(result: Result, tests: Test[], lessons: Lesson[]): Item[] | undefined {
  if (result.lessonId !== undefined) {
    const block = lessons.find((l) => l.id === result.lessonId)?.sections[result.section ?? -1]
    return block?.type === 'exercise' ? block.items : undefined
  }
  return tests.find((t) => t.id === result.testId)?.items
}
