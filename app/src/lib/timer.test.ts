import { describe, expect, it, vi } from 'vitest'
import {
  activeMsFor,
  cleanLabel,
  clockText,
  createTimerStore,
  durationText,
  elapsedMs,
  LONG_SESSION_MS,
  manualStart,
  pauseTimer,
  planStop,
  resumeTimer,
  SHORT_SESSION_MS,
  startTimer,
  timerKey,
} from './timer.ts'
import type { TimerDeps } from './timer.ts'
import { localDay } from './dates.ts'

const MIN = 60_000
const HOUR = 60 * MIN
const t0 = Date.parse('2026-10-02T09:00:00.000Z')

describe('timer state math', () => {
  it('counts running time and leaves pauses out', () => {
    let s = startTimer(t0)
    expect(elapsedMs(s, t0 + 10 * MIN)).toBe(10 * MIN)
    s = pauseTimer(s, t0 + 10 * MIN)
    expect(s).toEqual({ startedAt: t0, activeMs: 10 * MIN, runningSince: null, pausedAt: t0 + 10 * MIN })
    // Paused: the time stands still.
    expect(elapsedMs(s, t0 + 25 * MIN)).toBe(10 * MIN)
    s = resumeTimer(s, t0 + 25 * MIN)
    expect(elapsedMs(s, t0 + 30 * MIN)).toBe(15 * MIN)
    // Pausing twice or resuming a running timer changes nothing.
    expect(resumeTimer(s, t0 + 31 * MIN)).toBe(s)
    const p = pauseTimer(s, t0 + 40 * MIN)
    expect(pauseTimer(p, t0 + 50 * MIN)).toBe(p)
    expect(elapsedMs(p, t0 + 50 * MIN)).toBe(25 * MIN)
  })

  it('computes the time from timestamps, so a sleep gap or a hidden tab does not drift', () => {
    const s = startTimer(t0)
    // No ticks at all between start and now (laptop asleep, tab in the background): still exact.
    expect(elapsedMs(s, t0 + 2 * HOUR + 3_000)).toBe(2 * HOUR + 3_000)
    // A clock that went back does not make the time negative.
    expect(elapsedMs(s, t0 - 5 * MIN)).toBe(0)
  })

  it('shows mm:ss under an hour, then h:mm:ss', () => {
    expect(clockText(0)).toBe('00:00')
    expect(clockText(65_000)).toBe('01:05')
    expect(clockText(59 * MIN + 59_999)).toBe('59:59')
    expect(clockText(HOUR)).toBe('1:00:00')
    expect(clockText(10 * HOUR + 7 * MIN + 5_000)).toBe('10:07:05')
    expect(durationText(45 * MIN)).toBe('45 min')
    expect(durationText(2 * HOUR + 5 * MIN)).toBe('2 h 5 min')
    expect(durationText(3 * HOUR)).toBe('3 h')
    expect(durationText(20_000)).toBe('under a minute')
  })
})

