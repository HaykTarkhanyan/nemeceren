// Shows the sign-in page, loading and account problems; renders the app only once progress is
// loaded, or for a guest (no account, nothing saved).
import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { loginEmail, signInWithGoogle } from '../lib/auth.ts'
import { messageOf } from '../lib/errors.ts'
import { boot, continueAsGuest, retry, signInWith, signOutNow, signUpWith, useSession } from '../lib/session.ts'
import { startAutoSync } from '../lib/storage.ts'
import { PrivacyNotice } from './PrivacyNotice.tsx'

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession()

  useEffect(() => {
    void boot()
  }, [])

  const ready = session.phase === 'ready'
  useEffect(() => (ready ? startAutoSync() : undefined), [ready])

  switch (session.phase) {
    case 'ready':
    case 'guest':
      return <>{children}</>
    case 'checking':
      return <Centered>Checking your sign-in...</Centered>
    case 'loading':
      return <Centered>Loading your progress...</Centered>
    case 'signed-out':
      return <LoginPage notice={session.notice} />
    case 'error':
      return (
        <Centered>
          <div className="alert error" role="alert">
            {session.message}
          </div>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void retry()}>
              Try again
            </button>
            {session.user && <SignOutButton />}
          </div>
        </Centered>
      )
  }
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="container stack gate">
      <h1>Nemeceren</h1>
      {children}
    </main>
  )
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError(null)
          signOutNow()
            .catch((err: unknown) => setError(messageOf(err)))
            .finally(() => setBusy(false))
        }}
      >
        Sign out
      </button>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
    </>
  )
}

const MIN_PASSWORD = 8
/** Password sign-up is disabled in Neon Auth since 2026-09-29, so the form hides it; new learners use Google (DECISIONS.md #118). */
const SIGN_UP_OPEN = false

function LoginPage({ notice }: { notice: string | null }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function google() {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle() // leaves the page for Google
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'sign-up' && password.length < MIN_PASSWORD) {
      setError(`Choose a password of at least ${MIN_PASSWORD} characters.`)
      return
    }
    setBusy(true)
    try {
      // "Anahit" signs in as anahit@nemeceren.example (DECISIONS.md #60); an email stays as it is.
      if (mode === 'sign-in') await signInWith(loginEmail(email), password)
      else await signUpWith(loginEmail(email), password)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="container stack gate">
      <h1>Nemeceren</h1>
      <p className="muted">German practice. Sign in to load and save your progress on every device.</p>
      {notice && (
        <div className="alert warn" role="alert">
          {notice}
        </div>
      )}
      <form className="card stack login" onSubmit={(e) => void submit(e)}>
        <h2>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</h2>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void google()}>
          Sign in with Google
        </button>
        <p className="small muted">New here? Google creates your account. With a name and password from Hayk, use the fields below.</p>
        <label className="field">
          <span className="label">Email or name</span>
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'sign-up' ? MIN_PASSWORD : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Please wait...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
        {SIGN_UP_OPEN ? (
          <p className="small">
            {mode === 'sign-in' ? 'No account yet? ' : 'Already have an account? '}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
                setError(null)
              }}
            >
              {mode === 'sign-in' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        ) : (
          <PrivacyNotice />
        )}
      </form>
      <section className="card stack">
        <p className="small">
          Or just look around: lessons, topics, extras, tests and word reviews all work without an account. Nothing is saved, and a reload starts
          fresh.
        </p>
        <div>
          <button type="button" className="btn" onClick={continueAsGuest}>
            Continue as guest
          </button>
        </div>
      </section>
    </main>
  )
}
