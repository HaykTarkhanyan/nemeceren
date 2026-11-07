import { describe, expect, it } from 'vitest'
import type { Result } from '../content/schema.ts'
import { addDays } from './dates.ts'
import { FREEZE_EVERY, goalDays, goalStreak, MAX_FREEZES, MILESTONES, STARTER_FREEZES } from './goal.ts'
import type { PathEventLike } from './path.ts'

const L = '2026-11-08'
/** n consecutive days starting at `from`. */
const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i))
const set = (...days: string[]) => new Set(days)

const station = (localDay: string, extra: Partial<PathEventLike> = {}): PathEventLike => ({
  kind: 'station',
  lessonId: 'u1-01-sich-vorstellen',
  sectionFrom: 0,
  sectionTo: 5,
  localDay,
  ...extra,
})
const attempt = (testId: string, localDay: string, extra: Partial<Result> = {}): Result => ({
  version: 1,
  testId,
  testTitle: testId,
  level: 'A1',
  mode: 'web',
  startedAt: `${localDay}T08:00:00.000Z`,
  submittedAt: `${localDay}T08:05:00.000Z`,
  localDay,
  score: { correct: 0, wrong: 1, pending: 0, total: 1 },
  items: [],
  ...extra,
})

describe('goal days', () => {
  const course = set('u1-t1-vorstellen-sprachen')

  it('counts station events, daily mixes and course-test attempts, pass or fail', () => {
    const days = goalDays({
      events: [station('2026-11-08'), { kind: 'daily-mix', localDay: '2026-11-09' }, station('2026-11-10', { deletedAt: '2026-11-10T10:00:00.000Z' })],
      results: [attempt('u1-t1-vorstellen-sprachen', '2026-11-11')],
      courseTestIds: course,
    })
    expect([...days].sort()).toEqual(['2026-11-08', '2026-11-09', '2026-11-11'])
  })

  it('does not count lesson exercises, mistakes replay or tests off the path', () => {
    const days = goalDays({
      events: [],
      results: [
        attempt('u1-t1-vorstellen-sprachen', '2026-11-08', { lessonId: 'u1-01-sich-vorstellen', section: 3 }),
        attempt('m-u1-t1-vorstellen-sprachen-i2', '2026-11-09'),
        attempt('some-other-test', '2026-11-10'),
      ],
      courseTestIds: course,
    })
    expect(days.size).toBe(0)
  })

  it('takes the day from submittedAt when an attempt has no localDay', () => {
    const r = attempt('u1-t1-vorstellen-sprachen', '2026-11-08', { localDay: undefined, submittedAt: '2026-11-08T12:00:00.000Z' })
    expect([...goalDays({ events: [], results: [r], courseTestIds: course, timeZone: 'Europe/Berlin' })]).toEqual(['2026-11-08'])
  })
})

