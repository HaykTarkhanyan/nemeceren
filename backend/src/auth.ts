// Who is calling? Verify the Neon Auth JWT (EdDSA, 15-minute expiry) against the branch's JWKS,
// then check the user is on the allowlist. A valid token alone is not enough: Neon Auth lets
// anyone sign up unless sign-up is disabled, and every table is scoped by the verified user id.
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

/** Route middleware: verified token + allowlisted user, else 401/403. Sets c.var.userId. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const identity = await verifyToken(c.req.header('authorization'))
  const { rows } = await pool.query('SELECT 1 FROM allowed_users WHERE user_id = $1', [identity.userId])
  if (rows.length === 0) {
    throw new HttpError(
      403,
      'not_allowed',
      `This account (user id ${identity.userId}, email ${identity.email ?? 'unknown'}) is not allowed to use this API. ` +
        'Claude adds it with: uv run backend/scripts/progress.py allow-user <email>',
    )
  }
  c.set('userId', identity.userId)
  await next()
}
