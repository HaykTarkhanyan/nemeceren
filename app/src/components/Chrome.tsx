// App frame: header with navigation, sync status, theme and settings buttons, the guest banner,
// error banner, voice warning.
import { Component } from 'react'
import type { ReactNode } from 'react'
import { dismissError, useErrors } from '../lib/errors.ts'
import { link } from '../lib/router.ts'
import { leaveGuest, useIsGuest } from '../lib/session.ts'
import { NO_VOICE_HELP, useSpeech } from '../lib/speech.ts'
import { nextTheme, setTheme, useTheme } from '../lib/theme.ts'
import type { Theme } from '../lib/theme.ts'
import { SyncStatusLine } from './SyncStatus.tsx'

export function Header({ route }: { route: string[] }) {
  const here = route[0] ?? ''
  const guest = useIsGuest()
  const nav: [string, string][] = [
    ['', 'Home'],
    ['lessons', 'Lessons'],
    ['topics', 'Topics'],
    ['words', 'Words'],
    ['extras', 'Extras'],
    // Guests cannot write notes: nothing of theirs is kept, and Claude could not read it.
    ...(guest ? [] : [['notes', 'Notes'] as [string, string]]),
    ['results', 'Results'],
    ['stats', 'Stats'],
  ]
  return (
    <header className="header">
      <div className="container header-inner">
        <a className="brand" href={link()}>
          Nemeceren
        </a>
        <nav className="nav">
          {nav.map(([path, label]) => (
            <a key={path} href={path ? link(path) : link()} className={here === path ? 'active' : ''}>
              {label}
            </a>
          ))}
        </nav>
        <div className="header-tools">
          {!guest && <SyncStatusLine compact />}
          <ThemeButton />
          <SettingsButton active={here === 'settings'} />
        </div>
      </div>
    </header>
  )
}

/** Settings as a gear icon, so the nav keeps 8 text links (DECISIONS.md #54). */
function SettingsButton({ active }: { active: boolean }) {
  return (
    <a
      className={`icon-btn ${active ? 'active' : ''}`}
      href={link('settings')}
      aria-label="Settings"
      title="Settings"
      aria-current={active ? 'page' : undefined}
    >
      {/* An 8-tooth gear with a hole (evenodd), centred in the 24 x 24 box. */}
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M9.96 4.89L10.44 2.12L13.56 2.12L14.04 4.89A7.4 7.4 0 0 1 15.59 5.53L17.88 3.91L20.09 6.12L18.47 8.41A7.4 7.4 0 0 1 19.11 9.96L21.88 10.44L21.88 13.56L19.11 14.04A7.4 7.4 0 0 1 18.47 15.59L20.09 17.88L17.88 20.09L15.59 18.47A7.4 7.4 0 0 1 14.04 19.11L13.56 21.88L10.44 21.88L9.96 19.11A7.4 7.4 0 0 1 8.41 18.47L6.12 20.09L3.91 17.88L5.53 15.59A7.4 7.4 0 0 1 4.89 14.04L2.12 13.56L2.12 10.44L4.89 9.96A7.4 7.4 0 0 1 5.53 8.41L3.91 6.12L6.12 3.91L8.41 5.53A7.4 7.4 0 0 1 9.96 4.89ZM15.2 12A3.2 3.2 0 1 0 8.8 12A3.2 3.2 0 1 0 15.2 12Z"
        />
      </svg>
    </a>
  )
}

/** On every page for a guest: nothing is saved. "Sign in" leaves guest mode (its progress is dropped). */
export function GuestBanner() {
  const guest = useIsGuest()
  if (!guest) return null
  return (
    <div className="guest-banner" role="note">
      <div className="container">
        Guest mode: nothing is saved. Sign in to keep your progress.{' '}
        <button type="button" className="link-btn" onClick={leaveGuest}>
          Sign in
        </button>
      </div>
    </div>
  )
}

const THEME_NAME: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }

/** Cycles System -> Light -> Dark; the icon shows the current choice. */
function ThemeButton() {
  const theme = useTheme()
  const next = nextTheme(theme)
  const label = `Theme: ${THEME_NAME[theme]}. Switch to ${THEME_NAME[next]}.`
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={() => setTheme(next)}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {theme === 'system' && (
          <>
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
            <path fill="currentColor" d="M12 4a8 8 0 0 1 0 16z" />
          </>
        )}
        {theme === 'light' && (
          <>
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            />
          </>
        )}
        {theme === 'dark' && <path fill="currentColor" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />}
      </svg>
    </button>
  )
}

export function ErrorBanner() {
  const errors = useErrors()
  if (errors.length === 0) return null
  return (
    <div className="container">
      {errors.map((e) => (
        <div key={e} className="alert error" role="alert">
          <span>{e}</span>
          <button type="button" className="btn small" onClick={() => dismissError(e)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}

export function VoiceWarning() {
  const speech = useSpeech()
  if (!speech.loaded) return null
  if (speech.supported && speech.voices.length > 0) return null
  return (
    <div className="container">
      <div className="alert warn" role="alert">
        {speech.supported
          ? NO_VOICE_HELP
          : 'This browser does not support speech synthesis, so German audio cannot play.'}
      </div>
    </div>
  )
}

/** Shows render errors instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="alert error" role="alert">
          <strong>Something broke on this page:</strong>
          <pre className="pre">{this.state.error.message}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
