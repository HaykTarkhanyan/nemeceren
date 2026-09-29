# Neon Auth SDK: token() answers from the session cache, without a token

**Symptom:** in the app's integration run against the real Neon Auth host, every API call right after start failed with "not signed in", although the user was signed in. Mocked unit tests all passed.

**Cause:** in `@neondatabase/auth` 0.5.0-beta, `authClient.token()` is routed through the SDK's session cache (`dist/adapter-core-*.mjs`, `deriveBetterAuthMethodFromUrl`). Once the app has called `getSession()` (it does on start), `token()` returns the cached `{ session, user }` object, which has no `token` field.

**Fix:** `getToken()` in `app/src/lib/auth.ts` reads the JWT from `getSession()` as `data.session.token`, which is what the SDK's own `getJWTToken()` does. The SDK fills that field from the `set-auth-jwt` header of `/get-session` and caches it until 10 s before the 15-minute JWT expires. The auth host exposes that header to our origins, so browsers can read it.

**Guards added:**
- If `session.token` is not a JWT (the header was missing), the app fails loudly (`no_jwt`).
- If a "fresh" token after a `token_expired` 401 is the same token again, the app tells Hayk to check the device clock (`clock_skew`) instead of looping.

**Consequences:**
- Only a run against the real auth host catches SDK behaviour like this. Rerun `app/scripts/non_essential/app-integration.ts` after every `@neondatabase/auth` upgrade. It creates a throwaway user; clean up with the smoke test's `--cleanup` and `neon neon-auth user delete`.
- Found by the wire-up agent on 2026-09-29 (DECISIONS.md #40). The `token()` example in `backend/README.md` was corrected at the same time.
