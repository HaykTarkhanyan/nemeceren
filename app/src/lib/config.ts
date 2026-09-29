// Public endpoints of the Neon backend (see backend/README.md). They are not secrets: every
// visitor's browser sees them. The API only answers the origins http://localhost:5173 and
// https://hayktarkhanyan.github.io, so `vite preview` (port 4173) cannot use it.
export const API_URL = 'https://br-muddy-river-b1aba4sv-api.compute.c-5.eu-central-1.aws.neon.tech'
export const AUTH_URL = 'https://ep-sweet-morning-b1ujs35d.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth'
