import { describe, expect, it } from 'vitest'
import { findSource, itemsForResult, parseRedoTestId, redoTestId } from '../content/lessons.ts'
import type { CourseLesson, Item, Result, Test } from '../content/schema.ts'
import { describeItem } from './grading.ts'
import { deriveMistakes, FIX_DAYS } from './mistakes.ts'

const gap: Item = { type: 'gap', text: 'Ich ___ Eva.', answers: [['heiße']] }
const mc: Item = { type: 'mc', question: 'Wie heißen Sie?', options: ['Ich heiße Eva.', 'Gut, danke.'], answer: 'Ich heiße Eva.' }
const test: Test = { id: 'u1-t1-x', title: 'Unit 1 test', level: 'A1', created: '2026-11-01', lesson: 'u1-01-x', items: [gap, mc] }
const lesson: CourseLesson = {
  id: 'u1-01-x',
  unit: 1,
  order: 1,
  level: 'A1',
  title: 'Hallo',
  summary: 's',
  goals: ['g'],
  sections: [
    { type: 'tip', text: 't' },
    { type: 'exercise', title: 'Check yourself', items: [mc] },
  ],
}

/** One attempt on day `day` (YYYY-MM-DD, noon local time) with the given statuses per item. */
function attempt(testId: string, day: string, statuses: ('correct' | 'wrong' | 'pending')[], items: Item[], extra: Partial<Result> = {}): Result {
  const at = new Date(`${day}T12:00:00`).toISOString()
  return {
    version: 1,
    testId,
    testTitle: testId,
    level: 'A1',
    mode: 'web',
    startedAt: at,
    submittedAt: at,
    localDay: day,
    score: { correct: 0, wrong: 0, pending: 0, total: statuses.length },
    items: statuses.map((status, i) => ({ index: i, type: items[i].type, question: describeItem(items[i]), answer: 'x', expected: null, status, nearMiss: null, timeMs: 1, hintUsed: false })),
    ...extra,
  }
}
const redo = (sourceId: string, index: number, day: string, status: 'correct' | 'wrong' | 'pending', item: Item) => attempt(redoTestId(sourceId, index), day, [status], [item])
const at = (day: string) => new Date(`${day}T15:00:00`)

describe('redo test ids', () => {
  it('round-trip the source id and item index', () => {
    expect(redoTestId('u1-01-x-ex2', 7)).toBe('m-u1-01-x-ex2-i7')
    expect(parseRedoTestId('m-u1-01-x-ex2-i7')).toEqual({ sourceId: 'u1-01-x-ex2', index: 7 })
    expect(parseRedoTestId('u1-t1-x')).toBeNull()
  })

  it('find the source of a test and of a lesson exercise, and the items of a redo', () => {
    expect(findSource('u1-t1-x', [test], [lesson])).toMatchObject({ kind: 'test', reread: { id: 'u1-01-x' } })
    expect(findSource('u1-01-x-ex1', [test], [lesson])).toMatchObject({ kind: 'exercise', title: '1.1 Hallo: Check yourself', items: [mc] })
    expect(findSource('nope', [test], [lesson])).toBeNull()
    expect(itemsForResult(redo('u1-t1-x', 1, '2026-11-07', 'correct', mc), [test], [lesson])).toEqual([mc])
  })
})

