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

  it('asks for 10 reviews and 3 new words when there is plenty', () => {
    expect(quickTasks({ reviewed: 0, learned: 0, due: 25, newAvailable: 5 })).toEqual([
      { id: 'review', label: 'Review 10 words', minutes: 3, doneCount: 0, target: 10, done: false },
      { id: 'new', label: 'Learn 3 new words', minutes: 2, doneCount: 0, target: 3, done: false },
    ])
  })

  it('shrinks to what is due or left, and keeps a task done today on screen', () => {
    const [review, fresh] = quickTasks({ reviewed: 2, learned: 1, due: 1, newAvailable: 0 })
    expect(review).toMatchObject({ label: 'Review the 3 due words', target: 3, doneCount: 2, done: false })
    expect(fresh).toMatchObject({ label: 'Learn 1 new word', target: 1, done: true })
  })

  it('ticks the review once 10 are done, even with more still due', () => {
    expect(quickTasks({ reviewed: 12, learned: 0, due: 30, newAvailable: 0 })[0]).toMatchObject({ target: 10, doneCount: 10, done: true })
  })

  it('shows nothing when nothing is due, left or done', () => {
    expect(quickTasks({ reviewed: 0, learned: 0, due: 0, newAvailable: 0 })).toEqual([])
  })
})
