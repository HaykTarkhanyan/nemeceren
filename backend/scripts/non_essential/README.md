# backend/scripts/non_essential

Maintained QA tooling. Not needed to run the backend, but expected to keep working.

| script | what it does | when to re-run it |
|---|---|---|
| `smoke_test.py` | End-to-end check of the deployed API: health, CORS, 401/403, allowlist, sync idempotency, stale cards, 409 rollback, 400/415 errors, notes (edit, stale, soft delete, bad text, the lock after Claude's feedback), custom words (bad ids and fields, Claude's checks via progress.py, a delete keeps the check, an edit clears it, stale, reviews and cards under a `u-` word id), study sessions (edit, stale, soft delete, bad ones, the table's CHECKs, the state window, study days from sessions), Claude's review, gzip. `--test-account` (the usual way since sign-up is closed) signs in as Claude's test account and deletes only that account's progress rows, before and after; it takes the account off the allowlist for one check and restores the entry at once. Without it, a throwaway `nemeceren-smoke-*@example.com` user is signed up (needs sign-up open), its rows are always deleted, and the `neon neon-auth user delete <id>` command is printed. `--cleanup <user-id>` recovers after an interrupted throwaway run (refuses other users); `--cleanup-test-account` deletes the test account's progress rows only. | After every `neon deploy` and after every new migration: `uv run backend/scripts/non_essential/smoke_test.py --test-account` from the repo root. |

Added 2026-09-29 with the backend. `--test-account`, `--cleanup-test-account` and the notes checks added 2026-09-30 (DECISIONS.md #52, #53); the custom word checks on 2026-09-30 (#58); the study session checks on 2026-10-02 (#62).
