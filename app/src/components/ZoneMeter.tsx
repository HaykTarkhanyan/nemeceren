// The zone meter in the daily mix and its end-screen summary (lib/zones.ts, DECISIONS.md #116).
// Shown only to the learners in lib/eggs.ts.
import { clock, toNextZone, zoneOf } from '../lib/zones.ts'
import type { Zone } from '../lib/zones.ts'

const ZONES: readonly Zone[] = [1, 2, 3, 4, 5]

export function ZoneMeter({ run }: { run: number }) {
  const zone = zoneOf(run)
  const next = toNextZone(run)
  return (
    <div className="zone-meter" role="status" aria-live="polite">
      {/* Keyed by zone, so the heartbeat animation runs again on every zone change. */}
      <strong key={zone} className={`zone-label zone-${zone}`}>
        Zone {zone}
      </strong>
      <span className="zone-bars" aria-hidden="true">
        {ZONES.map((z) => (
          <i key={z} className={z <= zone ? `on zone-${z}` : undefined} />
        ))}
      </span>
      <span className="muted small">{next === null ? 'Top zone!' : `${next} more right for Zone ${zone + 1}`}</span>
    </div>
  )
}

export function ZoneSummary({ times, top }: { times: readonly number[]; top: Zone }) {
  const longest = Math.max(1, ...times)
  return (
    <div className="card stack zone-summary">
      <p>
        <strong lang="de">Gut gelaufen!</strong> <span className="muted small">(It went well; literally "well run".)</span>
      </p>
      <p>
        Highest: Zone {top}, {clock(times[top - 1] ?? 0)} in it.
      </p>
      <div className="zone-chart">
        {[...ZONES].reverse().map((z) => (
          <div key={z} className="zone-row">
            <span className="small">Zone {z}</span>
            <span className="zone-track">
              <i className={`zone-${z}`} style={{ width: `${(100 * (times[z - 1] ?? 0)) / longest}%` }} />
            </span>
            <span className="small zone-time">{clock(times[z - 1] ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
