# Neon backend: decision entries to merge into DECISIONS.md

> **Merged into DECISIONS.md on 2026-09-29 as #29 (A) to #39 (K).** DECISIONS.md is the maintained copy; this file is the original draft.

Written by the backend build agent on 2026-09-29 (Phase 1, before anything was installed or deployed). Phase 2 (11:12-11:25 the same day) installed, migrated and deployed it and passed the 49-check smoke test; the layout in J worked as designed (CLI found the root `.neon` from `backend/`, one `.env.local`). Same format as `DECISIONS.md`. Letters instead of numbers so they do not clash with entries added meanwhile; give them numbers when merging (newest at the top). Given as settled context, not reopened here: storage moves to Neon Postgres (Hayk, 2026-09-29); SPA -> Neon Auth -> Neon Function (Hono) -> Postgres, no Data API; Free plan only; Node 20.20.0 on the PC.

Sources checked on 2026-09-29: the four Neon skills in `.claude/skills/`, and neon.com docs pages `reference/neon-ts`, `compute/functions/{get-started,deploy,authentication,reference/runtime-limits}`, `auth/{overview,authentication-flow,guides/configure-domains,guides/plugins/jwt,production-checklist,troubleshooting}`, `cli/{neon-auth,config,env,link}`, `pricing`, `introduction/plans`. Package versions and engines from `npm view` (all run on Node >= 20.19.0).

## K. Login is email + password; sign-up gets closed after Hayk's account exists, and the API has its own allowlist table

- **Date:** 2026-09-29 - **Status:** active (sign-up closing happens in the wire-up task)
- **Why:** The Neon docs say "Anyone can sign up for your application by default" (auth/authentication-flow). The CLI can close it (`neon neon-auth config email-password update --disable-sign-up`), but not before Hayk has signed up, and a valid token must never be enough on its own. So the function also checks `allowed_users` (one indexed lookup per request; removal takes effect at once, no redeploy). Email + password needs no email round trip per sign-in and works on the shared SMTP sender, which the docs call rate-limited and fit only for development.
- **Alternatives rejected:** email OTP (a code by email at every sign-in, and it depends on the shared, rate-limited sender); OAuth (Google/GitHub need our own OAuth apps in production; ruled out in the brief); an allowlist in a Function env variable (every change needs a redeploy with an `--env` file); relying on disabled sign-up alone (it is a setting that can be switched back, and the smoke test has to open it temporarily).
- **What would change this:** a second learner (then roles instead of a flat allowlist), or Neon adding built-in sign-up restrictions per email. Also: the session is a 7-day partitioned (CHIPS) cookie on the Neon Auth host, and bearer sessions are not available on Managed Auth (tested 2026-09-29: `/token` with the session token as a bearer and no cookie gives 401). If Hayk's phone rejects that cookie (Safari before 18.4, or ITP flagging the host), the fix is self-managed Better Auth with the bearer plugin in a Neon Function, which would be a new decision for Hayk.

## J. The backend lives in `backend/` with its own `package.json`, lockfile and `neon.ts`, not at the repo root

