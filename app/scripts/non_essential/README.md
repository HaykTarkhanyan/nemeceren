# app/scripts/non_essential

Maintained dev tooling that is not needed to run or build the app.

| script | what it does and when to re-run it |
|---|---|
| `app-integration.ts` | Runs the app's own sign-in and sync code (`src/lib/auth.ts`, `src/lib/storage.ts`) against the deployed Neon backend. It covers sign-in (or sign-up), 403 before allowlisting (throwaway user only), sync, reload, a resend after a lost reply (no duplicates), a stale card, notes (Claude's feedback via `progress.py` locks a note; an edit made before seeing it is refused, adopted and reported; "Check for feedback"), sign-out and sign-in. Re-run it after upgrading `@neondatabase/auth` or changing the sync code. The usual way since sign-up is closed: `npx tsx scripts/non_essential/app-integration.ts --test-account` from `app/`, which signs in as Claude's test account and deletes only that account's progress rows. Without the flag it signs up a throwaway user and deletes it at the end, which needs sign-up open (see the header of the script). About 40 s and 30 requests. Added 2026-09-29 with the Neon wiring; its first run found that the SDK's `token()` answers from the session cache. `--test-account` and the notes section added 2026-09-30. |
