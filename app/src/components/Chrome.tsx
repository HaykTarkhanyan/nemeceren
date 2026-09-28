// App frame: header with navigation and save-mode badge, error banner, voice warning.
import { Component } from 'react'
import type { ReactNode } from 'react'
import { dismissError, useErrors } from '../lib/errors.ts'
import { link } from '../lib/router.ts'
import { NO_VOICE_HELP, useSpeech } from '../lib/speech.ts'
import { SAVE_MODE } from '../lib/storage.ts'

export function ModeBadge() {
  return SAVE_MODE === 'repo' ? (
    <span className="badge ok" title="Results are written to the progress/ folder of the repo">
      Saving to repo
    </span>
  ) : (
    <span className="badge warn" title="Results stay in this browser and are not synced to the repo">
      Phone mode: saved in this browser only
    </span>
  )
}

export function Header({ route }: { route: string[] }) {
  const here = route[0] ?? ''
  const nav: [string, string][] = [
    ['', 'Home'],
    ['words', 'Words'],
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
        <ModeBadge />
      </div>
    </header>
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
