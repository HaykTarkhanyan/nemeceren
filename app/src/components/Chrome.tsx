// App frame: header with navigation, sync status and theme button, error banner, voice warning.
import { Component } from 'react'
import type { ReactNode } from 'react'
import { dismissError, useErrors } from '../lib/errors.ts'
import { link } from '../lib/router.ts'
import { NO_VOICE_HELP, useSpeech } from '../lib/speech.ts'
import { nextTheme, setTheme, useTheme } from '../lib/theme.ts'
import type { Theme } from '../lib/theme.ts'
import { SyncStatusLine } from './SyncStatus.tsx'

export function Header({ route }: { route: string[] }) {
  const here = route[0] ?? ''
  const nav: [string, string][] = [
    ['', 'Home'],
    ['lessons', 'Lessons'],
    ['topics', 'Topics'],
    ['words', 'Words'],
    ['daily', 'Daily'],
    ['results', 'Results'],
    ['stats', 'Stats'],
    ['settings', 'Settings'],
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
          <SyncStatusLine compact />
          <ThemeButton />
        </div>
      </div>
    </header>
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
