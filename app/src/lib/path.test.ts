import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { byCourseOrder } from '../content/lessons.ts'
import type { CourseLesson, LessonBlock, Result, ResultItem, Test } from '../content/schema.ts'
import { checkAllContent } from '../content/validate.ts'
import { emptyLessonProgress, markLessonDone, reachableLessons, startLesson } from './plan.ts'
import {
  courseStations,
  englishName,
  germanName,
  isCovered,
  isStoryLesson,
  levelProgress,
  pathProgress,
  pathReach,
  stationRanges,
  unitColor,
  unitTextColor,
  unitTitle,
  type PathEventLike,
} from './path.ts'

const t0 = new Date(2026, 10, 7, 10, 0, 0)

// The real course, read from disk (content/load.ts needs Vite, which tests do not type-check against).
const root = new URL('../../../', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, root), 'utf-8')
const dir = (d: string) =>
  readdirSync(new URL(d, root))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: `${d}${f}`, text: read(`${d}${f}`) }))
const checked = checkAllContent({
  tests: dir('content/tests/'),
  words: { file: 'content/words.json', text: read('content/words.json') },
  lessons: dir('content/lessons/'),
  themes: dir('content/themes/'),
  topics: { file: 'content/topics.json', text: read('content/topics.json') },
  extras: { file: 'content/extras.json', text: read('content/extras.json') },
  sets: { file: 'content/sets.json', text: read('content/sets.json') },
})
if (checked.problems.length) throw new Error(checked.problems.join('\n'))
const content = { lessons: [...checked.lessons].sort(byCourseOrder), tests: checked.tests }
const sections = (n: number): LessonBlock[] => Array.from({ length: n }, () => ({ type: 'tip', text: 'x' }) as LessonBlock)
const lesson = (id: string, unit: number, order: number, n: number, extra: Partial<CourseLesson> = {}): CourseLesson => ({
  id,
  unit,
  order,
  level: 'A1',
  title: `English ${id} (Deutsch ${id})`,
  summary: 's',
  goals: ['g'],
  sections: sections(n),
  ...extra,
})
const test = (id: string, lessonId: string, extra: Partial<Test> = {}): Test => ({
  id,
  title: id,
  level: 'A1',
  created: '2026-11-07',
  lesson: lessonId,
  items: [{ type: 'dictation', text: 'Hallo' }],
  ...extra,
})
const item = (index: number, status: ResultItem['status']): ResultItem => ({
  index,
  type: 'dictation',
  question: 'q',
  answer: 'a',
  expected: 'a',
  status,
  nearMiss: null,
  timeMs: 1000,
  hintUsed: false,
})
/** An attempt with the given item statuses ("c" correct, "w" wrong, "p" pending). */
const result = (testId: string, statuses: string, extra: Partial<Result> = {}): Result => {
  const items = [...statuses].map((s, i) => item(i, s === 'c' ? 'correct' : s === 'w' ? 'wrong' : 'pending'))
  const count = (s: string) => [...statuses].filter((x) => x === s).length
  return {
    version: 1,
    testId,
    testTitle: testId,
    level: 'A1',
    mode: 'repo',
    startedAt: '2026-11-07T08:00:00Z',
    submittedAt: '2026-11-07T08:05:00Z',
    score: { correct: count('c'), wrong: count('w'), pending: count('p'), total: items.length },
    items,
    ...extra,
  }
}
const done = (lessonId: string, from: number, to: number, extra: Partial<PathEventLike> = {}): PathEventLike => ({
  kind: 'station',
  lessonId,
  sectionFrom: from,
  sectionTo: to,
  localDay: '2026-11-07',
  ...extra,
})
const noProgress = { events: [] as PathEventLike[], lessonProgress: emptyLessonProgress(), results: [] as Result[] }

