// Public endpoints of the Neon backend (see backend/README.md). They are not secrets: every
// visitor's browser sees them. The API only answers the origins http://localhost:5173 and
// https://hayktarkhanyan.github.io, so `vite preview` (port 4173) cannot use it.
export const API_URL = 'https://br-muddy-river-b1aba4sv-api.compute.c-5.eu-central-1.aws.neon.tech'
export const AUTH_URL = 'https://ep-sweet-morning-b1ujs35d.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth'

/**
 * The first day of the goal-based streak (DECISIONS.md #83): from this local day on, a day counts for
 * the streak only when the daily goal was met. Set to the day after the deploy, so nobody loses a
 * streak on deploy day. Before it, the old rule (any study day) applies.
 */
export const PATH_LAUNCH_DAY = '2026-12-31'
