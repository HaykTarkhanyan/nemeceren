// Shows the sign-in page, loading and account problems; renders the app only once progress is loaded.
import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { messageOf } from '../lib/errors.ts'
import { boot, retry, signInWith, signOutNow, signUpWith, useSession } from '../lib/session.ts'
import { startAutoSync } from '../lib/storage.ts'

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession()

  useEffect(() => {
    void boot()
  }, [])

  const ready = session.phase === 'ready'
  useEffect(() => (ready ? startAutoSync() : undefined), [ready])

  switch (session.phase) {
    case 'ready':
      return <>{children}</>
    case 'checking':
      return <Centered>Checking your sign-in...</Centered>
    case 'loading':
      return <Centered>Loading your progress...</Centered>
    case 'signed-out':
      return <LoginPage notice={session.notice} />
    case 'not-allowed':
      return (
        <Centered>
          <div className="alert warn" role="alert">
            {session.justCreated
              ? 'Account created. Ask Claude to activate it (allowlist).'
              : 'This account is not activated yet. Ask Claude to activate it (allowlist).'}
          </div>
          <p className="muted small">Signed in as {session.user.email}.</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void retry()}>
              Try again
            </button>
            <SignOutButton />
          </div>
        </Centered>
      )
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
/** Sign-up is disabled in Neon Auth since 2026-09-29 (Claude creates accounts), so the form hides it. */
const SIGN_UP_OPEN = false

function LoginPage({ notice }: { notice: string | null }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'sign-up' && password.length < MIN_PASSWORD) {
      setError(`Choose a password of at least ${MIN_PASSWORD} characters.`)
      return
    }
    setBusy(true)
    try {
      if (mode === 'sign-in') await signInWith(email.trim(), password)
      else await signUpWith(email.trim(), password)
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
        <label className="field">
          <span className="label">Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
        <button type="submit" className="btn primary" disabled={busy}>
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
          <p className="small muted">No account? Ask Claude.</p>
        )}
      </form>
    </main>
  )
}