describe('deriveMistakes', () => {
  it('brings a wrong item back the next day, not the same day', () => {
    const results = [attempt('u1-t1-x', '2026-11-07', ['wrong', 'correct'], test.items)]
    expect(deriveMistakes(results, [test], [lesson], at('2026-11-07')).due).toEqual([])
    const next = deriveMistakes(results, [test], [lesson], at('2026-11-08'))
    expect(next.due.map((m) => m.key)).toEqual(['u1-t1-x#0'])
    expect(next.due[0].source.reread?.id).toBe('u1-01-x')
  })

  it(`is fixed after right answers on ${FIX_DAYS} different days, and a wrong answer restarts the count`, () => {
    const base = attempt('u1-t1-x', '2026-11-07', ['wrong', 'correct'], test.items)
    const once = [base, redo('u1-t1-x', 0, '2026-11-08', 'correct', gap)]
    expect(deriveMistakes(once, [test], [lesson], at('2026-11-09')).due[0].rightDays).toBe(1)
    const sameDay = [...once, redo('u1-t1-x', 0, '2026-11-08', 'correct', gap)]
    expect(deriveMistakes(sameDay, [test], [lesson], at('2026-11-09')).active).toHaveLength(1)
    const twice = [...once, redo('u1-t1-x', 0, '2026-11-09', 'correct', gap)]
    expect(deriveMistakes(twice, [test], [lesson], at('2026-11-10'))).toMatchObject({ active: [], fixed: 1 })
    const relapse = [...once, redo('u1-t1-x', 0, '2026-11-09', 'wrong', gap), redo('u1-t1-x', 0, '2026-11-10', 'correct', gap)]
    expect(deriveMistakes(relapse, [test], [lesson], at('2026-11-11')).due[0].rightDays).toBe(1)
  })

  it('counts a right answer in a later attempt of the whole test', () => {
    const results = [
      attempt('u1-t1-x', '2026-11-07', ['wrong', 'correct'], test.items),
      attempt('u1-t1-x', '2026-11-08', ['correct', 'correct'], test.items),
      attempt('u1-t1-x', '2026-11-09', ['correct', 'correct'], test.items),
    ]
    expect(deriveMistakes(results, [test], [lesson], at('2026-11-10')).active).toEqual([])
  })

  it('takes lesson exercises, ignores attempts before the start date and listening practice', () => {
    const results = [
      attempt('u1-01-x-ex1', '2026-11-07', ['wrong'], [mc], { lessonId: 'u1-01-x', section: 1 }),
      attempt('u1-t1-x', '2026-11-05', ['wrong', 'wrong'], test.items),
      attempt('listening-practice', '2026-11-07', ['wrong'], [gap]),
    ]
    const out = deriveMistakes(results, [test], [lesson], at('2026-11-08'))
    expect(out.due.map((m) => m.key)).toEqual(['u1-01-x-ex1#0'])
    expect(out.changed).toBe(0)
  })

  it('leaves out an item that was rewritten since, and counts it', () => {
    const results = [attempt('u1-t1-x', '2026-11-07', ['wrong', 'correct'], test.items)]
    const rewritten: Test = { ...test, items: [{ ...gap, text: 'Du ___ Eva.' }, mc] }
    expect(deriveMistakes(results, [rewritten], [lesson], at('2026-11-08'))).toMatchObject({ active: [], changed: 1 })
  })

  it("waits for Claude's grade on a write item, and uses the review's verdict", () => {
    const write: Item = { type: 'write', prompt: 'Schreib über dich.' }
    const wtest: Test = { ...test, id: 'u1-t3-w', items: [write] }
    const pending = attempt('u1-t3-w', '2026-11-07', ['pending'], [write])
    expect(deriveMistakes([pending], [wtest], [lesson], at('2026-11-08')).active).toEqual([])
    const graded = { ...pending, review: { gradedAt: new Date().toISOString(), summary: 's', items: [{ index: 0, correct: false, correction: 'Ich heiße Eva.' }] } }
    const out = deriveMistakes([graded], [wtest], [lesson], at('2026-11-08'))
    expect(out.due[0].correction).toBe('Ich heiße Eva.')
    // A rewritten answer waiting for Claude: not due again the same day, back the next day, not fixed.
    const rewrite = redo('u1-t3-w', 0, '2026-11-08', 'pending', write)
    expect(deriveMistakes([graded, rewrite], [wtest], [lesson], at('2026-11-08')).due).toEqual([])
    expect(deriveMistakes([graded, rewrite], [wtest], [lesson], at('2026-11-09')).due[0].rightDays).toBe(0)
  })
})
