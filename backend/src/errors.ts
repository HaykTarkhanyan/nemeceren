// Every error leaves the API as JSON: { error: { code, message, details? }, requestId }.
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { z } from 'zod'
import { isAllowedOrigin } from './config.ts'
import type { AppEnv } from './types.ts'

export type ErrorCode =
  | 'unauthorized'
  | 'token_expired'
  | 'forbidden_origin'
  | 'not_allowed'
  | 'invalid_json'
  | 'invalid_body'
  | 'invalid_data'
  | 'invalid_query'
  | 'empty_batch'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'conflict'
  | 'not_found'
  | 'auth_unavailable'
  | 'internal'

export class HttpError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: ErrorCode
  readonly details: unknown

  constructor(status: ContentfulStatusCode, code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const MAX_ISSUES = 20

/** zod issues as { path, message }, capped so a batch of 1000 bad rows does not produce a huge reply. */
export function zodDetails(error: z.ZodError): { issues: { path: string; message: string }[]; moreIssues: number } {
  const issues = error.issues.slice(0, MAX_ISSUES).map((i) => ({ path: i.path.map(String).join('.'), message: i.message }))
  return { issues, moreIssues: Math.max(0, error.issues.length - MAX_ISSUES) }
}

/**
 * JSON error response. CORS headers are added here too, so the app can read the error message
 * from an allowed origin even when the error happened before or inside the CORS middleware.
 */
export function errorResponse(c: Context<AppEnv>, err: HttpError): Response {
  c.set('errorCode', err.code)
  const origin = c.req.header('origin')
  if (origin !== undefined && isAllowedOrigin(origin)) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Expose-Headers', 'x-request-id')
    c.header('Vary', 'Origin')
  }
  const error = err.details === undefined ? { code: err.code, message: err.message } : { code: err.code, message: err.message, details: err.details }
  return c.json({ error, requestId: c.get('requestId') }, err.status)
}
