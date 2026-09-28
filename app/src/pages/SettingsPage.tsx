import { ModeBadge } from '../components/Chrome.tsx'
import { reportError } from '../lib/errors.ts'
import { RATES, updateSettings, useSettings } from '../lib/settings.ts'
import type { Settings } from '../lib/settings.ts'
import { pickVoice, speak, useSpeech } from '../lib/speech.ts'
import { SAVE_MODE } from '../lib/storage.ts'

function save(patch: Partial<Settings>): void {
  try {
    updateSettings(patch)
  } catch (err) {
    reportError(err)
  }
}

export function SettingsPage() {
  const settings = useSettings()
  const speech = useSpeech()
  const active = pickVoice(speech.voices, settings.voiceURI)
  const savedMissing = settings.voiceURI !== null && active?.voiceURI !== settings.voiceURI

  return (
    <div className="stack">
      <h1>Settings</h1>

      <section className="card stack">
        <h2>Voice</h2>
        {!speech.loaded && <p className="muted">Looking for voices...</p>}
        {speech.loaded && speech.voices.length === 0 && (
          <p className="warn-text">No German voice available (see the warning above).</p>
        )}
        {speech.voices.length > 0 && (
          <label className="field">
            <span className="label">German voice</span>
            <select value={active?.voiceURI ?? ''} onChange={(e) => save({ voiceURI: e.target.value })}>
              {speech.voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        )}
        {savedMissing && active && (
          <p className="warn-text small">Your saved voice is not on this device; using {active.name}.</p>
        )}
        <div className="field">
          <span className="label">Speed</span>
          <div className="row">
            {RATES.map((r) => (
              <label key={r} className="radio">
                <input type="radio" name="rate" checked={settings.rate === r} onChange={() => save({ rate: r })} /> {r.toFixed(2).replace(/0$/, '')}
              </label>
            ))}
          </div>
        </div>
        <div>
          <button type="button" className="btn" onClick={() => speak('Guten Tag! Mein Termin ist am Montag um neun Uhr.')}>
            Test the voice
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>Words</h2>
        <label className="field">
          <span className="label">New words per day</span>
          <input
            type="number"
            min={0}
            max={100}
            value={settings.newPerDay}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isInteger(n) && n >= 0 && n <= 100) save({ newPerDay: n })
            }}
          />
        </label>
      </section>

      <section className="card stack">
        <h2>Where your work is saved</h2>
        <p>
          <ModeBadge />
        </p>
        <p className="muted">
          {SAVE_MODE === 'repo'
            ? 'Local mode: test results go to progress/results/, word reviews to progress/review-state.json and progress/review-log.jsonl in the repo.'
            : 'Phone mode: results and reviews stay in this browser and are not synced. Word reviews started from the state the PC had at the last push.'}
        </p>
        <p className="muted small">The settings on this page are stored per device.</p>
      </section>
    </div>
  )
}