describe('stop: the 1 minute and 3 hour rules', () => {
  it('does not save a stop under 1 minute ("Discard this short session?")', () => {
    const s = startTimer(t0)
    expect(planStop(s, t0 + 59_999).kind).toBe('short')
    expect(planStop(s, t0 + SHORT_SESSION_MS).kind).toBe('normal')
  })

  it('asks again for the minutes of a session over 3 hours', () => {
    const s = startTimer(t0)
    expect(planStop(s, t0 + LONG_SESSION_MS).kind).toBe('normal')
    const long = planStop(s, t0 + LONG_SESSION_MS + 1_000)
    expect(long).toEqual({ kind: 'long', startedAt: t0, endedAt: t0 + LONG_SESSION_MS + 1_000, activeMs: LONG_SESSION_MS + 1_000 })
    // Corrected down to 95 minutes.
    expect(activeMsFor(95, long.activeMs, long.endedAt - long.startedAt)).toEqual({ activeMs: 95 * MIN })
    // Unchanged minutes keep the exact time.
    expect(activeMsFor(180, long.activeMs, long.endedAt - long.startedAt)).toEqual({ activeMs: long.activeMs })
    // Not more than the time from start to stop, not more than 16 hours, at least 1 whole minute.
    expect(activeMsFor(200, long.activeMs, long.endedAt - long.startedAt)).toMatchObject({ problem: expect.stringMatching(/at most 180 minutes/) })
    expect(activeMsFor(0, long.activeMs, long.endedAt - long.startedAt)).toMatchObject({ problem: expect.stringMatching(/at least 1/) })
    expect(activeMsFor(1.5, long.activeMs, long.endedAt - long.startedAt)).toMatchObject({ problem: expect.stringMatching(/whole minutes/) })
    expect(activeMsFor(Number(''), long.activeMs, long.endedAt - long.startedAt)).toMatchObject({ problem: expect.stringMatching(/at least 1/) })
  })

  it('makes a timer left running for a day correct its minutes before it can be saved', () => {
    const s = startTimer(t0)
    const plan = planStop(s, t0 + 20 * HOUR)
    expect(plan.kind).toBe('long')
    const span = plan.endedAt - plan.startedAt
    expect(activeMsFor(Math.round(plan.activeMs / MIN), plan.activeMs, span)).toMatchObject({ problem: expect.stringMatching(/At most 960 minutes/) })
    expect(activeMsFor(120, plan.activeMs, span)).toEqual({ activeMs: 120 * MIN })
  })

  it('ends a paused timer at the pause, not at the stop', () => {
    const s = pauseTimer(startTimer(t0), t0 + 30 * MIN)
    expect(planStop(s, t0 + 5 * HOUR)).toEqual({ kind: 'normal', startedAt: t0, endedAt: t0 + 30 * MIN, activeMs: 30 * MIN })
  })

  it('never saves more active time than start to stop, even if the clock went back', () => {
    const s = { startedAt: t0, activeMs: 10 * MIN, runningSince: t0 + 5 * MIN, pausedAt: null }
    const plan = planStop(s, t0 + 2 * MIN)
    expect(plan.activeMs).toBeLessThanOrEqual(plan.endedAt - plan.startedAt)
    expect(planStop(startTimer(t0), t0 - HOUR)).toMatchObject({ endedAt: t0, activeMs: 0, kind: 'short' })
  })

  it('cleans labels and refuses one that is too long', () => {
    expect(cleanLabel('  lesson 0.3 ')).toBe('lesson 0.3')
    expect(cleanLabel('   ')).toBeUndefined()
    expect(() => cleanLabel('x'.repeat(101))).toThrow(/at most 100 characters/)
  })

  it('starts a session added by hand at local noon of its day', () => {
    const d = manualStart('2026-10-25') // the day Munich leaves summer time
    expect(localDay(d)).toBe('2026-10-25')
    expect(d.getHours()).toBe(12)
    expect(() => manualStart('yesterday')).toThrow(/not a date/)
  })
})

// ---------- the timer kept on this device ----------

function fakeDevice() {
  const data = new Map<string, string>()
  const watchers = new Set<(key: string | null) => void>()
  let clock = t0
  const errors: string[] = []
  const deps: TimerDeps = {
    storage: () => ({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    }),
    now: () => clock,
    reportError: (m) => void errors.push(m),
    watch(onChange) {
      watchers.add(onChange)
      return () => watchers.delete(onChange)
    },
  }
  return {
    data,
    errors,
    deps,
    advance: (ms: number) => (clock += ms),
    /** Another tab wrote to storage: the browser fires "storage" in every other tab. */
    otherTabWrote: (key: string) => watchers.forEach((w) => w(key)),
    watchers,
  }
}

