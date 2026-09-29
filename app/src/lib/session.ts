// The sign-in state of the app: checking -> signed out -> loading progress -> ready, plus the
// two dead ends that need a person: "not activated" (the API allowlist, 403) and errors.
// Offline starts: if the sign-in server cannot be reached, the last signed-in user on this
// device is used with the offline copy of their progress (see storage.ts).
import { useSyncExternalStore } from 'react'
import { AuthFailure, currentUser, signIn, signOut, signUp } from './auth.ts'
import type { AuthUser } from './auth.ts'
import { messageOf } from './errors.ts'
import { ApiError, isSignedOut, onSignedOut, progressStore } from './storage.ts'

export type Session =
  | { phase: 'checking' }
  | { phase: 'signed-out'; notice: string | null }
  | { phase: 'loading'; user: AuthUser }
  | { phase: 'ready'; user: AuthUser }
  | { phase: 'not-allowed'; user: AuthUser; justCreated: boolean }
  | { phase: 'error'; user: AuthUser | null; message: string }

let session: Session = { phase: 'checking' }
const listeners = new Set<() => void>()

function set(next: Session): void {
  session = next
  listeners.forEach((l) => l())
}

export function useSession(): Session {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => session,
  )
}

const LAST_USER = 'nemeceren.lastUser'

function rememberUser(user: AuthUser): void {
  localStorage.setItem(LAST_USER, JSON.stringify(user))
}

function lastUser(): AuthUser | null {
  const raw = localStorage.getItem(LAST_USER)
  if (raw === null) return null
  const u = JSON.parse(raw) as Partial<AuthUser>
  if (typeof u.id !== 'string' || typeof u.email !== 'string') throw new Error(`Browser storage "${LAST_USER}" is damaged`)
  return { id: u.id, email: u.email }
}

const EXPIRED = 'Your sign-in has expired. Please sign in again. Unsynced changes stay on this device and sync after you sign in.'

onSignedOut(() => {
  progressStore().stop()
  set({ phase: 'signed-out', notice: EXPIRED })
})

async function load(user: AuthUser, justCreated: boolean): Promise<void> {
  rememberUser(user)
  set({ phase: 'loading', user })
  try {
    await progressStore().start(user)
    set({ phase: 'ready', user })
  } catch (err) {
    if (err instanceof ApiError && err.code === 'not_allowed') {
      set({ phase: 'not-allowed', user, justCreated })
    } else if (isSignedOut(err)) {
      progressStore().stop()
      set({ phase: 'signed-out', notice: EXPIRED })
    } else {
      set({ phase: 'error', user, message: messageOf(err) })
    }
  }
}

/** Checks the sign-in on start. */
export async function boot(): Promise<void> {
  set({ phase: 'checking' })
  let user: AuthUser | null
  try {
    user = await currentUser()
  } catch (err) {
    if (err instanceof AuthFailure && err.network) {
      const last = lastUser()
      if (last) return load(last, false)
      set({ phase: 'error', user: null, message: `${err.message}. Connect to the internet and try again.` })
      return
    }
    set({ phase: 'error', user: null, message: messageOf(err) })
    return
  }
  if (!user) {
    set({ phase: 'signed-out', notice: null })
    return
  }
  await load(user, false)
}

/** Throws AuthFailure (wrong password, no network, ...) for the sign-in form to show. */
export async function signInWith(email: string, password: string): Promise<void> {
  await load(await signIn(email, password), false)
}

export async function signUpWith(email: string, password: string): Promise<void> {
  await load(await signUp(email, password), true)
}

/** Loads again after an error or after Claude activated the account. */
export function retry(): Promise<void> {
  const s = session
  if ((s.phase === 'error' || s.phase === 'not-allowed') && s.user) return load(s.user, s.phase === 'not-allowed' && s.justCreated)
  return boot()
}

/**
 * Signs out. Unsynced changes are sent first if possible; any that are left stay on this device
 * (they sync after the next sign-in to the same account). Throws AuthFailure on failure.
 */
export async function signOutNow(): Promise<void> {
  const store = progressStore()
  if (store.getStatus().pending > 0) await store.flush({ manual: true })
  const left = store.getStatus().pending
  if (left > 0 && !window.confirm(`${left} change${left === 1 ? ' is' : 's are'} not synced yet. Sign out anyway? They stay on this device and sync when you sign in again.`)) {
    return
  }
  await signOut()
  store.stop()
  localStorage.removeItem(LAST_USER)
  set({ phase: 'signed-out', notice: null })
}
