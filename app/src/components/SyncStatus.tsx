// Where the progress stands: "Synced 2 min ago", "3 changes not synced", "Offline, will sync",
// or the error, with a "Sync now" button when there is something to send.
import { useEffect, useState } from 'react'
import { link } from '../lib/router.ts'
import { syncNow, useSyncStatus } from '../lib/storage.ts'
import type { SyncStatus } from '../lib/storage.ts'

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function agoText(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  return `${Math.floor(min / 60)} h ago`
}

export function syncText(s: SyncStatus, now: number): string {
  if (s.phase === 'syncing') return 'Syncing...'
  if (s.phase === 'error') return s.error ?? 'Sync failed'
  if (s.phase === 'offline') return s.pending > 0 ? `Offline, will sync (${plural(s.pending, 'change')})` : 'Offline'
  if (s.pending > 0) return `${plural(s.pending, 'change')} not synced`
  if (s.lastSyncAt !== null) return `Synced ${agoText(now - s.lastSyncAt)}`
  return s.fromCache ? 'Offline copy' : 'All synced'
}

function tone(s: SyncStatus): string {
  if (s.phase === 'error') return 'bad'
  if (s.phase === 'offline' || s.pending > 0) return 'warn'
  return 'ok'
}

/**
 * The status with a "Sync now" button. `compact` (the header) shows only a coloured dot, with the
 * text as its tooltip, and "Sync now" as an icon; the dot links to Settings, where the full line is.
 */
export function SyncStatusLine({ compact = false }: { compact?: boolean }) {
  const s = useSyncStatus()
  const [now, setNow] = useState(() => Date.now())
  // Only redraws "2 min ago"; never makes a request.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  const text = syncText(s, now)
  const canSync = s.phase !== 'syncing' && (s.pending > 0 || s.phase === 'error')
  return (
    <span className="sync-line">
      {compact ? (
        <a className={`sync-dot ${tone(s)}`} href={link('settings')} title={text} aria-label={`Sync: ${text}`} />
      ) : (
        <span className={`badge ${tone(s)}`} title={s.error ?? undefined} role="status">
          {text}
        </span>
      )}
      {canSync &&
        (compact ? (
          // An icon in the header, so the timer fits on one line from 900 px (DECISIONS.md #63).
          <button type="button" className="icon-btn" aria-label="Sync now" title={`Sync now: ${text}`} onClick={() => void syncNow()}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M19.5 10A8 8 0 0 0 5.6 7M4.5 14a8 8 0 0 0 13.9 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path fill="currentColor" d="M3.5 3.5v6h6zM20.5 20.5v-6h-6z" />
            </svg>
          </button>
        ) : (
          <button type="button" className="btn small" onClick={() => void syncNow()}>
            Sync now
          </button>
        ))}
    </span>
  )
}
