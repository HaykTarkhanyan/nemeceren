import { describe, expect, it } from 'vitest'
import { emptyState, review, Rating } from './srs.ts'
import { addDays, daysBetween, localDay, mondayOf } from './dates.ts'
import {
  dailyStats,
  daysThisWeekAndMonth,
  lastDays,
  REVIEW_CAP_MS,
  SESSION_GAP_MS,
  streaks,
  studyDays,
  TEST_ITEM_CAP_MS,
  lastTimerDays,
  timerByDay,
  timerTotals,
  wordProgress,
} from './stats.ts'
import type { ReviewEvent, TestItemEvent } from './stats.ts'

const at = (iso: string) => Date.parse(iso)
const MIN = 60_000
const rev = (iso: string, extra: Partial<ReviewEvent> = {}): ReviewEvent => ({ at: at(iso), timeMs: 10_000, rating: 3, isNew: false, ...extra })

describe('dates', () => {
  it('computes the local day in Munich and Yerevan around midnight', () => {
    // Munich is UTC+2 in summer time, Yerevan UTC+4.
    expect(localDay(new Date('2026-09-28T21:59:59Z'), 'Europe/Berlin')).toBe('2026-09-28')
    expect(localDay(new Date('2026-09-28T22:00:00Z'), 'Europe/Berlin')).toBe('2026-09-29')
    expect(localDay(new Date('2026-09-28T19:59:59Z'), 'Asia/Yerevan')).toBe('2026-09-28')
    expect(localDay(new Date('2026-09-28T20:00:00Z'), 'Asia/Yerevan')).toBe('2026-09-29')
  })

  it('handles the end of summer time (Munich, 2026-10-25) without losing or doubling a day', () => {
    expect(localDay(new Date('2026-10-25T22:30:00Z'), 'Europe/Berlin')).toBe('2026-10-25') // 23:30 CET
    expect(localDay(new Date('2026-10-25T23:00:00Z'), 'Europe/Berlin')).toBe('2026-10-26')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30') // start of summer time
  })

  it('finds the Monday of a week, across a month boundary', () => {
    expect(mondayOf('2026-10-01')).toBe('2026-09-28') // Thursday
    expect(mondayOf('2026-09-28')).toBe('2026-09-28')
    expect(mondayOf('2026-10-04')).toBe('2026-09-28') // Sunday
  })
})

describe('sessions and minutes', () => {
  it('splits sessions at a gap of 30 minutes or more', () => {
    const a = rev('2026-09-28T10:00:00Z', { timeMs: 0, localDay: '2026-09-28' })
    const almost = rev('2026-09-28T10:29:59Z', { timeMs: 0, localDay: '2026-09-28' })
    const exactly = rev('2026-09-28T10:30:00Z', { timeMs: 0, localDay: '2026-09-28' })
    expect(dailyStats([a, almost], []).get('2026-09-28')?.sessions).toBe(1)
    expect(dailyStats([a, exactly], []).get('2026-09-28')?.sessions).toBe(2)
    expect(SESSION_GAP_MS).toBe(30 * MIN)
  })

  it('measures the gap from the end of one activity to the start of the next', () => {
    const first = rev('2026-09-28T10:00:00Z', { timeMs: 60_000, localDay: '2026-09-28' })
    const second = rev('2026-09-28T10:35:00Z', { timeMs: 10 * 60_000, localDay: '2026-09-28' })
    // 10 min of card time is capped at 2 min, so the card "opened" at 10:33, 33 min after 10:00.
    expect(dailyStats([first, second], []).get('2026-09-28')?.sessions).toBe(2)
    const shortCard = rev('2026-09-28T10:25:00Z', { timeMs: 60_000, localDay: '2026-09-28' })
    expect(dailyStats([first, shortCard], []).get('2026-09-28')?.sessions).toBe(1)
  })

  it('counts a session that crosses midnight on the day it started, minutes on each own day', () => {
    // 23:50 and 00:10 Munich time, recorded with their local days.
    const late = rev('2026-09-28T21:50:00Z', { localDay: '2026-09-28', timeMs: 30_000 })
    const early = rev('2026-09-28T22:10:00Z', { localDay: '2026-09-29', timeMs: 45_000 })
    const days = dailyStats([early, late], [])
    expect(days.get('2026-09-28')).toMatchObject({ sessions: 1, reviews: 1, activeMs: 30_000 })
    expect(days.get('2026-09-29')).toMatchObject({ sessions: 0, reviews: 1, activeMs: 45_000 })
    expect([...studyDays(days)].sort()).toEqual(['2026-09-28', '2026-09-29'])
  })

  it('uses the recorded local day over the viewer time zone', () => {
    // Reviewed at 01:30 in Yerevan (recorded 29th); viewed later from Munich, where it was 23:30 on the 28th.
    const e = rev('2026-09-28T21:30:00Z', { localDay: '2026-09-29' })
    expect([...dailyStats([e], [], 'Europe/Berlin').keys()]).toEqual(['2026-09-29'])
    const legacy = rev('2026-09-28T21:30:00Z')
    expect([...dailyStats([legacy], [], 'Europe/Berlin').keys()]).toEqual(['2026-09-28'])
    expect([...dailyStats([legacy], [], 'Asia/Yerevan').keys()]).toEqual(['2026-09-29'])
  })

  it('caps review and test item time, and keeps untimed reviews out of minutes only', () => {
    const long = rev('2026-09-28T10:00:00Z', { localDay: '2026-09-28', timeMs: 5 * MIN })
    const untimed = rev('2026-09-28T10:01:00Z', { localDay: '2026-09-28', timeMs: undefined, rating: 1, isNew: true })
    const item = (timeMs: number, answered = true): TestItemEvent => ({
      attemptId: 'a',
      startedAt: at('2026-09-28T11:00:00Z'),
      submittedAt: at('2026-09-28T12:00:00Z'),
      localDay: '2026-09-28',
      timeMs,
      answered,
    })
    const d = dailyStats([long, untimed], [item(30 * MIN), item(2 * MIN), item(MIN, false)]).get('2026-09-28')
    expect(d).toMatchObject({
      reviews: 2,
      correct: 1,
      newWords: 1,
      untimed: 1,
      testItems: 2,
      activeMs: REVIEW_CAP_MS + TEST_ITEM_CAP_MS + 2 * MIN + MIN,
      sessions: 2,
    })
  })

  it('ignores test attempts with no answered item', () => {
    const item: TestItemEvent = { attemptId: 'x', startedAt: 0, submittedAt: 1000, localDay: '2026-09-28', timeMs: 500, answered: false }
    expect(dailyStats([], [item]).size).toBe(0)
  })
})

