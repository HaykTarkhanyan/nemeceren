import { describe, expect, it } from 'vitest'
import type { Lesson, Result, ReviewLogEntry, Test, Word } from '../content/schema.ts'
import {
  contentRunway,
  courseTests,
  emptyLessonProgress,
  lessonStatus,
  listeningWords,
  lockedWordIds,
  markLessonDone,
  nextLesson,
  nextTest,
  parseSourceKey,
  runwayText,
  setLastSection,
  sourceKey,
  sourceLabel,
  sourceLessons,
  startLesson,
  studyWords,
  weakWords,
  wordsForSource,
} from './plan.ts'
import type { WordSource } from './plan.ts'
import { addExtraNew, counts, emptyState, extraToday, Rating, review } from './srs.ts'
import { dailyStats, studyDays } from './stats.ts'

const t0 = new Date(2026, 8, 29, 10, 0, 0)
const word = (id: string, example = false): Word => ({ id, de: id, en: id, level: 'A1', added: '2026-09-29', ...(example ? { example: { de: `${id} Satz.` } } : {}) })
const lesson = (id: string, unit: number, order: number, words: string[] = []): Lesson => ({
  id,
  unit,
  order,
  level: 'A1',
  title: id,
  summary: 's',
  goals: ['g'],
  words,
  sections: [{ type: 'tip', text: 'x' }],
})
const test = (id: string, extra: Partial<Test> = {}): Test => ({ id, title: id, level: 'A1', created: '2026-09-29', items: [{ type: 'dictation', text: 'Hallo' }], ...extra })
const result = (testId: string, extra: Partial<Result> = {}): Result => ({
  version: 1,
  testId,
  testTitle: testId,
  level: 'A1',
  mode: 'repo',
  startedAt: '2026-09-29T08:00:00Z',
  submittedAt: '2026-09-29T08:05:00Z',
  score: { correct: 0, wrong: 0, pending: 0, total: 0 },
  items: [],
  ...extra,
})

describe('lesson progress', () => {
  it('goes from not started to in progress to done, and back', () => {
    let p = emptyLessonProgress()
    expect(lessonStatus(p, 'a')).toBe('not-started')
    p = startLesson(p, 'a', t0)
    expect(lessonStatus(p, 'a')).toBe('in-progress')
    expect(startLesson(p, 'a', t0)).toBe(p)
    p = setLastSection(p, 'a', 3, t0)
    expect(p.lessons.a.lastSection).toBe(3)
    p = markLessonDone(p, 'a', true, t0)
    expect(lessonStatus(p, 'a')).toBe('done')
    p = markLessonDone(p, 'a', false, t0)
    expect(lessonStatus(p, 'a')).toBe('in-progress')
  })

  it('refuses to mark or move in a lesson that was never started', () => {
    expect(() => markLessonDone(emptyLessonProgress(), 'x', true, t0)).toThrow(/not started/)
    expect(() => setLastSection(emptyLessonProgress(), 'x', 1, t0)).toThrow(/not started/)
  })

  it('finds the next lesson in unit order, skipping done ones', () => {
    const lessons = [lesson('b', 1, 1), lesson('c', 1, 2), lesson('a', 0, 1)]
    let p = emptyLessonProgress()
    expect(nextLesson(lessons, p)).toMatchObject({ lesson: { id: 'a' }, status: 'not-started' })
    p = markLessonDone(startLesson(p, 'a', t0), 'a', true, t0)
    p = startLesson(p, 'b', t0)
    expect(nextLesson(lessons, p)).toMatchObject({ lesson: { id: 'b' }, status: 'in-progress' })
    p = markLessonDone(markLessonDone(startLesson(p, 'c', t0), 'c', true, t0), 'b', true, t0)
    expect(nextLesson(lessons, p)).toBeNull()
  })
})

describe('words unlock with their lesson', () => {
  const words = ['free1', 'l1', 'l2', 'free2'].map((id) => word(id))
  const lessons = [lesson('L', 1, 1, ['l1', 'l2'])]

  it('keeps a lesson word out of the new words until the lesson is opened', () => {
    const s = emptyState(t0)
    expect([...lockedWordIds(lessons, emptyLessonProgress())].sort()).toEqual(['l1', 'l2'])
    expect(studyWords(words, lessons, emptyLessonProgress(), s).map((w) => w.id)).toEqual(['free1', 'free2'])
    const started = startLesson(emptyLessonProgress(), 'L', t0)
    expect(studyWords(words, lessons, started, s).map((w) => w.id)).toEqual(['free1', 'l1', 'l2', 'free2'])
  })

  it('keeps reviewing a word that was already introduced, whatever its lesson', () => {
    const s = review(emptyState(t0), 'l1', Rating.Good, t0).state
    expect(studyWords(words, lessons, emptyLessonProgress(), s).map((w) => w.id)).toEqual(['free1', 'l1', 'free2'])
  })
})

