// The study timer (DECISIONS.md #62): Start, Pause/Resume and Stop in the header, so Hayk can time
// everything they study, in the app or not. Stop turns the running timer into a study session,
// which syncs like the rest of their progress (lib/storage.ts).
//   - The running timer is kept per device and per user in localStorage, so it survives a reload
//     and closing the tab, and a second tab shows the same timer (the "storage" event). A guest's
//     timer lives in memory only.
//   - Elapsed time comes from timestamps, never from counting ticks, so a sleeping laptop or a
//     background tab cannot make it drift.
// The pure functions below are tested in timer.test.ts; createTimerStore takes its storage, clock
// and event source as arguments, so the tests run without a browser.
import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { STUDY_LABEL_MAX, STUDY_SESSION_MAX_MS } from '../content/schema.ts'
import { messageOf, reportError } from './errors.ts'

/** A stop under 1 minute is not saved: "Discard this short session?" */
export const SHORT_SESSION_MS = 60_000
/** A stop over 3 hours asks "Did you study the whole ...?" with the minutes to correct. */
export const LONG_SESSION_MS = 3 * 60 * 60_000
export const MAX_SESSION_MINUTES = STUDY_SESSION_MAX_MS / 60_000

// ---------- the running timer ----------

export interface TimerState {
  /** When Start was pressed (ms since epoch). */
  startedAt: number
  /** Running time before the current stretch (ms). */
  activeMs: number
  /** Start of the current running stretch, or null while paused. */
  runningSince: number | null
  /** When it was paused, or null while running. */
  pausedAt: number | null
}

const TimerStateSchema = z
  .strictObject({
    startedAt: z.number().int().nonnegative(),
    activeMs: z.number().int().nonnegative(),
    runningSince: z.number().int().nonnegative().nullable(),
    pausedAt: z.number().int().nonnegative().nullable(),
  })
  .refine((s) => (s.runningSince === null) !== (s.pausedAt === null), { message: 'a timer is either running or paused' })

export function startTimer(now: number): TimerState {
  return { startedAt: now, activeMs: 0, runningSince: now, pausedAt: null }
}

export function isPaused(s: TimerState): boolean {
  return s.runningSince === null
}

/** Running time without pauses, up to `now`. A clock that went back adds nothing instead of subtracting. */
export function elapsedMs(s: TimerState, now: number): number {
  return s.activeMs + (s.runningSince === null ? 0 : Math.max(0, now - s.runningSince))
}

export function pauseTimer(s: TimerState, now: number): TimerState {
  if (s.runningSince === null) return s
  return { startedAt: s.startedAt, activeMs: elapsedMs(s, now), runningSince: null, pausedAt: now }
}

export function resumeTimer(s: TimerState, now: number): TimerState {
  if (s.runningSince !== null) return s
  return { startedAt: s.startedAt, activeMs: s.activeMs, runningSince: now, pausedAt: null }
}

/** The header's clock: "07:05" (mm:ss) under an hour, then "1:07:05" (h:mm:ss). */
export function clockText(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`
}

/** "45 min", "2 h 5 min", "under a minute". */
export function durationText(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (ms > 0 && min === 0) return 'under a minute'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h${min % 60 > 0 ? ` ${min % 60} min` : ''}`
}

export interface StopPlan {
  /** short: under 1 minute, not saved; long: over 3 hours, the minutes are asked again. */
  kind: 'short' | 'normal' | 'long'
  startedAt: number
  /** Stop pressed, or the moment it was paused (the study ended there). */
  endedAt: number
  activeMs: number
}

/** What Stop at `now` would save. */
export function planStop(s: TimerState, now: number): StopPlan {
  // A clock that went back before the start must not give a negative session.
  const endedAt = Math.max(s.startedAt, s.pausedAt ?? now)
  // Never more than the time from start to stop (only possible if the clock went back).
  const activeMs = Math.min(elapsedMs(s, endedAt), endedAt - s.startedAt)
  const kind = activeMs < SHORT_SESSION_MS ? 'short' : activeMs > LONG_SESSION_MS ? 'long' : 'normal'
  return { kind, startedAt: s.startedAt, endedAt, activeMs }
}

// ---------- sessions: minutes and labels typed by Hayk ----------

/**
 * The active time to save for `minutes` typed in a form, or the reason it cannot be saved.
 * `current` is the session's exact time: unchanged minutes keep it (no rounding on a label edit).
 * `spanMs` is the time from start to stop of a timed session, which the active time cannot exceed;
 * null for a session added by hand (its end follows its minutes).
 */
export function activeMsFor(minutes: number, current: number | null, spanMs: number | null): { activeMs: number } | { problem: string } {
  if (!Number.isInteger(minutes) || minutes < 1) return { problem: 'Enter whole minutes, at least 1.' }
  if (current !== null && minutes === Math.round(current / 60_000) && current <= STUDY_SESSION_MAX_MS && (spanMs === null || current <= spanMs)) {
    return { activeMs: current }
  }
  if (minutes > MAX_SESSION_MINUTES) return { problem: `At most ${MAX_SESSION_MINUTES} minutes (16 hours) per session.` }
  if (spanMs !== null && minutes * 60_000 > spanMs) {
    const most = Math.floor(spanMs / 60_000)
    return { problem: `This session ran ${durationText(spanMs)} from start to stop, so it can have at most ${most} minutes. Add more with "Add time by hand".` }
  }
  return { activeMs: minutes * 60_000 }
}