describe('the goal streak', () => {
  it('has the agreed constants', () => {
    expect([MILESTONES, FREEZE_EVERY, MAX_FREEZES, STARTER_FREEZES]).toEqual([[7, 30, 100], 7, 2, 1])
  })

  it('before launch day uses the old rule', () => {
    const g = goalStreak({ studyDays: set(...run(addDays(L, -3), 3)), goalDays: set(), launchDay: L, today: addDays(L, -1) })
    expect(g).toMatchObject({ current: 3, longest: 3, freezes: STARTER_FREEZES, todayMet: false })
  })

  it("before launch day the ring still shows today's goal", () => {
    const g = goalStreak({ studyDays: set(addDays(L, -1)), goalDays: set(addDays(L, -1)), launchDay: L, today: addDays(L, -1) })
    expect(g).toMatchObject({ current: 1, todayMet: true, milestoneToday: null })
  })

  it('carries the old streak across launch day', () => {
    const g = goalStreak({ studyDays: set(...run(addDays(L, -3), 3)), goalDays: set(L), launchDay: L, today: L })
    expect(g).toMatchObject({ current: 4, todayMet: true })
  })

  it("today not met yet keeps yesterday's streak", () => {
    const g = goalStreak({ studyDays: set(), goalDays: set(L), launchDay: L, today: addDays(L, 1) })
    expect(g).toMatchObject({ current: 1, todayMet: false, freezes: 1 })
  })

  it('a missed day uses the starter freeze', () => {
    const g = goalStreak({ studyDays: set(), goalDays: set(L, addDays(L, 2)), launchDay: L, today: addDays(L, 2) })
    expect(g.current).toBe(2)
    expect(g.freezes).toBe(0)
    expect([...g.frozenDays]).toEqual([addDays(L, 1)])
  })

  it('a second missed day without a freeze breaks the streak', () => {
    const g = goalStreak({ studyDays: set(), goalDays: set(L, addDays(L, 3)), launchDay: L, today: addDays(L, 3) })
    expect(g.current).toBe(1)
    expect(g.longest).toBe(1)
  })

  it('a frozen day does not add to the streak or the run', () => {
    // Goal days L..L+5 (6), a frozen L+6, then L+7: the 7th goal day earns a freeze on L+7, not on the frozen day.
    const goal = set(...run(L, 6), addDays(L, 7))
    const g = goalStreak({ studyDays: set(), goalDays: goal, launchDay: L, today: addDays(L, 7) })
    expect(g.current).toBe(7)
    expect(g.freezeEarnedToday).toBe(true)
    expect(g.freezes).toBe(1)
  })

  it('earns a freeze every 7 goal days, at most 2', () => {
    const seven = goalStreak({ studyDays: set(), goalDays: set(...run(L, 7)), launchDay: L, today: addDays(L, 6) })
    expect(seven).toMatchObject({ current: 7, freezes: 2, freezeEarnedToday: true })
    const fourteen = goalStreak({ studyDays: set(), goalDays: set(...run(L, 14)), launchDay: L, today: addDays(L, 13) })
    expect(fourteen).toMatchObject({ current: 14, freezes: MAX_FREEZES, freezeEarnedToday: false })
  })

  it('a milestone shows on the day it is reached', () => {
    const day7 = goalStreak({ studyDays: set(), goalDays: set(...run(L, 7)), launchDay: L, today: addDays(L, 6) })
    expect(day7.milestoneToday).toBe(7)
    const day8 = goalStreak({ studyDays: set(), goalDays: set(...run(L, 8)), launchDay: L, today: addDays(L, 7) })
    expect(day8.milestoneToday).toBeNull()
  })

  it('the longest streak spans launch day', () => {
    const g = goalStreak({ studyDays: set(...run(addDays(L, -5), 5)), goalDays: set(...run(L, 3)), launchDay: L, today: addDays(L, 4) })
    expect(g.longest).toBe(8)
    expect(g.current).toBe(8) // L+3 was frozen with the starter freeze; today (L+4) is still open
    expect([...g.frozenDays]).toEqual([addDays(L, 3)])
  })

  it('an old streak broken before launch day still counts as longest', () => {
    const study = set(...run('2026-10-01', 10), addDays(L, -1))
    const g = goalStreak({ studyDays: study, goalDays: set(), launchDay: L, today: L })
    expect(g).toMatchObject({ current: 1, longest: 10 })
  })

  it('a station done before launch day keeps the streak alive across it (deploy day)', () => {
    // Deploy day L-1: a station, no review or test item, so no study day. The ring said "Goal done".
    const before = goalStreak({ studyDays: set(), goalDays: set(addDays(L, -1)), launchDay: L, today: addDays(L, -1) })
    expect(before).toMatchObject({ current: 1, todayMet: true })
    const after = goalStreak({ studyDays: set(), goalDays: set(addDays(L, -1), L), launchDay: L, today: L })
    expect(after.current).toBe(2)
  })

  it('a freeze is not spent while there is no streak to keep', () => {
    // Nothing on launch day or the day after: the starter freeze is still there.
    const g = goalStreak({ studyDays: set(), goalDays: set(addDays(L, 2)), launchDay: L, today: addDays(L, 2) })
    expect(g).toMatchObject({ current: 1, freezes: 1 })
    expect(g.frozenDays.size).toBe(0)
  })

  it('two freezes used in a row keep a streak', () => {
    // 7 goal days (freezes 1 -> 2), then two missed days, then a goal day.
    const goal = set(...run(L, 7), addDays(L, 9))
    const g = goalStreak({ studyDays: set(), goalDays: goal, launchDay: L, today: addDays(L, 9) })
    expect(g.current).toBe(8)
    expect(g.freezes).toBe(0)
    expect([...g.frozenDays]).toEqual([addDays(L, 7), addDays(L, 8)])
  })
})
