// The top of the path Home (DECISIONS.md #77, #83): the daily goal (1 station or the daily mix) with
// its ring, the streak and freezes, the daily mix's Start button, and, folded away, the single
// activities and where the mix takes its new words from.
import { content } from '../content/load.ts'
import { memo } from 'react'
import { MIX } from '../lib/daily.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { MAX_FREEZES, MILESTONES } from '../lib/goal.ts'
import type { GoalStreak } from '../lib/goal.ts'
import { link } from '../lib/router.ts'
import { updateSettings, useSettings } from '../lib/settings.ts'
import { useSpeech } from '../lib/speech.ts'
import { counts } from '../lib/srs.ts'
import { useProgress } from '../lib/storage.ts'
import { canListen, currentMistakes, GAME_LABEL, mixPlan, mixSummary, PRACTICE_GAMES, studyPool } from './DailyPage.tsx'

const RING_R = 18
const RING_C = 2 * Math.PI * RING_R

function GoalRing({ met }: { met: boolean }) {
  return (
    <svg className="goal-ring" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r={RING_R} fill="none" stroke="var(--border)" strokeWidth="5" />
      <circle
        cx="22"
        cy="22"
        r={RING_R}
        fill="none"
        stroke="var(--ok)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={RING_C}
        strokeDashoffset={met ? 0 : RING_C}
        transform="rotate(-90 22 22)"
      />
      {met && <path d="M14.5 22.5l5 5 10-11" fill="none" stroke="var(--ok)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

/** Memoised: opening a station's sheet does not recompute the mix plan. */
export const DailyCard = memo(function DailyCard({ goal }: { goal: GoalStreak }) {
  const progress = useProgress()
  const settings = useSettings()
  const now = new Date()
  const plan = mixPlan(progress, settings, now, canListen(useSpeech()))
  const mistakesDue = currentMistakes(progress, now).due.length
  const due = counts(studyPool(progress), progress.reviewState, now, settings.newPerDay).due
  const nextMilestone = MILESTONES.find((m) => m > goal.current)
  function set(patch: Parameters<typeof updateSettings>[0]) {
    try {
      updateSettings(patch)
    } catch (err) {
      reportError(`Could not save the setting on this device: ${messageOf(err)}`)
    }
  }
  return (
    <section className="card stack daily-card">
      <div className="goal-row">
        <GoalRing met={goal.todayMet} />
        <div className="goal-text">
          <strong>{goal.todayMet ? 'Goal done for today' : 'Today: 1 station or the daily mix'}</strong>
          <span className="muted small">{goal.todayMet ? 'Anything more is a bonus.' : 'Do one to keep your streak.'}</span>
        </div>
      </div>
      <p className="streak-row small">
        <span>
          <strong>{goal.current}</strong> day{goal.current === 1 ? '' : 's'} streak
        </span>
        <span>
          <strong>{goal.freezes}</strong>/{MAX_FREEZES} freezes
        </span>
        {nextMilestone !== undefined && (
          <span className="muted">
            {nextMilestone - goal.current} to the {nextMilestone}-day mark
          </span>
        )}
      </p>
      <div className="mix-row">
        {plan.steps.length > 0 ? (
          <>
            <span className="muted small">{mixSummary(plan)}</span>
            <a className="btn primary" href={link('daily')}>
              Start the daily mix
            </a>
          </>
        ) : (
          <span className="muted small">Nothing for the daily mix yet. Open the next station below, then come back.</span>
        )}
      </div>
      {due > 0 && (
        <p className="small">
          <a href={link('words')}>
            {due} review{due === 1 ? '' : 's'} due
          </a>{' '}
          on the Words page (the mix takes up to {MIX.maxReviews}).
        </p>
      )}
      <details className="more-practice">
        <summary>More practice</summary>
        <div className="stack">
          <div className="daily-activities">
            <a className="btn" href={link('daily', 'match')}>
              Match pairs
            </a>
            <a className="btn" href={link('daily', 'listen')}>
              Listen and pick
            </a>
            {PRACTICE_GAMES.map((g) => (
              <a key={g} className="btn" href={link('daily', g)}>
                {GAME_LABEL[g]}
              </a>
            ))}
            <a className="btn" href={link('words', 'map')}>
              Words map
            </a>
            <a className="btn" href={link('words', 'sets')}>
              Word sets
            </a>
            <a className="btn" href={link('words', 'all')}>
              My words list
            </a>
            <a className="btn" href={link('daily', 'mistakes')}>
              {mistakesDue > 0 ? `Your mistakes (${mistakesDue})` : 'Your mistakes'}
            </a>
          </div>
          <div className="daily-options">
            <label className="field">
              <span className="label">New words from</span>
              <select value={settings.activeSet ?? ''} onChange={(e) => set({ activeSet: e.target.value === '' ? null : e.target.value })}>
                <option value="">The path (the lesson you are at, then the next one)</option>
                {content.sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    Word set: {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Reviews in the mix</span>
              <select value={settings.dailyMode} onChange={(e) => set({ dailyMode: e.target.value === 'production' ? 'production' : 'recognition' })}>
                <option value="recognition">Flip cards (German to English)</option>
                <option value="production">Type the German (English to German)</option>
              </select>
            </label>
          </div>
        </div>
      </details>
      {plan.setProblem && <div className="alert warn">{plan.setProblem}</div>}
    </section>
  )
})