describe('extra new words today', () => {
  const words = ['a', 'b', 'c', 'd', 'e'].map((id) => word(id))

  it('raises only today\'s limit and survives grading', () => {
    let s = review(emptyState(t0), 'a', Rating.Good, t0).state
    expect(counts(words, s, t0, 1).newLeft).toBe(0)
    s = addExtraNew(s, 2, t0)
    expect(extraToday(s, t0)).toBe(2)
    expect(counts(words, s, t0, 1).newLeft).toBe(2)
    s = review(s, 'b', Rating.Good, t0).state
    expect(extraToday(s, t0)).toBe(2)
    expect(counts(words, s, t0, 1).newLeft).toBe(1)
    const tomorrow = new Date(2026, 8, 30, 9)
    expect(extraToday(s, tomorrow)).toBe(0)
    expect(counts(words, s, tomorrow, 1).newLeft).toBe(1)
  })

})

describe('next test', () => {
  const lessons = [lesson('L0', 0, 1), lesson('L1', 1, 2)]
  const tests = [
    test('loose', { created: '2026-09-01' }),
    test('u1-by-lesson', { lesson: 'L1' }),
    test('u0', { unit: 0 }),
    test('u1-no-lesson', { unit: 1 }),
  ]

  it('orders tests by unit, then lesson order, with unassigned tests last', () => {
    expect(courseTests(tests, lessons).map((t) => t.id)).toEqual(['u0', 'u1-by-lesson', 'u1-no-lesson', 'loose'])
  })

  it('picks the first untaken test; lesson exercise results do not count as tests', () => {
    expect(nextTest(tests, lessons, [])?.id).toBe('u0')
    expect(nextTest(tests, lessons, [result('u0')])?.id).toBe('u1-by-lesson')
    expect(nextTest(tests, lessons, [result('u1-by-lesson', { lessonId: 'L1', section: 0 })])?.id).toBe('u0')
    expect(nextTest(tests, lessons, tests.map((t) => result(t.id)))).toBeNull()
  })
})

describe('weak words', () => {
  const words = ['a', 'b', 'c', 'd'].map((id) => word(id))
  const entry = (wordId: string, ts: string, extra: Partial<ReviewLogEntry> = {}): ReviewLogEntry => ({
    ts,
    wordId,
    de: wordId,
    mode: 'production',
    rating: 3,
    answer: 'x',
    correct: true,
    nearMiss: null,
    isNew: false,
    stateBefore: 2,
    stateAfter: 2,
    due: ts,
    ...extra,
  })

  it('ranks recent Again grades, near misses and lapses; ignores practice and old grades', () => {
    let s = emptyState(t0)
    for (const id of ['a', 'b', 'c', 'd']) s = review(s, id, Rating.Good, t0).state
    s = { ...s, cards: { ...s.cards, d: { ...s.cards.d, lapses: 1 } } }
    const log = [
      entry('a', '2026-09-28T10:00:00Z', { rating: 1 }),
      entry('b', '2026-09-28T11:00:00Z', { nearMiss: ['umlaut'] }),
      entry('c', '2026-09-28T12:00:00Z', { rating: 1, practice: true }),
      entry('c', '2026-08-01T12:00:00Z', { rating: 1 }),
    ]
    const weak = weakWords(words, s, log, t0)
    expect(weak.map((w) => w.word.id)).toEqual(['a', 'b', 'd'])
    expect(weak[0].reasons).toEqual(['Again 1x recently'])
    expect(weak[2].reasons).toEqual(['forgotten 1x'])
  })
})

describe('listening words and runway', () => {
  it('uses introduced words with examples, most recently reviewed first', () => {
    const words = [word('a', true), word('b', true), word('c')]
    let s = review(emptyState(t0), 'a', Rating.Good, t0).state
    s = review(s, 'b', Rating.Good, new Date(t0.getTime() + 60_000)).state
    s = review(s, 'c', Rating.Good, t0).state
    expect(listeningWords(words, s).map((w) => w.id)).toEqual(['b', 'a'])
  })

  it('counts what is left to study and how long the new words last', () => {
    const words = ['a', 'b', 'c', 'l1', 'l2'].map((id) => word(id))
    const lessons = [lesson('L', 1, 1, ['l1', 'l2']), lesson('M', 1, 2)]
    const s = review(emptyState(t0), 'a', Rating.Good, t0).state
    const p = markLessonDone(startLesson(emptyLessonProgress(), 'M', t0), 'M', true, t0)
    const r = contentRunway({ words, tests: [test('t1'), test('t2')], lessons }, p, s, [result('t1')], 3)
    expect(r).toEqual({
      newWords: 4,
      newWordsAvailable: 2,
      newWordsInLessons: 2,
      days: 2,
      testsLeft: 1,
      lessonsLeft: 1,
      totals: { words: 5, tests: 2, lessons: 2 },
    })
    expect(runwayText(r, 3)).toBe(
      '4 of 5 words not introduced yet (about 2 days at 3 a day), 2 of them unlock when their lesson is opened; 1 of 2 tests not taken; 1 of 2 lessons not done',
    )
  })
})

