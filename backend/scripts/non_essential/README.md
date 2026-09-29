# backend/scripts/non_essential

Maintained QA tooling. Not needed to run the backend, but expected to keep working.

| script | what it does | when to re-run it |
|---|---|---|
| `smoke_test.py` | End-to-end check of the deployed API with a throwaway `nemeceren-smoke-*@example.com` user: health, CORS, 401/403, allowlist, sync idempotency, stale cards, 409 rollback, 400/415 errors, Claude's review, gzip. Always deletes the user's rows; prints the `neon neon-auth user delete <id>` command for the auth user. `--cleanup <user-id>` recovers after an interrupted run (refuses non-smoke-test users). | After every `neon deploy` and after every new migration. Needs sign-up to be enabled (see ../../README.md). |

Added 2026-09-29 with the backend.