describe('stations from the course', () => {
  it('stationRanges splits by the 5.5 rule', () => {
    expect(stationRanges(lesson('a', 1, 1, 6))).toEqual([[0, 6]])
    expect(stationRanges(lesson('a', 1, 1, 8))).toEqual([[0, 8]])
    expect(stationRanges(lesson('a', 1, 1, 10))).toEqual([[0, 5], [5, 10]])
    expect(stationRanges(lesson('a', 1, 1, 15))).toEqual([[0, 5], [5, 10], [10, 15]])
    expect(stationRanges(lesson('a', 1, 1, 30))).toEqual([[0, 10], [10, 20], [20, 30]])
  })

  it('stationRanges uses the override', () => {
    expect(stationRanges(lesson('a', 1, 1, 10, { stations: [3, 7] }))).toEqual([[0, 3], [3, 7], [7, 10]])
    expect(stationRanges(lesson('a', 1, 1, 10, { stations: [4] }))).toEqual([[0, 4], [4, 10]])
  })

  it('courseStations orders steps, then the lesson tests, then the Endstation', () => {
    const st = courseStations(content.lessons, content.tests)
    // A1 (Units 0-7) has 108 stations; A2 units add more lines after it.
    expect(st.filter((s) => s.kind !== 'end' && s.unit <= 7)).toHaveLength(108)
    const units = [...new Set(content.lessons.map((l) => l.unit))].sort((a, b) => a - b)
    expect(st.filter((s) => s.kind === 'end').map((s) => s.unit)).toEqual(units)
    expect(units.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(st.slice(0, 3).map((s) => s.id)).toEqual(['u0-01-laute#0', 'u0-01-laute#1', 'u0-02-begruessen#0'])
    const t1 = st.findIndex((s) => s.id === 'u0-t1-laute-gruesse')
    expect(st[t1 - 1].lessonId).toBe('u0-02-begruessen')
    expect(st.at(-1)?.id).toBe(`end-${units.at(-1)}`)
  })

  it('story lessons become story stations', () => {
    const story = content.lessons.find((l) => l.id === 'u1-07-geschichte-im-kurs')!
    expect(isStoryLesson(story)).toBe(true)
    expect(isStoryLesson(content.lessons[0])).toBe(false)
    const st = courseStations(content.lessons, content.tests).filter((s) => s.lessonId === story.id)
    expect(st.length).toBeGreaterThan(0)
    expect(st.every((s) => s.kind === 'story')).toBe(true)
  })

  it('germanName and englishName split a title', () => {
    expect(germanName('Introducing yourself (Sich vorstellen)')).toBe('Sich vorstellen')
    expect(englishName('Introducing yourself (Sich vorstellen)')).toBe('Introducing yourself')
    expect(germanName('Just a title')).toBe('Just a title')
    expect(englishName('Just a title')).toBe('Just a title')
  })

  it('the orange line gets dark text, the others white', () => {
    expect(unitTextColor(3)).toBe('#1b1f24')
    expect([0, 1, 2, 4, 5, 6, 7].map(unitTextColor)).toEqual(Array(7).fill('#fff'))
    expect(unitTextColor(11)).toBe(unitTextColor(3))
  })

  it('A2 units have their syllabus titles', () => {
    expect(unitTitle(8)).toBe('Telling what happened')
    expect(unitTitle(17)).toBe('Flat and neighbours')
    expect(unitTitle(18)).toBe('Unit 18')
  })

  it('unit colours cycle after Unit 7', () => {
    expect(unitColor(0)).toBe('#5f7286')
    expect(unitColor(7)).toBe('#7a4bb3')
    expect(unitColor(8)).toBe(unitColor(0))
  })
})

describe('which stations are done', () => {
  const a = lesson('a', 0, 1, 10)
  const b = lesson('b', 0, 2, 6)
  const course = [a, b]
  const tests = [test('t1', 'a')]
  const st = courseStations(course, tests)

  it('a station is done when events cover its range', () => {
    expect(isCovered([0, 5], [[0, 2], [2, 5]])).toBe(true)
    expect(isCovered([0, 5], [[0, 2]])).toBe(false)
    const p = pathProgress(st, { ...noProgress, events: [done('a', 0, 2), done('a', 2, 5)] })
    expect(p.done.has('a#0')).toBe(true)
    expect(p.done.has('a#1')).toBe(false)
    expect(pathProgress(st, { ...noProgress, events: [done('a', 0, 2)] }).done.has('a#0')).toBe(false)
  })

  it('duplicate events cover once', () => {
    const p = pathProgress(st, { ...noProgress, events: [done('a', 0, 5), done('a', 0, 5)] })
    expect(p.units.get(0)).toEqual({ done: 1, total: 4 })
  })

  it('deleted events and daily-mix events do not count', () => {
    const p = pathProgress(st, {
      ...noProgress,
      events: [done('a', 0, 5, { deletedAt: '2026-11-07T09:00:00Z' }), { kind: 'daily-mix', localDay: '2026-11-07' }],
    })
    expect(p.done.size).toBe(0)
  })

  it('doneAt marks every station done without events', () => {
    const lp = markLessonDone(startLesson(emptyLessonProgress(), 'a', t0), 'a', true, t0)
    const p = pathProgress(st, { ...noProgress, lessonProgress: lp })
    expect(p.done.has('a#0') && p.done.has('a#1')).toBe(true)
    expect(p.done.has('b#0')).toBe(false)
    // Done only through doneAt (a lesson finished before the path): the sheet offers no undo for it.
    expect(p.fromEvents.size).toBe(0)
    const both = pathProgress(st, { ...noProgress, lessonProgress: lp, events: [done('a', 0, 5)] })
    expect([...both.fromEvents]).toEqual(['a#0'])
  })

  it('a resplit lesson keeps its done ranges', () => {
    const resplit = courseStations([lesson('a', 0, 1, 10, { stations: [3, 7] }), b], tests)
    const p = pathProgress(resplit, { ...noProgress, events: [done('a', 0, 5), done('a', 5, 10)] })
    expect(['a#0', 'a#1', 'a#2'].every((id) => p.done.has(id))).toBe(true)
  })

  it('test stations follow testStatus', () => {
    const tried = pathProgress(st, { ...noProgress, results: [result('t1', 'cccccwwwww')] })
    expect(tried.done.has('t1')).toBe(false)
    expect(tried.best.get('t1')).toBe(50)
    const passed = pathProgress(st, { ...noProgress, results: [result('t1', 'ccccccccww')] })
    expect(passed.done.has('t1')).toBe(true)
    // A lesson exercise saved under the same test id is not a test attempt.
    const exercise = pathProgress(st, { ...noProgress, results: [result('t1', 'cccccccccc', { lessonId: 'a', section: 2 })] })
    expect(exercise.done.has('t1')).toBe(false)
  })

  it('test station follows testStatus after a review changes the score', () => {
    const r = result('t1', 'cccccccpww')
    expect(pathProgress(st, { ...noProgress, results: [r] }).done.has('t1')).toBe(false)
    const reviewed: Result = { ...r, review: { gradedAt: '2026-11-07T10:00:00Z', summary: 'ok', items: [{ index: 7, correct: true }] } }
    expect(pathProgress(st, { ...noProgress, results: [reviewed] }).done.has('t1')).toBe(true)
  })

  it('current is the first not-done counted station', () => {
    const real = courseStations(content.lessons, content.tests)
    let lp = emptyLessonProgress()
    for (const id of ['u0-01-laute', 'u0-02-begruessen', 'u0-03-ueberleben', 'u0-04-alphabet']) lp = markLessonDone(startLesson(lp, id, t0), id, true, t0)
    const zahlen = stationRanges(content.lessons.find((l) => l.id === 'u0-05-zahlen')!)[0]
    const p = pathProgress(real, {
      events: [done('u0-05-zahlen', zahlen[0], zahlen[1])],
      lessonProgress: lp,
      results: [result('u0-t1-laute-gruesse', 'ccccccccc'), result('u0-t2-ueberleben-alphabet', 'cccccwww')],
    })
    expect(p.current?.id).toBe('u0-t2-ueberleben-alphabet')
    expect(p.done.has('u0-05-zahlen#0')).toBe(true)
    expect(pathProgress(real, noProgress).current?.id).toBe('u0-01-laute#0')
  })

  it('the Endstation is done when its unit is complete and is not counted', () => {
    const lp = markLessonDone(markLessonDone(startLesson(startLesson(emptyLessonProgress(), 'a', t0), 'b', t0), 'a', true, t0), 'b', true, t0)
    const notYet = pathProgress(st, { ...noProgress, lessonProgress: lp })
    expect(notYet.done.has('end-0')).toBe(false)
    const all = pathProgress(st, { ...noProgress, lessonProgress: lp, results: [result('t1', 'cccccccccc')] })
    expect(all.done.has('end-0')).toBe(true)
    expect(all.units.get(0)).toEqual({ done: 4, total: 4 })
    expect(all.current).toBeNull()
  })

  it('levelProgress counts the lowest level with work left', () => {
    const real = courseStations(content.lessons, content.tests)
    expect(levelProgress(real, new Set(), content.lessons, content.tests)).toEqual({ level: 'A1', done: 0, total: 108 })
    expect(levelProgress([], new Set(), [], [])).toBeNull()
  })
})

describe('where the path is, for the new words (pathReach)', () => {
  const a = lesson('a', 0, 1, 10)
  const b = lesson('b', 0, 2, 6)
  const c = lesson('c', 1, 1, 6)
  const st = courseStations([a, b, c], [test('t1', 'a')])

  it('is the lesson of "Du bist hier", nothing done yet', () => {
    const r = pathReach(st, pathProgress(st, noProgress))
    expect(r.at).toBe('a')
    expect([...r.started]).toEqual([])
  })

  it('a test station belongs to the lesson it follows', () => {
    const lp = markLessonDone(startLesson(emptyLessonProgress(), 'a', t0), 'a', true, t0)
    const p = pathProgress(st, { ...noProgress, lessonProgress: lp })
    expect(p.current?.id).toBe('t1')
    expect(pathReach(st, p).at).toBe('a')
  })

  it('lists lessons with at least one done station (done ahead of "Du bist hier")', () => {
    const p = pathProgress(st, { ...noProgress, events: [done('c', 0, 6)] })
    const r = pathReach(st, p)
    expect(r.at).toBe('a')
    expect([...r.started]).toEqual(['c'])
  })

  it('on the real course: 6 lessons done, no test taken -> the 7th lesson is reached for new words', () => {
    const real = courseStations(content.lessons, content.tests)
    const first6 = content.lessons.slice(0, 6).map((l) => l.id)
    let lp = emptyLessonProgress()
    for (const id of first6) lp = markLessonDone(startLesson(lp, id, t0), id, true, t0)
    const reach = pathReach(real, pathProgress(real, { ...noProgress, lessonProgress: lp }))
    // "Du bist hier" is the first test (not taken), so the path is at the lesson before it.
    expect(reach.at).not.toBe(first6[5])
    expect(reachableLessons(content.lessons, reach).has(content.lessons[6].id)).toBe(true)
  })

  it('is null when every station is done', () => {
    let lp = emptyLessonProgress()
    for (const id of ['a', 'b', 'c']) lp = markLessonDone(startLesson(lp, id, t0), id, true, t0)
    const p = pathProgress(st, { ...noProgress, lessonProgress: lp, results: [result('t1', 'cccccccccc')] })
    expect(pathReach(st, p).at).toBeNull()
  })
})
