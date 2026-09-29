# Neon Managed Auth (Better Auth) sessions are cookie-only: no bearer sessions

**Symptom:** The plan was to avoid third-party-cookie problems on phones by sending the session as a bearer token instead of a cookie.

**What was tested (backend agent, 2026-09-29, against project `nemeceren`):**
- The session is the cookie `__Secure-neon-auth.session_token` on the Neon Auth host, valid for 7 days, with `SameSite=None; Partitioned` (a CHIPS cookie).
- Minting the API JWT (`/token`) with the session token sent as `Authorization: Bearer ...` and no cookie returned **401**, and no `set-auth-token` header came back. So Managed Auth has no bearer-session mode.
- The auth host returns `Access-Control-Allow-Credentials: true` for the Pages origin, so `credentials: 'include'` works from https://hayktarkhanyan.github.io.

**Consequences:**
- The app must use `credentials: 'include'` and relies on the partitioned third-party cookie.
- Android Chrome (Hayk's phone) supports partitioned cookies. Safari supports them from 18.4 on, unless its tracking prevention flags the host (sources: cookiestatus.com/safari; Safari 18.4 CHIPS notes). Older iOS would break login.
- If a browser ever rejects the cookie, the cookie-free fix is self-managed Better Auth with the bearer plugin inside a Neon Function. That's a bigger change, and the choice is Hayk's (see DECISIONS.md #39).