describe('practice in the statistics', () => {
  it('counts practice as study time and a study day, but not as a scheduled review', () => {
    const days = dailyStats(
      [
        { at: Date.parse('2026-09-29T08:00:00Z'), localDay: '2026-09-29', timeMs: 5000, rating: 1, isNew: false, practice: true },
        { at: Date.parse('2026-09-29T08:01:00Z'), localDay: '2026-09-29', timeMs: 5000, rating: 3, isNew: false },
      ],
      [],
    )
    expect(days.get('2026-09-29')).toMatchObject({ reviews: 1, correct: 1, practice: 1, activeMs: 10000, sessions: 1 })
    const onlyPractice = dailyStats([{ at: 0, localDay: '2026-09-28', timeMs: 1000, rating: 3, isNew: false, practice: true }], [])
    expect([...studyDays(onlyPractice)]).toEqual(['2026-09-28'])
  })
})

describe('choosing where the review words come from', () => {
  const words = ['a', 'l1', 'l2', 'm1', 'n1', 'x'].map((id) => word(id))
  const lessons = [lesson('L', 1, 1, ['l1', 'l2']), lesson('M', 1, 2, ['m1']), lesson('N', 2, 1, ['n1']), lesson('E', 2, 2)]
  const opened = startLesson(emptyLessonProgress(), 'L', t0)
  const ids = (source: WordSource, s = emptyState(t0)) => wordsForSource(source, words, lessons, opened, s).map((w) => w.id)

  it('"all" is today\'s behaviour: words of unopened lessons wait', () => {
    expect(ids({ kind: 'all' })).toEqual(['a', 'l1', 'l2', 'x'])
  })

  it('a lesson takes only its words, opened or not (picking it is the choice to learn them)', () => {
    expect(ids({ kind: 'lesson', lessonId: 'L' })).toEqual(['l1', 'l2'])
    expect(ids({ kind: 'lesson', lessonId: 'M' })).toEqual(['m1'])
  })

  it('a unit takes the words of all its lessons, and never words in no lesson', () => {
    expect(ids({ kind: 'unit', unit: 1 })).toEqual(['l1', 'l2', 'm1'])
    expect(ids({ kind: 'unit', unit: 2 })).toEqual(['n1'])
  })

  it('filters due reviews, new words (within the daily limit) and weak words', () => {
    let s = review(emptyState(t0), 'a', Rating.Again, t0).state
    s = review(s, 'l1', Rating.Again, t0).state
    const later = new Date(t0.getTime() + 3_600_000)
    const picked = wordsForSource({ kind: 'lesson', lessonId: 'L' }, words, lessons, opened, s)
    // Due: l1 only (a is due too, but not in the pick). New: l2, capped by what is left of the daily limit of 3.
    expect(counts(picked, s, later, 3)).toEqual({ due: 1, newLeft: 1 })
    const log: ReviewLogEntry[] = ['a', 'l1'].map((id) => ({
      ts: t0.toISOString(), wordId: id, de: id, mode: 'recognition', rating: 1, answer: null, correct: null, nearMiss: null,
      isNew: true, stateBefore: 0, stateAfter: 1, due: t0.toISOString(),
    }))
    expect(weakWords(picked, s, log, later).map((w) => w.word.id)).toEqual(['l1'])
  })

  it('is saved as a short key, and a pick that no longer exists falls back to all words with a note', () => {
    for (const s of [{ kind: 'all' }, { kind: 'unit', unit: 2 }, { kind: 'lesson', lessonId: 'M' }] as WordSource[]) {
      expect(parseSourceKey(sourceKey(s), lessons)).toEqual({ source: s, note: null })
    }
    expect(parseSourceKey('lesson:gone', lessons)).toEqual({ source: { kind: 'all' }, note: 'Your last pick ("lesson:gone") no longer exists, so the review uses all words.' })
    // A lesson or unit without words is not offered, so a saved pick of it is gone too.
    expect(parseSourceKey('lesson:E', lessons).source).toEqual({ kind: 'all' })
    expect(parseSourceKey('unit:7', lessons).source).toEqual({ kind: 'all' })
    expect(sourceLessons(lessons).map((l) => l.id)).toEqual(['L', 'M', 'N'])
    expect(sourceLabel({ kind: 'lesson', lessonId: 'N' }, lessons)).toBe('2.1 N')
  })
})
