// What finishing, marking and undoing a station writes (DECISIONS.md #82): path events for the
// section ranges, and the lesson's doneAt kept in step with them. The store is a parameter, so
// tests run these on a guest store; the pages pass progressStore().
import { isThemeLesson } from '../content/lessons.ts'
import type { Lesson } from '../content/schema.ts'
import { doneRangesByLesson, isCovered, missingRanges, stationRanges } from './path.ts'
import { markLessonDone, startLesson } from './plan.ts'
import type { ProgressStore } from './storage.ts'

function markDone(store: ProgressStore, lesson: Lesson, now: Date): void {
  const p = startLesson(store.getView().lessonProgress, lesson.id, now)
  store.saveLessonProgress(markLessonDone(p, lesson.id, true, now))
}

/** Station k of the lesson is finished; when no station of the lesson is left, the lesson is done too. */
export function finishStation(store: ProgressStore, lesson: Lesson, k: number, now: Date): void {
  const range = stationRanges(lesson)[k]
  if (range === undefined) throw new Error(`Lesson "${lesson.id}" has no station ${k + 1}`)
  store.recordStationDone(lesson.id, range[0], range[1])
  // A redo of a done lesson keeps the day it was done.
  const view = store.getView()
  if (missingRanges(lesson, view.pathEvents).length === 0 && !view.lessonProgress.lessons[lesson.id]?.doneAt) markDone(store, lesson, now)
}

/**
 * "Mark lesson as done": records every station not finished yet (so it counts for the daily goal),
 * then marks the lesson done. A theme lesson is not on the path, so it is one range: all its sections.
 */
export function markLessonDoneWithEvents(store: ProgressStore, lesson: Lesson, now: Date): void {
  const events = store.getView().pathEvents
  const all: [number, number] = [0, lesson.sections.length]
  const ranges = isThemeLesson(lesson)
    ? isCovered(all, doneRangesByLesson(events).get(lesson.id) ?? [])
      ? []
      : [all]
    : missingRanges(lesson, events)
  for (const [from, to] of ranges) store.recordStationDone(lesson.id, from, to)
  markDone(store, lesson, now)
}

/** "Mark as not done" on the Lessons page: undoes every station event of the lesson, and its doneAt. */
export function markLessonNotDone(store: ProgressStore, lesson: Lesson, now: Date): void {
  undoStation(store, lesson, [0, lesson.sections.length], now)
}

/** "Mark as not done" on a station: undoes every event of the lesson that overlaps the range, and the lesson's doneAt. */
export function undoStation(store: ProgressStore, lesson: Lesson, range: [number, number], now: Date): void {
  for (const e of store.getView().pathEvents) {
    if (e.kind !== 'station' || e.lessonId !== lesson.id) continue
    if (e.sectionFrom! < range[1] && range[0] < e.sectionTo!) store.deletePathEvent(e.id)
  }
  const p = store.getView().lessonProgress
  if (p.lessons[lesson.id]?.doneAt) store.saveLessonProgress(markLessonDone(p, lesson.id, false, now))
}