- **Date:** 2026-09-29 - **Status:** active
- **Why:** It mirrors `app/`: each deployable has its own dependencies and lockfile, and the repo root stays free of a second `node_modules`. The Neon CLI finds `neon.ts` by walking up from the current folder and reuses the repo-root `.neon` link from subfolders (docs: cli/link, cli/config). `neon deploy --no-env-pull` plus `neon env pull --file ../.env.local` keeps a single `.env.local` at the root, where the scripts read it.
- **Alternatives rejected:** `neon.ts` + `package.json` at the repo root (the layout in Neon's quick starts; it puts a Node project over the whole repo and a `node_modules` next to `reference/` and `content/`).
- **What would change this:** the CLI failing to resolve `.neon` or `neon.ts` from `backend/` in practice, or a second Neon function that shares code with the app.

## I. One Hono function `api` with three routes: `GET /v1/health` (no auth, no database), `GET /v1/state`, `POST /v1/sync`

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The app needs only "load everything" and "upload a batch". Few routes mean few requests, which is the Free-plan lever. Health never queries the database, so nobody can wake the compute (and spend CU-hours) without a valid, allowlisted token. Every error is JSON with a code and a request id, with CORS headers even on errors so the app can show the message. Unknown `Origin` values are rejected with 403 (Neon's auth page says to check the origin against an allowlist rather than echo it).
- **Alternatives rejected:** a REST resource per table (more requests per session); a health check that pings the database (an unauthenticated way to keep compute awake); separate functions per job (more deploys, more cold starts).
- **What would change this:** a feature that needs server work outside a sync (e.g. Claude grading inside the app via an API call).

## H. Writes are idempotent by client-generated UUIDs; a reused id with different content is a 409 that rolls back the batch; cards, lessons and extras merge by a clear "newer wins" rule

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Retried syncs (timeouts, tab closed mid-request) must never duplicate rows. `INSERT ... ON CONFLICT DO NOTHING` on `(user_id, id)` makes a resend harmless; comparing the resent row with the stored one turns a real id collision (an app bug) into a loud 409 instead of silently keeping one version. The whole batch is one transaction. Cards keep the rule of DECISIONS.md #8 / `mergeStates`: per word, the later `last_review` wins. Lesson progress: the later `updatedAt` wins (every change in `app/src/lib/plan.ts` sets it, including un-marking "done", so a "done stays done" rule would be wrong). Extras: the larger value wins. In all three, the server returns its newer version as `stale` so a device that was offline adopts it. Each table takes the whole list as one JSON parameter (`jsonb_to_recordset`), one query per table per batch.
- **Alternatives rejected:** server-generated ids (a lost response makes the client resend and duplicate); last-write-wins by arrival time for cards (an offline phone would overwrite newer PC progress); per-row inserts (up to 1000 round trips per batch).
- **What would change this:** true concurrent editing of the same word on two devices at the same moment (not a realistic case for one learner).

## G. `GET /v1/state` returns all cards, raw reviews of the last 35 days, all-time study days, all attempts in full, lesson progress and recent extras, gzip-compressed

- **Date:** 2026-09-29 - **Status:** active
- **Why:** One request on start gives the app everything, in the app's own field names (`lessonProgress` is the app's `LessonProgress` exactly). Raw reviews are windowed because they grow fastest (~100 a day); the Stats page charts 30 days, and streaks only need the list of study days, which is sent for all time. Attempts are sent in full because the Results page shows them with Claude's reviews and they grow slowly (a few per week, ~10 KB each). Estimated reply after a year: ~1 MB raw, ~100-200 KB gzipped, ~30 MB/month of the 5 GB egress.
- **Alternatives rejected:** incremental sync with `since` cursors and a client cache (more client code to get wrong, not needed at this size); attempt summaries plus a detail endpoint (the Results page would need a second request per attempt and the score logic would have to move); all review events every time (would grow without bound).
- **What would change this:** more than ~300 attempts or a state reply over ~500 KB gzipped; then add `?since=` for attempts and events.

## F. `ReviewState.newToday.count` is derived from today's review events; only `newToday.extra` is stored (table `new_word_extras`, larger value wins)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** `count` is a per-day counter two devices would have to merge (the old `mergeStates` took the max). Counting today's `isNew` events that are not practice gives the same number from data that is already synced. `extra` ("learn more" words asked for that day, added by the other agent at ~02:00 on 2026-09-29) cannot be derived from events, so it gets a tiny per-day table; it only grows during a day, so the larger value wins, as in `mergeStates`.
- **Alternatives rejected:** storing the whole `newToday` object (a second source of truth for the count); keeping `extra` per device (the phone and the PC would disagree on how many new words are left today).
- **What would change this:** a daily limit that is not about introduced words (e.g. a time budget), or `extra` becoming able to shrink.

## E. Plain SQL migrations applied by a small Python script, node-postgres in the function, no ORM

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Six small tables and one query per table per route. Versioned `.sql` files are readable by Claude in any session, `migrate.py` records each file's SHA-256 and refuses edited history, and it uses the direct (unpooled) URL as Neon recommends. The function uses `pg` with one small module-scope pool and `attachDatabasePool`, as the Neon Functions docs require.
- **Alternatives rejected:** Drizzle (suggested by the Neon skills for new TypeScript schema work; a schema DSL and migration generator for six small tables, and the grading script would still need raw SQL); the `@neondatabase/serverless` driver (Neon says not to use it in Functions).
- **What would change this:** the schema growing past ~10 tables or queries getting complex enough that typed query building pays off.

## D. The API's upload schemas mirror the app's zod types (duplicated, strict), instead of importing `app/src/content/schema.ts`

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Importing across packages would make the function's bundle depend on `app/node_modules` being installed and on a file another agent edits for unrelated features (glossary, tests). The mirror covers six small types in ~150 lines. Strict objects make drift loud: an app field the backend does not know is a 400 naming the key, not data dropped on the way in.
- **Alternatives rejected:** importing the app schema (cross-package coupling at deploy time); loose `jsonb` with no validation (bad data would only fail later, when the app parses it on load); a shared package (restructuring `app/`, out of scope for this task).
- **What would change this:** the mirror drifting more than once; then extract the synced types into a shared package both import.

## C. Claude's scripts (migrate, progress, smoke test) are Python run with `uv run` and PEP 723 inline dependencies pinned with `==`

- **Date:** 2026-09-29 - **Status:** active
- **Why:** They run from a fresh clone with only `uv` (no `npm install` in `app/` or `backend/`), use ~60 MB of RAM against ~150 MB for a tsx process, work the same in the Linux cloud session, and follow the repo's Python rules (logging to console and `logs/`). Claude's review is checked in Python with the same rules as the app's zod `Review` schema (tested on 12 bad cases, 2026-09-29).
- **Alternatives rejected:** TypeScript via tsx importing the app's zod `Review` (one validator, but it needs both `node_modules` trees installed and couples the script to files under active edit).
- **What would change this:** the review format getting complex enough that a second validator drifts; then validate by calling the app's schema from a small tsx script.

## B. The function uses the owner-role `DATABASE_URL` that Neon injects; access is scoped by user id in code, with no row-level security

- **Date:** 2026-09-29 - **Status:** active (a default accepted, not deliberated)
- **Why:** Neon injects the owner connection string; a separate least-privilege role would need extra setup and a secret passed through `--env` on every deploy. With one user, one function and every query filtered by the verified `sub`, the extra role buys little.
- **Alternatives rejected:** a restricted Postgres role for the function; RLS policies with `auth.user_id()` (that helper belongs to the Data API path, which is not used).
- **What would change this:** a second user, third-party code in the function, or any route that builds SQL from request input.

## A. No branch policy in `neon.ts`: compute is already 0.25 CU fixed with 5-minute scale to zero

- **Date:** 2026-09-29 - **Status:** active
- **Why:** `neon projects get` on 2026-09-29 showed `autoscaling_limit_min_cu` and `autoscaling_limit_max_cu` both 0.25, and the org plan `free`. That is the cheapest compute, and scale to zero cannot be turned off on Free. A `branch` closure that restates it would make `neon deploy` touch compute settings for no gain.
- **Alternatives rejected:** pinning 0.25 CU in `neon.ts` for the default branch (no change today, and a later edit there could raise costs by accident).
- **What would change this:** the project defaults changing, or creating extra branches (then give them a TTL in `neon.ts`).
