import { describe, expect, it } from 'vitest'
import type { CourseLesson, LessonBlock, ThemeLesson } from '../content/schema.ts'
import { finishStation, markLessonDoneWithEvents, undoStation } from './stationActions.ts'
import { missingRanges } from './path.ts'
import { createProgressStore } from './storage.ts'

const now = new Date('2026-11-07T10:00:00.000Z')
const sections = (n: number): LessonBlock[] => Array.from({ length: n }, () => ({ type: 'tip', text: 'x' }) as LessonBlock)
// 10 sections: stations [0,5) and [5,10).
const course: CourseLesson = { id: 'u1-01-x', unit: 1, order: 1, level: 'A1', title: 'X (Y)', summary: 's', goals: ['g'], sections: sections(10) }
const theme: ThemeLesson = { id: 'th-song', theme: { kind: 'topic', title: 'Song' }, level: 'A1', title: 'Song', summary: 's', goals: ['g'], sections: sections(14) }

function guest() {
  let ids = 0
  const errors: string[] = []
  const store = createProgressStore({
    fetch: async () => {
      throw new Error('a guest makes no requests')
    },
    getToken: async () => 'token',
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    now: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    reportError: (m) => void errors.push(m),
    onSignedOut: () => undefined,
  })
  store.startGuest()
  return { store, errors }
}
const ranges = (store: ReturnType<typeof guest>['store']) => store.getView().pathEvents.map((e) => [e.lessonId, e.sectionFrom, e.sectionTo])

describe('station actions', () => {
  it('missingRanges after one station', () => {
    const { store } = guest()
    finishStation(store, course, 0, now)
    expect(missingRanges(course, store.getView().pathEvents)).toEqual([[5, 10]])
    expect(store.getView().lessonProgress.lessons[course.id]?.doneAt ?? null).toBeNull()
  })

  it('finishStation on the last missing range marks the lesson done', () => {
    const { store } = guest()
    finishStation(store, course, 1, now)
    finishStation(store, course, 0, now)
    expect(store.getView().lessonProgress.lessons[course.id].doneAt).toBe(now.toISOString())
  })

  it('finishStation refuses a station the lesson does not have', () => {
    const { store } = guest()
    expect(() => finishStation(store, course, 2, now)).toThrow(/has no station 3/)
  })

  it('markLessonDoneWithEvents records only the missing ranges; a theme lesson is one full range', () => {
    const { store } = guest()
    finishStation(store, course, 0, now)
    markLessonDoneWithEvents(store, course, now)
    expect(ranges(store)).toEqual([
      ['u1-01-x', 0, 5],
      ['u1-01-x', 5, 10],
    ])
    expect(store.getView().lessonProgress.lessons[course.id].doneAt).toBe(now.toISOString())
    markLessonDoneWithEvents(store, theme, now)
    expect(ranges(store).at(-1)).toEqual(['th-song', 0, 14])
    // Marking it done again records nothing new.
    markLessonDoneWithEvents(store, theme, now)
    expect(ranges(store)).toHaveLength(3)
  })

  it('undoStation deletes every event overlapping the range and clears doneAt', () => {
    const { store } = guest()
    finishStation(store, course, 0, now)
    finishStation(store, course, 0, now) // done twice, e.g. on the phone and the PC
    finishStation(store, course, 1, now)
    undoStation(store, course, [0, 5], now)
    expect(ranges(store)).toEqual([['u1-01-x', 5, 10]])
    expect(store.getView().lessonProgress.lessons[course.id].doneAt).toBeNull()
  })
})
