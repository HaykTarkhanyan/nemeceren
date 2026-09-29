// nemeceren progress API: a Hono app deployed as the Neon Function "api" (see ../neon.ts).
//   GET  /v1/health  no auth, no database (safe to call; does not wake the compute)
//   GET  /v1/state   auth: everything the app needs on start (?days=35 window for raw reviews)
//   POST /v1/sync    auth: one batched, idempotent upload of reviews, cards, test attempts, lessons, extras and notes
// Every other path is a 404. Contract and examples: ../README.md.
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { cors } from 'hono/cors'
import { DatabaseError } from 'pg'
import { requireUser } from './auth.ts'
import { ALLOWED_ORIGINS, API_VERSION, isAllowedOrigin, MAX_BODY_BYTES, STATE_DAYS } from './config.ts'
import { errorResponse, HttpError, zodDetails } from './errors.ts'
import { SyncBody } from './schema.ts'
import { loadState } from './state.ts'
import { applySync } from './sync.ts'
import type { AppEnv } from './types.ts'

const app = new Hono<AppEnv>()

// Request id, no caching of private data, and one log line per request
// (read them with `neon logs query --source function --since 1h`). Tokens and bodies are never logged.
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)
  const started = Date.now()
  await next()
  c.header('x-request-id', requestId)
  c.header('Cache-Control', 'no-store')
  console.log(
    JSON.stringify({
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
      user: c.get('userId') ?? null,
      error: c.get('errorCode') ?? null,
    }),
  )
})

// Browsers may call only from the app's two origins. Requests without an Origin header (curl,
// scripts) continue to the token check, which every data route requires.
app.use('*', async (c, next) => {
  const origin = c.req.header('origin')
  if (origin !== undefined && !isAllowedOrigin(origin)) {
    throw new HttpError(403, 'forbidden_origin', `Origin ${origin} is not allowed. Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
  }
  await next()
})

app.use(
  '*',
  cors({
    origin: [...ALLOWED_ORIGINS],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['authorization', 'content-type'],
    exposeHeaders: ['x-request-id'],
    // Browsers cache the preflight (Chrome caps this at 2 hours), so fewer OPTIONS invocations.
    maxAge: 7200,
  }),
)

// gzip/deflate when the client accepts it; the state reply is mostly repetitive JSON.
app.use('*', compress())

app.get('/v1/health', (c) => c.json({ ok: true, service: 'nemeceren-api', apiVersion: API_VERSION, time: new Date().toISOString() }))

function parseDays(raw: string | undefined): number {
  if (raw === undefined) return STATE_DAYS.default
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isInteger(n) || n < 1 || n > STATE_DAYS.max) {
    throw new HttpError(400, 'invalid_query', `"days" must be a whole number from 1 to ${STATE_DAYS.max} (default ${STATE_DAYS.default}); got "${raw}"`)
  }
  return n
}

app.get('/v1/state', requireUser, async (c) => {
  const days = parseDays(c.req.query('days'))
  return c.json(await loadState(c.get('userId'), days))
})

app.post(
  '/v1/sync',
  requireUser,
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      errorResponse(c, new HttpError(413, 'payload_too_large', `The sync body is larger than ${MAX_BODY_BYTES} bytes. Split the outbox into smaller batches.`)),
  }),
  async (c) => {
    const type = c.req.header('content-type') ?? ''
    if (!type.toLowerCase().startsWith('application/json')) {
      throw new HttpError(415, 'unsupported_media_type', 'Send the body as JSON with "Content-Type: application/json".')
    }
    let json: unknown
    try {
      json = await c.req.json()
    } catch (err) {
      throw new HttpError(400, 'invalid_json', `The body is not valid JSON: ${(err as Error).message}`)
    }
    const parsed = SyncBody.safeParse(json)
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_body', 'The sync batch failed validation; nothing was saved.', zodDetails(parsed.error))
    }
    return c.json(await applySync(c.get('userId'), parsed.data))
  },
)

app.notFound((c) =>
  errorResponse(c, new HttpError(404, 'not_found', `No route for ${c.req.method} ${c.req.path}. Routes: GET /v1/health, GET /v1/state, POST /v1/sync.`)),
)

app.onError((err, c) => {
  if (err instanceof HttpError) return errorResponse(c, err)
  // 22xxx data exceptions and 23xxx constraint violations: bad input that got past validation.
  if (err instanceof DatabaseError && typeof err.code === 'string' && /^2[23]/.test(err.code)) {
    const detail = err.detail ? ` (${err.detail})` : ''
    return errorResponse(c, new HttpError(400, 'invalid_data', `The database rejected the data: ${err.message}${detail}`))
  }
  const requestId = c.get('requestId')
  console.error(JSON.stringify({ level: 'error', requestId, message: err.message, stack: err.stack }))
  return errorResponse(
    c,
    new HttpError(500, 'internal', `Internal error. Find request ${requestId} in the function logs: neon logs query --source function --since 1h`),
  )
})

export default app
