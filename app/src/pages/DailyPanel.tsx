// The top of Home: the light daily mode (DECISIONS.md #77). One big button runs the daily mix;
// below it, the single activities, and where the mix takes its new words from.
import { content } from '../content/load.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { link } from '../lib/router.ts'
import { updateSettings, useSettings } from '../lib/settings.ts'
import { useProgress } from '../lib/storage.ts'
import { currentMistakes, mixPlan, mixSummary } from './DailyPage.tsx'

export function DailyPanel() {
  const progress = useProgress()
  const settings = useSettings()
  const now = new Date()
  const plan = mixPlan(progress, settings, now)
  const mistakesDue = currentMistakes(progress, now).due.length
  function set(patch: Parameters<typeof updateSettings>[0]) {
    try {
      updateSettings(patch)
    } catch (err) {
      reportError(`Could not save the setting on this device: ${messageOf(err)}`)
    }
  }
  return (
    <section className="card stack daily-panel">
      <h2>Daily</h2>
      {plan.steps.length > 0 ? (
        <>
          <a className="btn primary daily-start" href={link('daily')}>
            Start the daily mix
          </a>
          <p className="muted small">{mixSummary(plan)}</p>
        </>
      ) : (
        <p className="muted">Nothing for the daily mix yet. Open the next lesson below, then come back.</p>
      )}
      <div className="daily-activities">
        <a className="btn" href={link('daily', 'match')}>
          Match pairs
        </a>
        <a className="btn" href={link('daily', 'listen')}>
          Listen and pick
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
            <option value="">The next lessons (learn their words before the lesson)</option>
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
      {plan.setProblem && <div className="alert warn">{plan.setProblem}</div>}
    </section>
  )
}
