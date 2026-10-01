// Study dashboard: streaks and study days, the study timer, word progress, and 30-day charts.
// All numbers come from the pure functions in lib/stats.ts; this page only loads and draws.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { content } from '../content/load.ts'
import { STUDY_LABEL_MAX } from '../content/schema.ts'
import { BarChart } from '../components/BarChart.tsx'
import type { BarDatum } from '../components/BarChart.tsx'
import { localDay } from '../lib/dates.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { link } from '../lib/router.ts'
import {
  dailyStats,
  daysThisWeekAndMonth,
  KNOWN_DAYS,
  lastDays,
  lastTimerDays,
  REVIEW_CAP_MS,
  SESSION_GAP_MS,
  streaks,
  studyDays,
  TEST_ITEM_CAP_MS,
  timerByDay,
  timerTotals,
  wordProgress,
} from '../lib/stats.ts'
import type { DayStats } from '../lib/stats.ts'
import { contentRunway, runwayText } from '../lib/plan.ts'
import { useIsGuest } from '../lib/session.ts'
import { useSettings } from '../lib/settings.ts'
import { activityOf, addManualStudySession, deleteStudySession, editStudySession, STATE_DAYS, useProgress } from '../lib/storage.ts'
import type { ProgressView, StudySessionView } from '../lib/storage.ts'
import { durationText, LONG_SESSION_MS, MAX_SESSION_MINUTES, SHORT_SESSION_MS } from '../lib/timer.ts'

/**
 * Study days: the all-time list from the server plus the days in the loaded events (which
 * include changes not synced yet). The events only cover the last weeks. Days with a timer
 * session are in the list already (the server's and the outbox's, lib/outbox.ts).
 */
function allStudyDays(p: ProgressView, days: Map<string, DayStats>): Set<string> {
  return new Set([...p.studyDays, ...studyDays(days)])
}