describe('the timer on this device', () => {
  it('survives a reload: a new store for the same user finds it, paused or running', () => {
    const dev = fakeDevice()
    const a = createTimerStore(dev.deps)
    a.attachUser('u1')
    expect(a.getSnapshot()).toEqual({ attached: true, state: null })
    a.start()
    dev.advance(10 * MIN)
    a.pause()
    expect(JSON.parse(dev.data.get(timerKey('u1'))!)).toEqual({ startedAt: t0, activeMs: 10 * MIN, runningSince: null, pausedAt: t0 + 10 * MIN })

    // Reload (or the tab was closed): a fresh store, a later time.
    dev.advance(HOUR)
    const b = createTimerStore(dev.deps)
    b.attachUser('u1')
    expect(elapsedMs(b.getSnapshot().state!, dev.deps.now())).toBe(10 * MIN)
    b.resume()
    dev.advance(5 * MIN)
    const c = createTimerStore(dev.deps)
    c.attachUser('u1')
    expect(elapsedMs(c.getSnapshot().state!, dev.deps.now())).toBe(15 * MIN)
    // Another user on the same browser has no timer.
    c.attachUser('u2')
    expect(c.getSnapshot().state).toBeNull()
    expect(dev.errors).toEqual([])
  })

  it('shows the timer of another tab instead of starting a second one, and follows its changes', () => {
    const dev = fakeDevice()
    const tab1 = createTimerStore(dev.deps)
    const tab2 = createTimerStore(dev.deps)
    tab1.attachUser('u1')
    tab2.attachUser('u1')
    tab1.start()
    // Even before the storage event arrives, Start in tab 2 adopts tab 1's timer.
    dev.advance(3 * MIN)
    tab2.start()
    expect(tab2.getSnapshot().state).toEqual(tab1.getSnapshot().state)
    expect(tab2.getSnapshot().state!.startedAt).toBe(t0)

    tab1.pause()
    dev.otherTabWrote(timerKey('u1'))
    expect(tab2.getSnapshot().state!.pausedAt).toBe(t0 + 3 * MIN)
    // Storage events for other keys are ignored.
    const before = tab2.getSnapshot()
    dev.otherTabWrote('nemeceren.outbox.u1')
    expect(tab2.getSnapshot()).toBe(before)

    tab1.clear()
    dev.otherTabWrote(timerKey('u1'))
    expect(tab2.getSnapshot().state).toBeNull()
    tab2.detach()
    tab1.detach()
    expect(dev.watchers.size).toBe(0)
  })

  it('reports a damaged saved timer and a storage that refuses writes, instead of failing silently', () => {
    const dev = fakeDevice()
    dev.data.set(timerKey('u1'), '{"startedAt": "yesterday"}')
    const store = createTimerStore(dev.deps)
    store.attachUser('u1')
    expect(store.getSnapshot().state).toBeNull()
    expect(dev.errors).toHaveLength(1)
    expect(dev.errors[0]).toMatch(/damaged, so it was not restored/)

    const full = createTimerStore({
      ...dev.deps,
      storage: () => ({
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
        removeItem: () => {},
      }),
    })
    full.attachUser('u1')
    full.start()
    // It goes on in this tab, and says so.
    expect(full.getSnapshot().state).not.toBeNull()
    expect(dev.errors[1]).toMatch(/could not be kept on this device.*QuotaExceededError.*goes on in this tab/)
  })

  it('keeps a guest timer in memory only: no browser storage, no storage events', () => {
    const dev = fakeDevice()
    const storage = vi.fn(dev.deps.storage)
    const watch = vi.fn(dev.deps.watch)
    const store = createTimerStore({ ...dev.deps, storage, watch })
    store.attachGuest()
    store.start()
    dev.advance(2 * MIN)
    store.pause()
    store.resume()
    expect(elapsedMs(store.getSnapshot().state!, dev.deps.now())).toBe(2 * MIN)
    store.clear()
    store.start()
    store.detach()
    expect(store.getSnapshot()).toEqual({ attached: false, state: null })
    expect(storage).not.toHaveBeenCalled()
    expect(watch).not.toHaveBeenCalled()
    expect(dev.data.size).toBe(0)
  })

  it('refuses to start before sign-in or guest mode', () => {
    const store = createTimerStore(fakeDevice().deps)
    expect(() => store.start()).toThrow(/not ready/)
  })
})
