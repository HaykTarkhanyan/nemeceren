// Who is calling? Verify the Neon Auth JWT (EdDSA, 15-minute expiry) against the branch's JWKS and
// check that the account still exists. Every table is scoped by the verified user id.
import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import { requireEnv } from './config.ts'
import { pool } from './db.ts'
import { HttpError } from './errors.ts'
import type { AppEnv } from './types.ts'

// Issuer and audience are both the origin of the Auth URL (Neon docs, "JWT" plugin page).
const AUTH_ORIGIN = new URL(requireEnv('NEON_AUTH_BASE_URL')).origin
// Built once per isolate: jose caches the keys and refetches only on an unknown key id.
const JWKS = createRemoteJWKSet(new URL(requireEnv('NEON_AUTH_JWKS_URL')))

export interface Identity {
  userId: string
  email: string | null
}

export async function verifyToken(authorization: string | undefined): Promise<Identity> {
  if (authorization === undefined || !/^bearer\s+\S/i.test(authorization)) {
    throw new HttpError(401, 'unauthorized', 'Missing "Authorization: Bearer <token>" header. Get the token with authClient.token().')
  }
  const token = authorization.replace(/^bearer\s+/i, '').trim()
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: AUTH_ORIGIN, audience: AUTH_ORIGIN, algorithms: ['EdDSA'] })
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      throw new HttpError(401, 'unauthorized', 'The token has no "sub" (user id) claim.')
    }
    const email = typeof payload.email === 'string' ? payload.email : null
    return { userId: payload.sub, email }
  } catch (err) {
    if (err instanceof HttpError) throw err
    // JWTExpired extends JWTClaimValidationFailed, so it must be checked first.
    if (err instanceof errors.JWTExpired) {
      throw new HttpError(401, 'token_expired', 'The token has expired (they last 15 minutes). Get a fresh one with authClient.token() and retry.')
    }
    if (err instanceof errors.JWTClaimValidationFailed) {
      throw new HttpError(401, 'unauthorized', `Token claim "${err.claim}" failed validation (${err.reason}).`)
    }
    // The signing keys could not be fetched or read: an outage, not a bad token.
    if (err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid || (err instanceof errors.JOSEError && err.code === 'ERR_JOSE_GENERIC')) {
      throw new HttpError(503, 'auth_unavailable', `Could not load the Neon Auth signing keys: ${err.message}`)
    }
    if (err instanceof errors.JOSEError) {
      throw new HttpError(401, 'unauthorized', `Invalid token (${err.code}): ${err.message}`)
    }
    throw err
  }
}

/**
 * Route middleware: a verified token of an account that still exists, else 401/410. Anyone may sign up with Google
 * (DECISIONS.md #118), so there is no allowlist gate any more; allowed_users now marks the trusted learners (Hayk and
 * the friends), who skip the usage and row limits. A token stays valid for up to 15 minutes after "Delete my account",
 * so the account is looked up on every request. Sets c.var.userId and c.var.trusted.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const identity = await verifyToken(c.req.header('authorization'))
  const { rows } = await pool.query<{ exists: boolean; trusted: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM neon_auth."user" WHERE id = $1::uuid) AS exists, EXISTS (SELECT 1 FROM allowed_users WHERE user_id = $2) AS trusted',
    [identity.userId, identity.userId],
  )
  if (!rows[0]?.exists) throw new HttpError(410, 'account_deleted', 'This account has been deleted.')
  c.set('userId', identity.userId)
  c.set('trusted', rows[0].trusted)
  await next()
}
