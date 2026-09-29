// Sign-in with Neon Auth (Managed Better Auth), email + password, through the official
// @neondatabase/auth client (default vanilla adapter). The session is a 7-day cookie on the
// auth host; Better Auth's client sends it cross-origin by default (credentials: 'include',
// better-auth/dist/client/config.mjs). The API needs a short-lived JWT (15 minutes), which the
// SDK takes from the `set-auth-jwt` header of /get-session and puts into `session.token`.
// The SDK is about 80 KB gzipped (DECISIONS.md #40), so it is loaded as its own chunk on first use:
// the page can draw before it arrives, and it stays cached when the app's own code changes.
import type { VanillaBetterAuthClient } from '@neondatabase/auth'
import { AUTH_URL } from './config.ts'

let client: Promise<VanillaBetterAuthClient> | null = null

/** Created on first use, so that importing this module has no side effects. */
function auth(): Promise<VanillaBetterAuthClient> {
  if (client === null) {
    client = Promise.all([import('@neondatabase/auth'), import('@neondatabase/auth/vanilla/adapters')]).then(([sdk, adapters]) =>
      sdk.createAuthClient(AUTH_URL, { adapter: adapters.BetterAuthVanillaAdapter() }),
    )
    // A failed download (offline) must not stick: the next call tries again.
    client.catch(() => {
      client = null
    })
  }
  return client
}

export interface AuthUser {
  id: string
  email: string
}

/** A failed auth call, with the server's message when there is one. */
export class AuthFailure extends Error {
  status: number | null
  code: string | null
  /** The request never reached the server (offline, DNS, CORS). */
  network: boolean
  constructor(message: string, status: number | null, code: string | null, network: boolean) {
    super(message)
    this.name = 'AuthFailure'
    this.status = status
    this.code = code
    this.network = network
  }
}

interface ErrorLike {
  message?: string
  status?: number
  statusText?: string
  code?: string
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /failed to fetch|networkerror|load failed|fetch failed/i.test(err.message))
}

function toFailure(what: string, err: unknown): AuthFailure {
  if (err instanceof AuthFailure) return err
  if (isNetworkError(err)) return new AuthFailure(`${what}: cannot reach the sign-in server (offline?)`, null, null, true)
  const e = (err ?? {}) as ErrorLike
  const detail = e.message || e.statusText || String(err)
  return new AuthFailure(`${what}: ${detail}`, typeof e.status === 'number' ? e.status : null, e.code ?? null, false)
}

/** Runs a client call that may return { data, error } or throw; always throws AuthFailure on errors. */
async function call(what: string, run: () => Promise<unknown>): Promise<unknown> {
  let res: { data?: unknown; error?: unknown }
  try {
    res = (await run()) as { data?: unknown; error?: unknown }
  } catch (err) {
    throw toFailure(what, err)
  }
  if (res.error) throw toFailure(what, res.error)
  return res.data ?? null
}

function userOf(what: string, data: unknown): AuthUser {
  const user = (data as { user?: { id?: unknown; email?: unknown } } | null)?.user
  if (!user || typeof user.id !== 'string' || typeof user.email !== 'string') {
    throw new AuthFailure(`${what}: the sign-in server answered without a user`, null, null, false)
  }
  return { id: user.id, email: user.email }
}

/** The signed-in user, or null when signed out. */
export async function currentUser(): Promise<AuthUser | null> {
  const data = (await call('Checking your sign-in', async () => (await auth()).getSession())) as { user?: unknown } | null
  return data?.user ? userOf('Checking your sign-in', data) : null
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  lastToken = null
  const data = await call('Sign in', async () => (await auth()).signIn.email({ email, password }))
  return userOf('Sign in', data)
}

/** Creates the account and signs it in. The name is the part of the email before "@". */
export async function signUp(email: string, password: string): Promise<AuthUser> {
  lastToken = null
  const name = email.split('@')[0] || email
  const data = await call('Create account', async () => (await auth()).signUp.email({ email, password, name }))
  return userOf('Create account', data)
}

export async function signOut(): Promise<void> {
  lastToken = null
  await call('Sign out', async () => (await auth()).signOut())
}

// ---------- API token (JWT, valid 15 minutes) ----------

/** Seconds since epoch of the JWT's "exp" claim, or null if it cannot be read. */
export function jwtExpiry(token: string): number | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')))
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

/** The token last handed out, to notice when a "fresh" one is the same one again. */
let lastToken: string | null = null

/**
 * A JWT for the API, the way the SDK's own getJWTToken() gets it: from getSession(), whose
 * reply the SDK caches in memory until 10 s before the JWT expires, so most calls make no
 * request. Not `token()`: the SDK routes /token through the same session cache and then
 * answers with the cached { session, user } instead of { token } (0.5.0-beta,
 * dist/adapter-core-*.mjs, deriveBetterAuthMethodFromUrl; found by the integration probe).
 * `fresh` is for a retry after the API said "token_expired".
 */
export async function getToken(opts: { fresh?: boolean } = {}): Promise<string> {
  const data = await call('Getting an API token', async () => (await auth()).getSession())
  const token = (data as { session?: { token?: unknown } } | null)?.session?.token
  if (typeof token !== 'string' || token === '') {
    // No session cookie reached the auth host: signed out, expired, or the browser blocked it.
    throw new AuthFailure('Getting an API token: not signed in (or the browser blocked the sign-in cookie)', 401, 'no_session', false)
  }
  if (jwtExpiry(token) === null) {
    // Without the set-auth-jwt header the SDK leaves the opaque session token here.
    throw new AuthFailure('Getting an API token: the sign-in server sent a session but no API token (set-auth-jwt header missing)', null, 'no_jwt', false)
  }
  if (opts.fresh && token === lastToken) {
    throw new AuthFailure(
      "Getting an API token: the progress server says the token expired, but it has not expired by this device's clock. Check that the date and time are set automatically, then reload.",
      null,
      'clock_skew',
      false,
    )
  }
  lastToken = token
  return token
}
