import { describe, expect, it } from 'vitest'
import { quickTasks, todayCounts } from './quickTasks.ts'

describe('quick tasks for a busy day (DECISIONS.md #119)', () => {
  it('counts today only, and leaves practice out', () => {
    const log = [
      { localDay: '2026-11-24', isNew: false },
      { localDay: '2026-11-24', isNew: true },
      { localDay: '2026-11-24', isNew: false, practice: true as const },
      { localDay: '2026-11-23', isNew: false },
    ]
    expect(todayCounts(log, '2026-11-24')).toEqual({ reviewed: 1, learned: 1 })
  })

  it('asks for 30 reviews and 10 new words when there is plenty', () => {
    expect(quickTasks({ reviewed: 0, learned: 0, due: 45, newAvailable: 50 })).toEqual([
      { id: 'review', label: 'Review 30 words', minutes: 9, doneCount: 0, target: 30, done: false },
      { id: 'new', label: 'Learn 10 new words', minutes: 7, doneCount: 0, target: 10, done: false },
    ])
  })

  it('shrinks to what is due or left, and keeps a task done today on screen', () => {
    const [review, fresh] = quickTasks({ reviewed: 2, learned: 1, due: 1, newAvailable: 0 })
    expect(review).toMatchObject({ label: 'Review the 3 due words', target: 3, doneCount: 2, done: false })
    expect(fresh).toMatchObject({ label: 'Learn 1 new word', target: 1, done: true })
  })

  it('ticks the review once 30 are done, even with more still due', () => {
    expect(quickTasks({ reviewed: 31, learned: 0, due: 30, newAvailable: 0 })[0]).toMatchObject({ target: 30, doneCount: 30, done: true })
  })

  it('counts 8 done of 30 when 28 are still due (Hayk, 2026-11-24)', () => {
    expect(quickTasks({ reviewed: 8, learned: 3, due: 28, newAvailable: 40 })).toMatchObject([
      { id: 'review', target: 30, doneCount: 8, done: false },
      { id: 'new', target: 10, doneCount: 3, done: false },
    ])
  })

  it('shows nothing when nothing is due, left or done', () => {
    expect(quickTasks({ reviewed: 0, learned: 0, due: 0, newAvailable: 0 })).toEqual([])
  })
})
