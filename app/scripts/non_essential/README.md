# app/scripts/non_essential

Maintained dev tooling that is not needed to run or build the app.

| script | what it does and when to re-run it |
|---|---|
| `app-integration.ts` | Runs the app's own sign-in and sync code (`src/lib/auth.ts`, `src/lib/storage.ts`) against the deployed Neon backend with one throwaway user. It covers sign-up, 403 before allowlisting, sync, reload, a resend after a lost reply (no duplicates), a stale card, sign-out and sign-in. At the end it deletes the user's rows and the user. Re-run it after upgrading `@neondatabase/auth` or changing the sync code. It needs sign-up to be open (see the header of the script). About 30 s and 20 requests: `npx tsx scripts/non_essential/app-integration.ts` from `app/`. Added 2026-09-29 with the Neon wiring. Its first run found that the SDK's `token()` answers from the session cache. |
