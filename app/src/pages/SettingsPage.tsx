import { SignOutButton } from '../components/AuthGate.tsx'
import { SyncStatusLine } from '../components/SyncStatus.tsx'
import { reportError } from '../lib/errors.ts'
import { RATES, updateSettings, useSettings } from '../lib/settings.ts'
import type { Settings } from '../lib/settings.ts'
import { pickVoice, speak, useSpeech } from '../lib/speech.ts'
import { leaveGuest, useSession } from '../lib/session.ts'

function save(patch: Partial<Settings>): void {
  try {
    updateSettings(patch)
  } catch (err) {
    reportError(err)
  }
}

export function SettingsPage() {
  const session = useSession()
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
        <h2>Typing</h2>
        <label className="field">
          <span className="label">Umlaut keys: 1 = ä, 2 = ö, 3 = ü, 4 = ß (Shift+1-3: Ä Ö Ü)</span>
          <select value={settings.umlautKeys} onChange={(e) => save({ umlautKeys: e.target.value as typeof settings.umlautKeys })}>
            <option value="answers">In answers (tests, exercises, word reviews)</option>
            <option value="everywhere">Everywhere, also in notes and my words</option>
            <option value="off">Off: digit keys type digits</option>
          </select>
        </label>
        <p className="muted small">
          Answers that need numbers keep real digits automatically, and the number pad always types digits.
        </p>
      </section>

      {session.phase === 'guest' ? (
        <section className="card stack">
          <h2>Account</h2>
          <p>Guest mode: nothing you do is saved, and a reload starts fresh. Sign in to keep your progress.</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={leaveGuest}>
              Sign in
            </button>
          </div>
          <p className="muted small">The settings on this page (voice, speed, new words per day) are stored per device, also in guest mode.</p>
        </section>
      ) : (
        <section className="card stack">
          <h2>Account and sync</h2>
          {session.phase === 'ready' && <p>Signed in as {session.user.email}.</p>}
          <p className="muted small">
            Your progress is saved to your account and is the same on every device. Changes are kept on this device first and sent after a test
            or a note, after a round of word reviews, every few minutes while you study, and when you leave the page.
          </p>
          <p>
            <SyncStatusLine />
          </p>
          <div className="row">
            <SignOutButton />
          </div>
          <p className="muted small">The settings on this page (voice, speed, new words per day) are stored per device.</p>
        </section>
      )}
    </div>
  )
}
