// The study timer in the header (DECISIONS.md #62). Idle: a start button. Running: the time so far
// (without pauses) with pause/resume and stop. Stop opens a panel under the header bar: a label
// and Save; under 1 minute only "Discard this short session?"; over 3 hours the minutes are asked
// again. Nothing is saved until Save, so "Keep timing" goes back to the running timer.
// The state lives in lib/timer.ts (per device and user, or in memory for a guest); a saved session
// goes into the outbox and syncs at once (lib/storage.ts).
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { STUDY_LABEL_MAX } from '../content/schema.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { saveStudySession } from '../lib/storage.ts'
import { activeMsFor, clockText, durationText, elapsedMs, isPaused, MAX_SESSION_MINUTES, planStop, timerStore, useTimer } from '../lib/timer.ts'
import type { StopPlan, TimerState } from '../lib/timer.ts'

/** The current time, renewed just after each new second of the shown time, only while running and visible. */
function useSecondTick(state: TimerState | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!state || state.runningSince === null) {
      setNow(Date.now())
      return
    }
    let timeout: number | null = null
    const tick = () => {
      if (timeout !== null) window.clearTimeout(timeout)
      timeout = null
      const t = Date.now()
      setNow(t)
      // A hidden tab does not redraw; coming back recomputes the time from the timestamps.
      if (document.visibilityState !== 'visible') return
      timeout = window.setTimeout(tick, 1000 - (elapsedMs(state, t) % 1000) + 15)
    }
    tick()
    document.addEventListener('visibilitychange', tick)
    return () => {
      document.removeEventListener('visibilitychange', tick)
      if (timeout !== null) window.clearTimeout(timeout)
    }
  }, [state])
  return now
}

function act(fn: () => void) {
  try {
    fn()
  } catch (err) {
    reportError(err)
  }
}

function Icon({ kind }: { kind: 'start' | 'pause' | 'resume' | 'stop' }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      {kind === 'start' && (
        <>
          {/* A stopwatch. */}
          <circle cx="12" cy="13.5" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M9.5 2.5h5M12 2.5v3.5M12 13.5V9.5M18.2 6.6l1.6-1.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {kind === 'pause' && <path fill="currentColor" d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z" />}
      {kind === 'resume' && <path fill="currentColor" d="M8 4.5v15l12-7.5z" />}
      {kind === 'stop' && <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />}
    </svg>
  )
}

/** The timer's place in the header, next to the sync dot. `onStop` opens the stop panel with what Stop would save. */
export function HeaderTimer({ onStop, stopping }: { onStop: (plan: StopPlan) => void; stopping: boolean }) {
  const { attached, state } = useTimer()
  const now = useSecondTick(state)
  if (!attached) return null
  const store = timerStore()
  if (!state) {
    return (
      <button type="button" className="icon-btn" aria-label="Start study timer" title="Start study timer" onClick={() => act(() => store.start())}>
        <Icon kind="start" />
      </button>
    )
  }
  const paused = isPaused(state)
  const pauseLabel = paused ? 'Resume study timer' : 'Pause study timer'
  return (
    <span className={`timer ${paused ? 'paused' : ''}`}>
      <button type="button" className="timer-btn" aria-label={pauseLabel} title={pauseLabel} onClick={() => act(() => (paused ? store.resume() : store.pause()))}>
        <Icon kind={paused ? 'resume' : 'pause'} />
      </button>
      <span className="timer-time" role="timer" title={paused ? 'Study timer paused' : 'Study time so far, without pauses'}>
        {clockText(elapsedMs(state, now))}
        {paused && <span className="visually-hidden"> (paused)</span>}
      </span>
      <button
        type="button"
        className="timer-btn"
        aria-label="Stop study timer"
        title="Stop study timer"
        aria-expanded={stopping}
        onClick={() => onStop(planStop(state, Date.now()))}
      >
        <Icon kind="stop" />
      </button>
    </span>
  )
}

function timeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Under the header bar while Stop is open: save (with an optional label), keep timing, or discard. */
export function TimerStopPanel({ plan, onClose }: { plan: StopPlan; onClose: () => void }) {
  const { state } = useTimer()
  const [label, setLabel] = useState('')
  const [minutes, setMinutes] = useState(() => String(Math.round(plan.activeMs / 60_000)))
  const [error, setError] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)
  const discardRef = useRef<HTMLButtonElement>(null)
  const spanMs = plan.endedAt - plan.startedAt

  useEffect(() => {
    if (plan.kind === 'short') discardRef.current?.focus()
    else firstRef.current?.focus()
  }, [plan.kind])

  // Stopped or discarded in another tab meanwhile: there is nothing left to save here.
  const gone = !state || state.startedAt !== plan.startedAt
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])

  function discard() {
    // One click must not throw away a long session; the short one is the question itself.
    if (plan.kind !== 'short' && !window.confirm(`Discard ${durationText(plan.activeMs)} of study? It will not be saved.`)) return
    act(() => timerStore().clear())
    onClose()
  }

  function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    let activeMs = plan.activeMs
    if (plan.kind === 'long') {
      const r = activeMsFor(Number(minutes), plan.activeMs, spanMs)
      if ('problem' in r) {
        setError(r.problem)
        return
      }
      activeMs = r.activeMs
    }
    try {
      saveStudySession({ startedAt: new Date(plan.startedAt).toISOString(), endedAt: new Date(plan.endedAt).toISOString(), activeMs, label })
    } catch (err) {
      setError(messageOf(err))
      return
    }
    act(() => timerStore().clear())
    onClose()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  const when = `from ${timeOfDay(plan.startedAt)} to ${timeOfDay(plan.endedAt)}`
  const keep = (
    <button type="button" className="btn small" onClick={onClose}>
      Keep timing
    </button>
  )

  if (plan.kind === 'short') {
    return (
      <div className="container timer-panel">
        <section className="card stack" aria-label="Stop the study timer" onKeyDown={onKey}>
          <p>
            <strong>Discard this short session?</strong> {clockText(plan.activeMs)} so far. Sessions under 1 minute are not saved.
          </p>
          <div className="row">
            <button ref={discardRef} type="button" className="btn small primary" onClick={discard}>
              Discard
            </button>
            {keep}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="container timer-panel">
      <form className="card stack" aria-label="Stop the study timer" onSubmit={save} onKeyDown={onKey}>
        {plan.kind === 'long' ? (
          <>
            <p>
              <strong>Did you study the whole {durationText(plan.activeMs)}?</strong> Correct it here ({when}).
            </p>
            <label className="field">
              <span className="label">Minutes studied</span>
              <input
                ref={firstRef}
                type="number"
                inputMode="numeric"
                className="timer-minutes"
                min={1}
                max={Math.min(MAX_SESSION_MINUTES, Math.floor(spanMs / 60_000))}
                step={1}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </label>
          </>
        ) : (
          <p>
            <strong>Save {durationText(plan.activeMs)} of study</strong> ({when}).
          </p>
        )}
        <label className="field">
          <span className="label">Label (optional)</span>
          <input
            ref={plan.kind === 'long' ? undefined : firstRef}
            type="text"
            maxLength={STUDY_LABEL_MAX}
            placeholder="e.g. lesson 0.3"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="row">
          <button type="submit" className="btn small primary">
            Save
          </button>
          {keep}
          <button type="button" className="btn small" onClick={discard}>
            Discard
          </button>
        </div>
      </form>
    </div>
  )
}