/** The label as saved: trimmed, and left out when empty. Throws with a message for Hayk when too long. */
export function cleanLabel(label: string): string | undefined {
  const t = label.trim()
  if (t.length > STUDY_LABEL_MAX) throw new Error(`A label can have at most ${STUDY_LABEL_MAX} characters; this one has ${t.length}.`)
  return t === '' ? undefined : t
}

/** The start of a session added by hand for `day`: local noon, a time every day has (also on clock-change days). */
export function manualStart(day: string): Date {
  const d = new Date(`${day}T12:00:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(d.getTime())) throw new Error(`"${day}" is not a date.`)
  return d
}

// ---------- the running timer on this device ----------

type TimerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface TimerDeps {
  /** Browser storage; getting it may throw when the browser blocks it. */
  storage: () => TimerStorage
  now: () => number
  reportError: (message: string) => void
  /** Calls back when browser storage changes in another tab (the "storage" event). Returns a stop function. */
  watch: (onChange: (key: string | null) => void) => () => void
}

export interface TimerSnapshot {
  /** Bound to a signed-in user or a guest; false before sign-in. */
  attached: boolean
  state: TimerState | null
}

export const timerKey = (userId: string) => `nemeceren.timer.${userId}`

export function createTimerStore(deps: TimerDeps) {
  let owner: { kind: 'none' } | { kind: 'guest' } | { kind: 'user'; key: string } = { kind: 'none' }
  let snapshot: TimerSnapshot = { attached: false, state: null }
  let unwatch: (() => void) | null = null
  const listeners = new Set<() => void>()

  function set(state: TimerState | null) {
    snapshot = { attached: owner.kind !== 'none', state }
    listeners.forEach((l) => l())
  }

  /** The timer saved on this device for the user; a damaged or unreadable one is reported and treated as none. */
  function read(key: string): TimerState | null {
    let raw: string | null
    try {
      raw = deps.storage().getItem(key)
    } catch (err) {
      deps.reportError(`The study timer cannot be read on this device (browser storage): ${messageOf(err)}`)
      return null
    }
    if (raw === null) return null
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch (err) {
      deps.reportError(`The study timer saved on this device ("${key}") is not valid JSON, so it was not restored: ${messageOf(err)}`)
      return null
    }
    const parsed = TimerStateSchema.safeParse(data)
    if (!parsed.success) {
      deps.reportError(`The study timer saved on this device ("${key}") is damaged, so it was not restored: ${parsed.error.message}`)
      return null
    }
    return parsed.data
  }

  /** Keeps the timer: in memory for a guest, in browser storage for a user (reported if the browser refuses). */
  function write(state: TimerState | null) {
    if (owner.kind === 'none') throw new Error('The study timer is not ready: sign in or continue as a guest first.')
    if (owner.kind === 'user') {
      try {
        const storage = deps.storage()
        if (state === null) storage.removeItem(owner.key)
        else storage.setItem(owner.key, JSON.stringify(state))
      } catch (err) {
        deps.reportError(
          state === null
            ? `The stopped study timer could not be removed from this device (browser storage): ${messageOf(err)}. If it shows up again after a reload, discard it.`
            : `The study timer could not be kept on this device (browser storage): ${messageOf(err)}. It goes on in this tab, but a reload or another tab will not see it.`,
        )
      }
    }
    set(state)
  }

  function detach() {
    unwatch?.()
    unwatch = null
    owner = { kind: 'none' }
    set(null)
  }

  return {
    /** A signed-in user: loads the timer kept on this device and follows changes made in other tabs. */
    attachUser(userId: string) {
      detach()
      const key = timerKey(userId)
      owner = { kind: 'user', key }
      unwatch = deps.watch((changed) => {
        if (changed === key || changed === null) set(read(key))
      })
      set(read(key))
    },
    /** A guest: the timer lives in memory only. Never touches browser storage. */
    attachGuest() {
      detach()
      owner = { kind: 'guest' }
      set(null)
    },
    detach,
    /** Starts timing, unless a timer already runs on this device (another tab): then that one is shown. */
    start() {
      if (owner.kind === 'user') {
        const there = read(owner.key)
        if (there) {
          set(there)
          return
        }
      }
      if (snapshot.state) return
      write(startTimer(deps.now()))
    },
    pause() {
      if (snapshot.state) write(pauseTimer(snapshot.state, deps.now()))
    },
    resume() {
      if (snapshot.state) write(resumeTimer(snapshot.state, deps.now()))
    },
    /** After the session was saved, or to discard it. */
    clear() {
      write(null)
    },
    getSnapshot: () => snapshot,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

export type TimerStore = ReturnType<typeof createTimerStore>

let store: TimerStore | null = null

/** The app's timer, created on first use (tests make their own with createTimerStore). */
export function timerStore(): TimerStore {
  if (store === null) {
    store = createTimerStore({
      storage: () => window.localStorage,
      now: () => Date.now(),
      reportError,
      watch(onChange) {
        const handler = (e: StorageEvent) => onChange(e.key)
        window.addEventListener('storage', handler)
        return () => window.removeEventListener('storage', handler)
      },
    })
  }
  return store
}

export function useTimer(): TimerSnapshot {
  const s = timerStore()
  return useSyncExternalStore(s.subscribe, s.getSnapshot)
}