describe('streaks and calendar counts', () => {
  const study = new Set(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-27', '2026-09-28', '2026-09-29'])

  it('counts the current streak through today, or through yesterday before today is studied', () => {
    expect(streaks(study, '2026-09-29')).toEqual({ current: 3, longest: 4 })
    expect(streaks(study, '2026-09-30')).toEqual({ current: 3, longest: 4 })
    expect(streaks(study, '2026-10-01')).toEqual({ current: 0, longest: 4 })
    expect(streaks(new Set(), '2026-10-01')).toEqual({ current: 0, longest: 0 })
  })

  it('keeps a streak across a month boundary', () => {
    expect(streaks(new Set(['2026-09-30', '2026-10-01']), '2026-10-01').current).toBe(2)
  })

  it('counts study days this week (Monday start) and this month', () => {
    const s = new Set(['2026-09-26', '2026-09-28', '2026-09-29', '2026-09-30'])
    expect(daysThisWeekAndMonth(s, '2026-09-30')).toEqual({ week: 3, month: 4 })
    const s2 = new Set(['2026-09-30', '2026-10-01'])
    expect(daysThisWeekAndMonth(s2, '2026-10-01')).toEqual({ week: 2, month: 1 })
  })

  it('lists the last 30 days oldest first, with empty days filled in', () => {
    const days = dailyStats([rev('2026-10-25T10:00:00Z', { localDay: '2026-10-25' })], [])
    const list = lastDays(days, '2026-10-30', 30)
    expect(list).toHaveLength(30)
    expect(list[0].day).toBe('2026-10-01')
    expect(list[29].day).toBe('2026-10-30')
    expect(list.find((d) => d.day === '2026-10-25')?.reviews).toBe(1)
    expect(new Set(list.map((d) => d.day)).size).toBe(30)
  })
})

describe('wordProgress', () => {
  it('splits introduced words into learning and known (Review state, interval of 21 days or more)', () => {
    const words = ['a', 'b', 'c', 'd'].map((id) => ({ id, de: id, en: id, level: 'A1' as const, added: '2026-09-28' }))
    const t0 = new Date('2026-09-28T10:00:00Z')
    let s = review(emptyState(t0), 'a', Rating.Good, t0).state
    s = review(s, 'b', Rating.Easy, t0).state
    s = { ...s, cards: { ...s.cards, b: { ...s.cards.b, state: 2, scheduled_days: 21 }, c: { ...s.cards.a, state: 2, scheduled_days: 20 } } }
    expect(wordProgress(words, s, t0)).toMatchObject({ total: 4, introduced: 3, known: 1, learning: 2, notStarted: 1 })
  })
})

describe('the study timer', () => {
  const session = (localDay: string, minutes: number) => ({ localDay, activeMs: minutes * MIN })

  it('adds up timer minutes per local day of the session start', () => {
    // A session started at 23:40 in Munich and ran past midnight: all of it counts on the day it started.
    const days = timerByDay([session('2026-09-28', 50), session('2026-09-29', 20), session('2026-09-29', 15)])
    expect(days.get('2026-09-28')).toEqual({ day: '2026-09-28', activeMs: 50 * MIN, sessions: 1 })
    expect(days.get('2026-09-29')).toEqual({ day: '2026-09-29', activeMs: 35 * MIN, sessions: 2 })
    expect(days.has('2026-09-30')).toBe(false)
    const list = lastTimerDays(days, '2026-09-30', 30)
    expect(list).toHaveLength(30)
    expect(list[29]).toEqual({ day: '2026-09-30', activeMs: 0, sessions: 0 })
    expect(list[28].activeMs).toBe(35 * MIN)
  })

  it('totals today, this week (from Monday), this month, and the average per day with a session', () => {
    const days = timerByDay([
      session('2026-08-25', 600), // outside the 30 days and the month
      session('2026-09-27', 40), // Sunday: last week, this month
      session('2026-09-28', 30), // Monday
      session('2026-09-30', 20),
      session('2026-09-30', 10),
      session('2026-10-01', 5), // after "today": ignored
    ])
    expect(timerTotals(days, '2026-09-30', 30)).toEqual({
      todayMs: 30 * MIN,
      weekMs: 60 * MIN,
      monthMs: 100 * MIN,
      daysWithSession: 3,
      averageMs: (100 * MIN) / 3,
    })
    // A new month and week start on Thursday 2026-10-01.
    expect(timerTotals(days, '2026-10-01', 30)).toMatchObject({ todayMs: 5 * MIN, weekMs: 65 * MIN, monthMs: 5 * MIN, daysWithSession: 4 })
    expect(timerTotals(new Map(), '2026-10-01', 30)).toEqual({ todayMs: 0, weekMs: 0, monthMs: 0, daysWithSession: 0, averageMs: null })
  })
})
