import { describe, expect, it, vi } from 'vitest'
import {
  ACTIVITY_WRITE_MS,
  activeMsFor,
  afterActivity,
  AUTO_SAVE_MS,
  cleanLabel,
  clockText,
  createTimerStore,
  durationText,
  elapsedMs,
  IDLE_MS,
  idleCheck,
  isIdlePaused,
  isPaused,
  LONG_SESSION_MS,
  manualStart,
  pauseTimer,
  planStop,
  resumeTimer,
  SHORT_SESSION_MS,
  shouldAutoSave,
  startAutoTimer,
  startTimer,
  timerKey,
} from './timer.ts'
import type { StopPlan, TimerDeps } from './timer.ts'
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
  const saved: StopPlan[] = []
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
    saveSession: (plan) => void saved.push(plan),
  }
  return {
    data,
    errors,
    saved,
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

describe('auto-start and the idle rule (DECISIONS.md #122)', () => {
  it('pauses an auto timer at its last activity after 5 idle minutes, so those minutes do not count', () => {
    let s = startAutoTimer(t0)
    s = afterActivity(s, t0 + 3 * MIN)
    expect(s.lastActiveAt).toBe(t0 + 3 * MIN)
    // 4 minutes after the last activity: still running.
    expect(idleCheck(s, t0 + 7 * MIN)).toBe(s)
    // 5 minutes after it: paused as of the last activity.
    const idle = idleCheck(s, t0 + 8 * MIN)
    expect(isIdlePaused(idle)).toBe(true)
    expect(idle.pausedAt).toBe(t0 + 3 * MIN)
    expect(elapsedMs(idle, t0 + 30 * MIN)).toBe(3 * MIN)
    // Stop on an idle timer ends the session at the last activity.
    expect(planStop(idle, t0 + 30 * MIN)).toMatchObject({ endedAt: t0 + 3 * MIN, activeMs: 3 * MIN })
  })

  it('resumes on the next activity without the idle minutes, even if no tick paused it first (laptop asleep)', () => {
    // Busy for 10 minutes (a tap every 4), then the laptop sleeps.
    let s = startAutoTimer(t0)
    for (const m of [4, 8, 10]) s = afterActivity(s, t0 + m * MIN)
    expect(s.lastActiveAt).toBe(t0 + 10 * MIN)
    // A gap longer than 5 minutes is idle even without a tick in between: here 10 minutes from the start.
    expect(elapsedMs(afterActivity(startAutoTimer(t0), t0 + 10 * MIN), t0 + 10 * MIN)).toBe(0)
    // Two hours later, the first tap: paused at the last activity, then resumed now.
    const back = afterActivity(s, t0 + 2 * HOUR)
    expect(isPaused(back)).toBe(false)
    expect(back.idle).toBeUndefined()
    expect(elapsedMs(back, t0 + 2 * HOUR + MIN)).toBe(11 * MIN)
  })

  it('keeps a pause Hayk made, and never pauses a timer started by hand', () => {
    const paused = pauseTimer(startAutoTimer(t0), t0 + 2 * MIN)
    expect(isIdlePaused(paused)).toBe(false)
    expect(afterActivity(paused, t0 + 10 * MIN)).toBe(paused)
    const byHand = startTimer(t0)
    expect(idleCheck(byHand, t0 + 5 * HOUR)).toBe(byHand)
    expect(afterActivity(byHand, t0 + 5 * HOUR)).toBe(byHand)
    // Resuming by hand clears nothing it should not: the timer stays an auto timer, and counts activity from now.
    const resumed = resumeTimer(paused, t0 + 20 * MIN)
    expect(resumed).toMatchObject({ auto: true, lastActiveAt: t0 + 20 * MIN, runningSince: t0 + 20 * MIN })
  })

  it('writes the last activity at most every ACTIVITY_WRITE_MS', () => {
    const s = startAutoTimer(t0)
    expect(afterActivity(s, t0 + ACTIVITY_WRITE_MS - 1)).toBe(s)
    expect(afterActivity(s, t0 + ACTIVITY_WRITE_MS).lastActiveAt).toBe(t0 + ACTIVITY_WRITE_MS)
    expect(IDLE_MS).toBe(5 * MIN)
  })

  it('autoStart starts a timer, adopts a running one, resumes an idle one and leaves a pause by hand', () => {
    const dev = fakeDevice()
    const store = createTimerStore(dev.deps)
    // Before sign-in there is nothing to start, and no error.
    store.autoStart()
    expect(store.getSnapshot().state).toBeNull()
    store.attachUser('u1')
    store.autoStart()
    expect(store.getSnapshot().state).toMatchObject({ startedAt: t0, auto: true })
    dev.advance(2 * MIN)
    store.autoStart()
    expect(store.getSnapshot().state!.startedAt).toBe(t0)

    // Idle for 6 minutes: the tick pauses it at the last activity, the next exercise resumes it.
    dev.advance(6 * MIN)
    store.checkIdle()
    expect(isIdlePaused(store.getSnapshot().state!)).toBe(true)
    store.autoStart()
    expect(isPaused(store.getSnapshot().state!)).toBe(false)
    expect(elapsedMs(store.getSnapshot().state!, dev.deps.now())).toBe(2 * MIN)

    // Paused by hand: an exercise or a tap does not resume it.
    store.pause()
    dev.advance(MIN)
    store.autoStart()
    store.activity()
    expect(isPaused(store.getSnapshot().state!)).toBe(true)
    expect(JSON.parse(dev.data.get(timerKey('u1'))!)).toMatchObject({ auto: true, runningSince: null })
    expect(dev.errors).toEqual([])
  })
})

describe('auto-save of an idle auto timer (Q83)', () => {
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  /** 10 minutes of study: a tap every 2 minutes (a gap over 5 minutes would be idle). */
  const study10 = (dev: ReturnType<typeof fakeDevice>, store: { activity: () => void }) => {
    for (let i = 0; i < 5; i++) {
      dev.advance(2 * MIN)
      store.activity()
    }
  }

  it('saves 30 minutes after the last activity, or on a later day, never while active or paused by hand', () => {
    const s = afterActivity(startAutoTimer(t0), t0 + 4 * MIN)
    expect(shouldAutoSave(s, t0 + 4 * MIN + AUTO_SAVE_MS - 1, dayOf)).toBe(false)
    expect(shouldAutoSave(s, t0 + 4 * MIN + AUTO_SAVE_MS, dayOf)).toBe(true)
    // Idle (6 minutes) into the next day: saves at once.
    const late = afterActivity(startAutoTimer(Date.parse('2026-10-02T23:50:00.000Z')), Date.parse('2026-10-02T23:54:00.000Z'))
    expect(shouldAutoSave(late, Date.parse('2026-10-03T00:00:00.000Z'), dayOf)).toBe(true)
    // Active across midnight: no save (the session counts on the day it started).
    const busy = afterActivity(late, Date.parse('2026-10-02T23:58:00.000Z'))
    expect(shouldAutoSave(busy, Date.parse('2026-10-03T00:01:00.000Z'), dayOf)).toBe(false)
    expect(shouldAutoSave(pauseTimer(s, t0 + 5 * MIN), t0 + 5 * HOUR, dayOf)).toBe(false)
    expect(shouldAutoSave(startTimer(t0), t0 + 5 * HOUR, dayOf)).toBe(false)
  })

  it('saves start to last activity, clears the timer, and the next exercise starts a new one', () => {
    const dev = fakeDevice()
    const store = createTimerStore(dev.deps)
    store.attachUser('u1')
    store.autoStart()
    study10(dev, store)
    // Gone for an hour: the first tick saves the 10 minutes and clears the timer.
    dev.advance(HOUR)
    store.checkIdle()
    expect(dev.saved).toEqual([{ kind: 'normal', startedAt: t0, endedAt: t0 + 10 * MIN, activeMs: 10 * MIN }])
    expect(store.getSnapshot().state).toBeNull()
    expect(dev.data.has(timerKey('u1'))).toBe(false)
    // The next exercise: a fresh timer, not yesterday's.
    store.autoStart()
    expect(store.getSnapshot().state!.startedAt).toBe(t0 + 70 * MIN)
    // An exercise opened a day later saves the old timer first, even without a tick in between.
    dev.advance(MIN)
    store.activity()
    dev.advance(24 * HOUR)
    store.autoStart()
    expect(dev.saved).toHaveLength(2)
    expect(dev.saved[1]).toMatchObject({ startedAt: t0 + 70 * MIN, endedAt: t0 + 71 * MIN, activeMs: MIN })
    expect(store.getSnapshot().state!.startedAt).toBe(t0 + 71 * MIN + 24 * HOUR)
    expect(dev.errors).toEqual([])
  })

  it('drops a timer under a minute without saving, and a second tab does not save it twice', () => {
    const dev = fakeDevice()
    const tab1 = createTimerStore(dev.deps)
    const tab2 = createTimerStore(dev.deps)
    tab1.attachUser('u1')
    tab2.attachUser('u1')
    tab1.autoStart()
    dev.advance(40_000)
    tab1.activity()
    dev.advance(HOUR)
    tab1.checkIdle()
    expect(dev.saved).toEqual([])
    expect(tab1.getSnapshot().state).toBeNull()

    tab1.autoStart()
    dev.otherTabWrote(timerKey('u1'))
    study10(dev, tab1)
    dev.otherTabWrote(timerKey('u1'))
    dev.advance(HOUR)
    tab1.checkIdle()
    // Tab 2 still shows the old state (its storage event has not arrived yet): it re-reads and saves nothing.
    tab2.checkIdle()
    expect(dev.saved).toHaveLength(1)
    expect(tab2.getSnapshot().state).toBeNull()
  })

  it('keeps the timer and reports once when the save fails', () => {
    const dev = fakeDevice()
    let fail = true
    const store = createTimerStore({
      ...dev.deps,
      saveSession: (plan) => {
        if (fail) throw new Error('Progress is not loaded yet')
        dev.saved.push(plan)
      },
    })
    store.attachUser('u1')
    store.autoStart()
    study10(dev, store)
    dev.advance(HOUR)
    store.checkIdle()
    store.activity()
    store.activity()
    expect(dev.errors).toHaveLength(1)
    expect(dev.errors[0]).toMatch(/could not save its 10 min by itself.*Progress is not loaded yet/)
    expect(isIdlePaused(store.getSnapshot().state!)).toBe(true)
    fail = false
    store.checkIdle()
    expect(dev.saved).toHaveLength(1)
    expect(store.getSnapshot().state).toBeNull()
  })
})