function dayTitle(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** "29.9." under every 7th bar, counted back from today. */
function axisLabel(day: string, i: number, n: number): string {
  return (n - 1 - i) % 7 === 0 ? `${Number(day.slice(8))}.${Number(day.slice(5, 7))}.` : ''
}

function minutesLabel(ms: number): string {
  if (ms <= 0) return ''
  const min = ms / 60_000
  return min < 1 ? '<1' : String(Math.round(min))
}

function totalMinutesText(ms: number): string {
  if (ms <= 0) return 'No study time measured yet.'
  if (ms < 60_000) return 'Under a minute in total.'
  const min = Math.round(ms / 60_000)
  return `${min} minute${min === 1 ? '' : 's'} in total.`
}

function secondsText(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)} min ${s % 60} s`
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <div className="stat-num">{value}</div>
      <div className="muted small">{label}</div>
    </div>
  )
}

export function StatsPage() {
  const progress = useProgress()
  const settings = useSettings()
  const guest = useIsGuest()
  const state = progress.reviewState
  const activity = activityOf(progress)

  const now = new Date()
  const today = localDay(now)
  const days = dailyStats(activity.reviews, activity.testItems)
  const study = allStudyDays(progress, days)
  const streak = streaks(study, today)
  const cal = daysThisWeekAndMonth(study, today)
  const last30 = lastDays(days, today, 30)
  const words = wordProgress(content.words, state, now)
  const untimed = [...days.values()].reduce((s, d) => s + d.untimed, 0)
  const sum = (f: (d: DayStats) => number) => last30.reduce((s, d) => s + f(d), 0)
  const reviews30 = sum((d) => d.reviews)
  const correct30 = sum((d) => d.correct)
  const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0)

  const timerDays = timerByDay(progress.studySessions)
  const timer30 = lastTimerDays(timerDays, today, 30)
  const timer = timerTotals(timerDays, today, 30)

  const reviewBars: BarDatum[] = last30.map((d, i) => ({
    key: d.day,
    axisLabel: axisLabel(d.day, i, last30.length),
    label: d.reviews > 0 ? String(d.reviews) : '',
    segments: [
      { value: d.correct, tone: 'a' },
      { value: d.reviews - d.correct, tone: 'b' },
    ],
    tooltip:
      d.reviews > 0
        ? [
            dayTitle(d.day),
            `${d.reviews} review${d.reviews === 1 ? '' : 's'}`,
            `${d.correct} correct (${pct(d.correct, d.reviews)}%)`,
            `${d.reviews - d.correct} Again`,
            ...(d.practice > 0 ? [`+${d.practice} practice`] : []),
          ]
        : [dayTitle(d.day), 'no reviews', ...(d.practice > 0 ? [`+${d.practice} practice`] : [])],
  }))
  const sessionBars: BarDatum[] = last30.map((d, i) => ({
    key: d.day,
    axisLabel: axisLabel(d.day, i, last30.length),
    label: d.sessions > 0 ? String(d.sessions) : '',
    segments: [{ value: d.sessions, tone: 'a' }],
    tooltip: [dayTitle(d.day), `${d.sessions} session${d.sessions === 1 ? '' : 's'}`],
  }))
  const minuteBars: BarDatum[] = last30.map((d, i) => ({
    key: d.day,
    axisLabel: axisLabel(d.day, i, last30.length),
    label: minutesLabel(d.activeMs),
    segments: [{ value: d.activeMs, tone: 'a' }],
    tooltip: [dayTitle(d.day), secondsText(d.activeMs)],
  }))
  const timerBars: BarDatum[] = timer30.map((d, i) => ({
    key: d.day,
    axisLabel: axisLabel(d.day, i, timer30.length),
    label: minutesLabel(d.activeMs),
    segments: [{ value: d.activeMs, tone: 'a' }],
    tooltip:
      d.sessions > 0
        ? [dayTitle(d.day), `${durationText(d.activeMs)}`, `${d.sessions} timer session${d.sessions === 1 ? '' : 's'}`]
        : [dayTitle(d.day), 'no timer sessions'],
  }))

  return (
    <div className="stack">
      <h1>Stats</h1>
      {guest && <p className="warn-text small">Guest mode: these numbers cover only this session. Nothing is saved.</p>}

      <section className="card stack">
        <h2>Study days</h2>
        <div className="stats stats-4">
          <Tile value={streak.current} label={`day streak${streak.current > 0 && !study.has(today) ? ' (study today to keep it)' : ''}`} />
          <Tile value={streak.longest} label="longest streak" />
          <Tile value={`${cal.week}/7`} label="days this week" />
          <Tile value={cal.month} label="days this month" />
        </div>
      </section>

      <section className="card stack">
        <h2>Study timer</h2>
        <p className="muted small">
          The time you timed yourself with the timer at the top of the page, or added by hand: lessons, videos, a book, anything. Pauses are not
          counted.
        </p>
        <div className="stats stats-4">
          <Tile value={durationText(timer.todayMs)} label="today" />
          <Tile value={durationText(timer.weekMs)} label="this week" />
          <Tile value={durationText(timer.monthMs)} label="this month" />
          <Tile
            value={timer.averageMs === null ? '-' : durationText(timer.averageMs)}
            label={`per day with the timer (last 30 days: ${timer.daysWithSession} day${timer.daysWithSession === 1 ? '' : 's'})`}
          />
        </div>
        <h3 className="chart-title">Timer minutes per day, last 30 days</h3>
        <BarChart data={timerBars} ariaLabel="Minutes timed with the study timer per day over the last 30 days" />
        <AddTimeForm today={today} />
        <SessionList sessions={progress.studySessions} />
      </section>

      <section className="card stack">
        <h2>Words</h2>
        <div className="stats stats-4">
          <Tile value={`${words.introduced}/${words.total}`} label="introduced" />
          <Tile value={words.learning} label="learning" />
          <Tile value={words.known} label={`known (${KNOWN_DAYS}+ days)`} />
          <Tile value={words.dueToday} label="due today" />
        </div>
        <h3 className="chart-title">Reviews per day, last 30 days</h3>
        <p className="muted small">
          {reviews30} reviews, {pct(correct30, reviews30)}% correct (anything but Again).
        </p>
        <BarChart
          data={reviewBars}
          ariaLabel="Word reviews per day over the last 30 days, split into correct and Again"
          legend={[
            { tone: 'a', name: 'correct' },
            { tone: 'b', name: 'Again' },
          ]}
        />
      </section>

      <section className="card stack">
        <h2>Measured activity</h2>
        <p className="muted small">
          Measured by the app itself, on word reviews and tests only: the time on each card and test item. Compare it with the timer above, which
          counts everything you time.
        </p>
        <h3 className="chart-title">Activity sessions per day, last 30 days</h3>
        <BarChart data={sessionBars} ariaLabel="Measured activity sessions per day over the last 30 days" height={70} />
        <h3 className="chart-title">Measured minutes per day, last 30 days</h3>
        <p className="muted small">{totalMinutesText(sum((d) => d.activeMs))}</p>
        <BarChart data={minuteBars} ariaLabel="Measured minutes of reviews and tests per day over the last 30 days" />
        {untimed > 0 && (
          <p className="muted small">
            {untimed} review{untimed === 1 ? ' was' : 's were'} logged before review times were recorded (2026-09-29), so {untimed === 1 ? 'it is' : 'they are'} not in the minutes.
          </p>
        )}
      </section>

      <section className="card stack">
        <h2>Prepared material left</h2>
        <p className="small">
          {runwayText(
            contentRunway(
              content,
              progress.lessonProgress,
              state,
              progress.results.map((r) => r.result),
              settings.newPerDay,
            ),
            settings.newPerDay,
          )}
          .
        </p>
        <p className="muted small">When any of this runs low, ask Claude to prepare more.</p>
      </section>

      <details className="card">
        <summary>How these are counted</summary>
        <ul className="small">
          <li>
            A study day is a day with at least one word review (practice included), one answered test item (lesson exercises and listening practice
            included), or one timer session (also one added by hand), in your local time when you did it.
          </li>
          <li>The streak counts study days in a row up to today; before you study today it still counts up to yesterday.</li>
          <li>
            Timer minutes are the time the study timer ran, without pauses, on the day the session started. A stop under {SHORT_SESSION_MS / 60_000}{' '}
            minute is not saved, and a session over {LONG_SESSION_MS / 3_600_000} hours asks you to confirm its minutes.
          </li>
          <li>Practice of weak words counts as measured time and activity sessions, but not in the reviews chart, because it does not change the schedule.</li>
          <li>An activity session is a stretch of reviews and tests with no break of {SESSION_GAP_MS / 60_000} minutes or more. It counts on the day it started.</li>
          <li>
            Measured minutes are the time on each word card (at most {REVIEW_CAP_MS / 60_000} min per card) and on each test item (at most {TEST_ITEM_CAP_MS / 60_000} min per item), so a
            card left open does not count as study time.
          </li>
          <li>A word is known once its review interval is {KNOWN_DAYS} days or more; every other reviewed word is still learning.</li>
        </ul>
      </details>

      <p className="small">
        <a href={link('words')}>Review words</a> or <a href={link()}>take a test</a>.
      </p>
    </div>
  )
}

/** "Add time by hand": study done without the timer (a book, a class). */
function AddTimeForm({ today }: { today: string }) {
  const [day, setDay] = useState(today)
  const [minutes, setMinutes] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(null)
    try {
      addManualStudySession(day, Number(minutes), label)
      setDone(`Added ${durationText(Number(minutes) * 60_000)} on ${dayTitle(day)}.`)
      setMinutes('')
      setLabel('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <details>
      <summary>Add time by hand</summary>
      <form className="stack add-time" onSubmit={add}>
        <p className="muted small">For study without the timer. It counts like a timer session, also for the streak.</p>
        <div className="row">
          <label className="field">
            <span className="label">Day</span>
            <input type="date" value={day} max={today} required onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Minutes</span>
            <input
              type="number"
              inputMode="numeric"
              className="timer-minutes"
              min={1}
              max={MAX_SESSION_MINUTES}
              step={1}
              required
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span className="label">Label (optional)</span>
          <input type="text" maxLength={STUDY_LABEL_MAX} placeholder="e.g. Schritte, page 12" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {done && (
          <p className="small" role="status">
            {done}
          </p>
        )}
        <div>
          <button type="submit" className="btn small primary">
            Add
          </button>
        </div>
      </form>
    </details>
  )
}

const SHOWN = 10

function SessionList({ sessions }: { sessions: StudySessionView[] }) {
  const [showAll, setShowAll] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const shown = showAll ? sessions : sessions.slice(0, SHOWN)
  return (
    <div className="stack">
      <h3 className="chart-title">Recent sessions</h3>
      {sessions.length === 0 ? (
        <p className="muted small">No timer sessions in the last {STATE_DAYS} days.</p>
      ) : (
        <ul className="session-list">
          {shown.map((x) =>
            editing === x.id ? (
              <SessionEditor key={x.id} session={x} onDone={() => setEditing(null)} />
            ) : (
              <SessionRow key={x.id} session={x} onEdit={() => setEditing(x.id)} />
            ),
          )}
        </ul>
      )}
      {sessions.length > SHOWN && (
        <div>
          <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer' : `Show all ${sessions.length} sessions of the last ${STATE_DAYS} days`}
          </button>
        </div>
      )}
    </div>
  )
}

function SessionRow({ session: x, onEdit }: { session: StudySessionView; onEdit: () => void }) {
  function remove() {
    if (!window.confirm(`Delete this session (${durationText(x.activeMs)} on ${dayTitle(x.localDay)})?`)) return
    try {
      deleteStudySession(x.id)
    } catch (err) {
      reportError(err)
    }
  }
  return (
    <li className="session-row">
      <div>
        <strong>{durationText(x.activeMs)}</strong>{' '}
        <span className="muted small">
          {dayTitle(x.localDay)}, {x.manual ? 'added by hand' : `${timeOfDay(x.startedAt)} to ${timeOfDay(x.endedAt)}`}
        </span>
        {x.label && <div className="small">{x.label}</div>}
      </div>
      <span className="row">
        {x.pending && <span className="badge warn">Not synced yet</span>}
        <button type="button" className="btn small" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="btn small" onClick={remove}>
          Delete
        </button>
      </span>
    </li>
  )
}

function SessionEditor({ session: x, onDone }: { session: StudySessionView; onDone: () => void }) {
  const [minutes, setMinutes] = useState(String(Math.round(x.activeMs / 60_000)))
  const [label, setLabel] = useState(x.label ?? '')
  const [error, setError] = useState<string | null>(null)

  function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      editStudySession(x.id, Number(minutes), label)
      onDone()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <li className="session-row editing">
      <form className="stack" onSubmit={save} aria-label={`Edit the session of ${dayTitle(x.localDay)}`}>
        <span className="muted small">
          {dayTitle(x.localDay)}, {x.manual ? 'added by hand' : `${timeOfDay(x.startedAt)} to ${timeOfDay(x.endedAt)}`}
        </span>
        <div className="row">
          <label className="field">
            <span className="label">Minutes</span>
            <input
              type="number"
              inputMode="numeric"
              className="timer-minutes"
              min={1}
              max={MAX_SESSION_MINUTES}
              step={1}
              required
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <label className="field grow">
            <span className="label">Label (optional)</span>
            <input type="text" maxLength={STUDY_LABEL_MAX} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="row">
          <button type="submit" className="btn small primary">
            Save
          </button>
          <button type="button" className="btn small" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </li>
  )
}

/** One line for Home: the current streak, with a link to the Stats page. */
export function StreakLine() {
  const progress = useProgress()
  const activity = activityOf(progress)
  const today = localDay(new Date())
  const study = allStudyDays(progress, dailyStats(activity.reviews, activity.testItems))
  const s = streaks(study, today)
  const cal = daysThisWeekAndMonth(study, today)
  return (
    <p className="streak-line">
      <strong>
        {s.current} day{s.current === 1 ? '' : 's'}
      </strong>{' '}
      streak (longest {s.longest}), {cal.week} study day{cal.week === 1 ? '' : 's'} this week. <a href={link('stats')}>See your stats</a>
    </p>
  )
}
