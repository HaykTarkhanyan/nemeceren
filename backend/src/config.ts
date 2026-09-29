// Fixed settings of the API. The allowed origins are not secrets, so they live in code:
// changing one means a redeploy (`neon deploy --no-env-pull` in backend/).

export const API_VERSION = '1'

/** Browser origins that may call the API. Anything else with an Origin header gets 403. */
export const ALLOWED_ORIGINS: readonly string[] = ['https://hayktarkhanyan.github.io', 'http://localhost:5173']

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin)
}

/** Largest accepted sync body. A full batch at the limits below is about 1.3 MB. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024

/** Most items of each kind in one POST /v1/sync. The app splits a bigger outbox into several batches. */
export const SYNC_LIMITS = { reviewEvents: 1000, cards: 2000, attempts: 20, lessons: 500, newWordExtras: 31 } as const

/** GET /v1/state returns raw review events from this many days back (the Stats page charts 30 days). */
export const STATE_DAYS = { default: 35, max: 400 } as const

/** Read a variable Neon injects into the function. Missing means the service is not set up: fail at start. */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(
      `Environment variable ${name} is not set. Neon injects DATABASE_URL on every branch and ` +
        `NEON_AUTH_BASE_URL / NEON_AUTH_JWKS_URL once "auth: true" in neon.ts is deployed.`,
    )
  }
  return value
}
