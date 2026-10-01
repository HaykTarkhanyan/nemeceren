# Backend: Neon Auth + Functions API + Postgres

Stores Hayk's progress (word reviews, FSRS cards, test attempts, Claude's grading, lesson progress, extra new words per day, since 2026-09-30 notes with Claude's feedback and his own words with Claude's check, and since 2026-10-02 the study timer's sessions) in one private Neon Postgres database, so the PC and the phone share it. That is everything `app/src/lib/storage.ts` persists as of 2026-09-29 02:00; the per-device settings in `app/src/lib/settings.ts` (voice, rate, new words per day) stay in each browser. **Neon stays on the Free plan. Never upgrade, add billing, or enable paid features.**

```
GitHub Pages SPA (app/)  --sign in-->  Neon Auth (Managed Better Auth, email + password)
        |                                   |
        |  Authorization: Bearer <JWT>      | JWKS (public keys)
        v                                   v
Neon Function "api" (Hono, src/)  -- verifies the JWT, checks the allowlist, scopes every query by user id
        |
        v
Postgres (tables in db/migrations/)  <--  Claude: scripts/progress.py (owner role, from .env.local)
```

- No Data API / PostgREST: the browser never talks to the database, only to the function (Neon's guidance for new apps).
- Project `nemeceren` (`aged-violet-98333413`), region `aws-eu-central-1`, branch `main`. The repo-root `.neon` links it; the CLI finds it from `backend/` by walking up.
- Decisions and the reasons for them: `_knowledge/2026-09-29_neon-backend-decisions.md` (to be merged into `DECISIONS.md`).

## Files

| path | what |
|---|---|
| `neon.ts` | Neon services: `auth: true` and the function `api` (source `src/index.ts`). No function env, so no `--env` file. |
| `package.json`, `package-lock.json`, `.npmrc` | Function dependencies, exact versions (`save-exact=true`). Local Node 20.20.0 is fine; the function runs on Node 24 at Neon. |
| `src/index.ts` | Hono app: middleware (request id + log line, origin gate, CORS, gzip), routes, error handling. |
| `src/auth.ts` | JWT verification (jose, JWKS, EdDSA, issuer and audience) and the allowlist check. |
| `src/schema.ts` | zod schemas of what the app may upload. Mirror of `app/src/content/schema.ts` (see "Keeping the schemas in step"). |
| `src/sync.ts`, `src/state.ts` | `POST /v1/sync` and `GET /v1/state` SQL. |
| `src/db.ts`, `src/config.ts`, `src/errors.ts`, `src/types.ts` | pg pool, fixed settings (origins, limits), error format, request context type. |
| `db/migrations/NNN_*.sql` | Versioned schema. Never edit an applied file; add a new one. |
| `scripts/migrate.py` | Applies migrations (`status` / `apply`). |
| `scripts/progress.py` | Claude's tool: list, show and grade test attempts, list notes and write feedback on them, list and check Hayk's own words, list study timer sessions, activity summary (measured and timer minutes), allowlist. |
| `scripts/non_essential/smoke_test.py` | End-to-end check of the deployed API, as Claude's test account (`--test-account`) or a throwaway user. |

Scripts are Python run with `uv run` (dependencies pinned inline, PEP 723). They read the repo-root `.env.local` and log to the repo-root `logs/`. Run them from the repo root.

## Free-plan budget

Checked on 2026-09-29: org plan `free` (`neon orgs list -o json`), compute fixed at 0.25 CU, scale to zero after 5 minutes idle (Free cannot turn it off).

| resource | Free limit (per month) | expected use (estimate, not measured yet) | what drives it |
|---|---|---|---|
| Compute | 100 CU-hours | ~10 CU-hours | Every request that touches the database wakes it; it then runs at least 5 more minutes. 0.25 CU x (study time + 5 min) per session. |
| Storage | 0.5 GB | ~15 MB per year of data (plus ~30 MB Postgres baseline) | ~400 bytes per review with indexes, ~10 KB per attempt. |
| Egress | 5 GB | ~30 MB | `GET /v1/state` is gzip-compressed (~100-200 KB after a year of use). |
| Functions | 10 active + 400 waiting capacity-hours, 1M invocations | < 1 active hour, < 10k invocations | Billed only while a request runs. |
| Auth | 60k monthly active users | 1 | |
| Branches | 10 | 1 (`main`) | Each branch has its own function URL and auth users. |

At a Free limit Neon suspends compute until next month or blocks writes. It does not bill and does not delete data.

**Rules that keep it there (the app must follow them):**
1. Sync in batches: after a test is submitted, when a review round ends, every ~5 minutes while the tab is visible AND the outbox has something, and on tab hide. **Never send an empty batch** (the API answers 400 `empty_batch`) and **never poll**. A tab polling every 5 minutes all day would keep the compute awake ~24 h a day: 0.25 x 24 x 30 = 180 CU-hours, well over the limit.
2. Load `GET /v1/state` once on start (and after sign-in), not on every page change. Lesson position updates (saved a moment after scrolling stops) go into the outbox like everything else; never send one request per scroll.
3. `GET /v1/health` never touches the database, so it cannot wake the compute.
4. Get the token (`authClient.token()`) only right before a request. The token call itself goes to Neon Auth, which reads its tables in the same database.

Check usage: `neon projects get aged-violet-98333413 -o json` (fields `compute_time_seconds`, `synthetic_storage_size`, `data_transfer_bytes`; they can lag) and the Neon Console billing page (Functions usage is shown only there).

## Deploy and operate

All commands from `backend/` unless noted. One heavy process at a time.

```bash
npm install                                   # first time, and after changing package.json
npm run typecheck
neon config plan                              # dry run: read it; stop if it removes or changes anything unexpected
neon deploy --no-env-pull                     # auth + function "api" (bundles src/index.ts with esbuild)
neon env pull --file ../.env.local            # adds NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL, NEON_FUNCTION_API_BASE_URL to the ONE .env.local
neon functions get api                        # invocation_url, status "completed"
neon logs query --source function --since 1h  # request log lines (one JSON line per request)
```

`--no-env-pull` on deploy keeps a second `.env.local` from appearing in `backend/`; the explicit pull writes into the repo-root file, where the scripts read it. Pulls only rewrite Neon-managed lines. (The Console lists the function as `api`: the `name` in `neon.ts` was not applied on 2026-09-29. Cosmetic only.)

Measured on the first deploy (2026-09-29): `npm install` 19 s, typecheck 17 s, `neon deploy` 24 s, smoke test 8 s (49 checks); request handling 4-31 ms per request in the function logs.

One-time auth setup (after the first deploy):

```bash
neon neon-auth status
neon neon-auth domain add https://hayktarkhanyan.github.io   # the Pages origin (no path, no trailing slash)
neon neon-auth domain list
neon neon-auth domain allow-localhost get                     # must be enabled for http://localhost:5173
neon neon-auth config email-password get                      # email + password on; email verification off is fine
```

**Hayk's account:** Hayk signs up once (the app's sign-in page, from the wire-up task). Then Claude runs `uv run backend/scripts/progress.py allow-user <hayk's email>`, and sign-up is closed with `neon neon-auth config email-password update --disable-sign-up`. Until then, anyone who finds the auth URL can create an account, but the API answers them 403 (`not_allowed`): the allowlist is the real gate. Sign-up is closed since 2026-09-29 (DECISIONS.md #52), so run the smoke test as Claude's test account: `uv run backend/scripts/non_essential/smoke_test.py --test-account`. It deletes only that account's progress rows, and takes it off the allowlist for one check, restoring the entry right away. Do not reopen sign-up for it.

## Migrations

```bash
uv run backend/scripts/migrate.py status   # from the repo root; read-only
uv run backend/scripts/migrate.py apply
```

Uses `DATABASE_URL_UNPOOLED` (direct connection, as Neon recommends for DDL). Each file runs in its own transaction with its row in `schema_migrations` (name + SHA-256). A changed applied file stops the run. Tables are plain Postgres in `public`; Neon Auth keeps its own tables in `neon_auth`.

## Claude's grading workflow

From the repo root. The default user is `NEMECEREN_DEFAULT_USER` in the gitignored `.env.local` (Hayk); use `--user <email>` for anyone else.

```bash
uv run backend/scripts/progress.py summary --days 7        # per day: reviews, % correct, new words, practice, tests, measured minutes, timer minutes; words known; most-missed words; near misses; lessons
uv run backend/scripts/progress.py sessions --days 7       # study timer sessions (and time added by hand): day, minutes, start-stop in UTC, pauses, label
uv run backend/scripts/progress.py ungraded                # attempts without a review, with their ids
uv run backend/scripts/progress.py show <attempt-id>       # every item: question, answer, expected, status, near misses, hints, time
uv run backend/scripts/progress.py show <attempt-id> --json
uv run backend/scripts/progress.py review <attempt-id> review.json    # or "-" to read stdin
uv run backend/scripts/progress.py review <attempt-id> review.json --replace   # overwrite an existing review
uv run backend/scripts/progress.py users                   # auth users, allowed or not, row counts
```

The review JSON is the `review` object from `progress/README.md` (`gradedAt` may be left out: the script fills in now):

```json
{
  "summary": "Good start. Verbs are lowercase (komme). Practise verb position 2.",
  "items": [
    { "index": 1, "correct": false, "correction": "Ich komme aus Armenien.", "note": "Verbs are lowercase." },
    { "index": 2, "correct": true, "note": "Fine." }
  ]
}
```

The script checks it with the same rules as the app's zod `Review` schema (known keys only, non-empty summary, each `index` in range and at most once, `correct` true/false, optional non-empty `correction`/`note`) and warns about `pending` items left without a verdict. It refuses to overwrite an existing review without `--replace`. The app shows the review on its next load. Measured minutes in `summary` use the Stats page caps (2 min per card, 20 min per test item); timer minutes are the study sessions Hayk timed or added by hand (DECISIONS.md #62), not deleted, without pauses. Days are the `localDay` the app recorded; the `--days` window ends at the local date of the machine running the script. A day with a timer session counts as a study day.

Notes (Hayk's free writing, DECISIONS.md #53):

```bash
uv run backend/scripts/progress.py notes --pending                    # notes without feedback yet, oldest first (without --pending: all not deleted)
uv run backend/scripts/progress.py note <note-id>                     # one note in full, with its feedback
uv run backend/scripts/progress.py note-feedback <note-id> feedback.json   # or "-" for stdin; --replace to overwrite
uv run backend/scripts/progress.py self-check                         # offline check of the feedback validator (no database)
```

The feedback JSON is `NoteFeedback` in `app/src/content/schema.ts` without `at`, which the script sets (see `progress/README.md`). The script checks it with the same rules as the app, including the text format of `summary` (a port of `app/src/content/richtext.ts`), because the app refuses to load a state with a feedback it cannot show. Once a note has feedback it is locked: the API refuses to change its text or delete it. A deleted note gets no feedback.

Hayk's own words ("My words", DECISIONS.md #58):

```bash
uv run backend/scripts/progress.py my-words --unchecked                       # words without Claude's check yet, oldest first (without --unchecked: all not deleted)
uv run backend/scripts/progress.py check-word <word-id> ok [--note "..."]      # fine as it is
uv run backend/scripts/progress.py check-word <word-id> fix --de "der Stau" [--en ..] [--plural "die Staus"] [--note "..."]
```

The check is `WordCheck` in `app/src/content/schema.ts` (`{ at, ok, note?, fixed?: { de?, en?, plural? } }`), validated with the same rules (`validate_word_check`, covered by `self-check`). `ok` takes no fixed fields, `fix` needs at least one that differs from what Hayk wrote. A second check needs `--replace`; a deleted word gets none. The write only succeeds if the word has not changed since the script read it. When Hayk edits the word, the sync clears the check, so the word is unchecked again.

## API contract (for the "wire the app" task)

Deployed 2026-09-29 on branch `main` (both are public values, not secrets; they can live in the app's code or as `VITE_*` variables at build time):
- API: `https://br-muddy-river-b1aba4sv-api.compute.c-5.eu-central-1.aws.neon.tech` (`NEON_FUNCTION_API_BASE_URL`)
- Auth: `https://ep-sweet-morning-b1ujs35d.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth` (`NEON_AUTH_BASE_URL`)

CORS: only `https://hayktarkhanyan.github.io` and `http://localhost:5173`. Any other `Origin` gets 403 `forbidden_origin` (requests without an Origin, like curl, go on to the token check). Allowed request headers: `authorization`, `content-type`. Exposed response header: `x-request-id`. Preflights are cached 2 hours. Every reply has `Cache-Control: no-store`.

### Auth flow

1. Client: `@neondatabase/auth` (auth only; the SDK is not installed yet, the wire-up task pins it).
   ```ts
   import { createAuthClient } from '@neondatabase/auth'
   export const authClient = createAuthClient(NEON_AUTH_URL)
   await authClient.signIn.email({ email, password })        // { data, error }; signUp.email({ email, password, name }) once for Hayk
   const { data, error } = await authClient.getSession()     // JWT in data.session.token, valid 15 minutes
   fetch(`${API}/v1/state`, { headers: { Authorization: `Bearer ${data.session.token}` } })
   ```
   Not `authClient.token()`: in `@neondatabase/auth` 0.5.0-beta it answers from the SDK's session cache with `{ session, user }` instead of `{ token }` (found by the app's integration check on 2026-09-29; see `app/src/lib/auth.ts` and DECISIONS.md #40).
2. The function checks the signature (EdDSA, keys from `NEON_AUTH_JWKS_URL`), `iss` and `aud` (= the Auth URL's origin), `exp`, and that `sub` is on the allowlist.
3. The Neon docs disagree on cross-origin cookies: the JWT page says to pass `fetchOptions: { credentials: 'include' }` to `createAuthClient` when the SPA and the Auth URL are on different origins, while the Managed Auth skill says not to put `fetchOptions` on the URL-style config (use an adapter's options instead). Check the installed SDK's types and test on localhost and on Pages.

**Biggest open risk: third-party cookies.** The session lives in a cookie of the Neon Auth host, which is a third party for `hayktarkhanyan.github.io`, and minting a JWT (`/token`) needs that cookie. Measured on 2026-09-29 with throwaway users (deleted afterwards):
- The cookie is `__Secure-neon-auth.session_token; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`: a 7-day session in a **partitioned** (CHIPS) cookie.
- The auth host answers the Pages origin with `Access-Control-Allow-Origin: https://hayktarkhanyan.github.io` and `Access-Control-Allow-Credentials: true`, so `credentials: 'include'` requests work.
- **Bearer sessions are not available** on Managed Auth: sending the sign-up response's session `token` as `Authorization: Bearer` without the cookie gives `/token` 401 and `/get-session` no user, and no `set-auth-token` header is returned (Better Auth's bearer plugin is not enabled; `neon neon-auth plugins list` does not offer it).
- Safari blocks unpartitioned third-party cookies, but since Safari 18.4 (iOS 18.4) it accepts `Partitioned` ones, except for domains its tracking prevention (ITP) has flagged (cookiestatus.com/safari). So iPhone Safari on iOS 18.4+ should work, older iOS will not.

Test sign-in, reload, and `token()` after 15+ minutes on Hayk's actual phone before building the rest of the wiring. If it fails there, the fallback that removes cookies entirely is self-managed Better Auth with the bearer plugin inside a Neon Function (same database; a bigger change, and a technology choice for Hayk). The backend itself does not care how the app gets its JWT.

### `GET /v1/health`

No auth, no database. `200 {"ok": true, "service": "nemeceren-api", "apiVersion": "1", "time": "..."}`.

### `GET /v1/state?days=35`

Everything the app needs on start, from one snapshot. `days` = window for raw review events (1-400, default 35; the Stats charts use 30 days).

```json
{
  "serverTime": "2026-09-29T10:00:00.000Z",
  "userId": "<neon auth user id>",
  "reviewEventsSince": "2026-08-25T10:00:00.000Z",
  "cards": { "termin": { "due": "...", "stability": 2.3065, "difficulty": 2.1181, "elapsed_days": 0, "scheduled_days": 0, "learning_steps": 1, "reps": 1, "lapses": 0, "state": 1, "last_review": "..." } },
  "reviewEvents": [ { "id": "<uuid>", "ts": "...", "localDay": "2026-09-29", "timeMs": 8420, "wordId": "uhr", "de": "die Uhr", "mode": "production", "rating": 1, "answer": "Uhr", "correct": false, "nearMiss": ["article_missing"], "isNew": true, "stateBefore": 0, "stateAfter": 1, "due": "..." } ],
  "studyDays": ["2026-09-28", "2026-09-29"],
  "attempts": [ { "id": "<uuid>", "version": 1, "testId": "...", "testTitle": "...", "level": "A1", "mode": "browser", "startedAt": "...", "submittedAt": "...", "localDay": "2026-09-29", "lessonId": "u1-01-sich-vorstellen", "section": 3, "score": { "correct": 6, "wrong": 3, "pending": 2, "total": 11 }, "items": [ ... ], "review": { ... } } ],
  "lessonProgress": { "version": 1, "lessons": { "u1-01-sich-vorstellen": { "startedAt": "...", "updatedAt": "...", "lastSection": 3, "doneAt": null } } },
  "newWordExtras": { "2026-09-29": 5 },
  "notes": [ { "id": "<uuid>", "text": "Ich heiße Hayk.", "localDay": "2026-09-30", "createdAt": "...", "updatedAt": "...", "deletedAt": null, "feedback": null } ],
  "customWords": [ { "id": "u-<uuid>", "de": "Stau", "en": "traffic jam", "example": { "de": "Ich stehe im Stau." }, "createdAt": "...", "updatedAt": "...", "check": { "at": "...", "ok": false, "note": "...", "fixed": { "de": "der Stau" } } } ],
  "studySessions": [ { "id": "<uuid>", "startedAt": "...", "endedAt": "...", "activeMs": 2520000, "localDay": "2026-10-02", "label": "lesson 0.3", "createdAt": "...", "updatedAt": "..." } ]
}
```

- `cards`: every card, keyed by word id (the `cards` of `ReviewState`).
- `reviewEvents`: oldest first; each is a `ReviewLogEntry` plus `id` (strip `id` before `parseReviewLog`, whose objects are strict). `timeMs` is left out when unknown, `practice: true` is present only on practice reviews.
- `studyDays`: every local day with a review (practice included), an attempt with at least one answered item, or a study session that is not deleted (DECISIONS.md #62), over all time. Use it for streaks and "days this week/month"; the raw events only cover the window.
- `attempts`: newest first; each is a `Result` plus `id`. `lessonId` + `section` only on lesson exercises, `review` only once Claude graded it. The attempt `id` replaces the old file name as the attempt id (e.g. `TestItemEvent.attemptId`).
- `lessonProgress`: the app's `LessonProgress`, exactly.
- `newWordExtras`: extra new words asked for, per local day in the window.
- `notes`: every note that is not deleted, newest first (by `createdAt`), all time. `deletedAt` is always null here; `feedback` is Claude's `NoteFeedback` or null. Stale notes in a sync reply have the same shape.
- `customWords`: Hayk's own words that are not deleted, oldest first (by `createdAt`), all time, in the app's `CustomWord` shape: optional keys (`plural`, `example`, `note`, `check`) are left out when empty; `deletedAt` is never present here (a stale word in a sync reply can have it). `check` is Claude's `WordCheck`. The word's FSRS card and reviews are in `cards` and `reviewEvents` under the same `u-...` id.
- `studySessions`: the study timer's sessions (and time added by hand) that are not deleted and **started in the same window as `reviewEvents`** (`startedAt >= reviewEventsSince`, i.e. the last `days` days, default 35), oldest first, in the app's `StudySession` shape: `label` and `manual` (only ever `true`) are left out when empty, `deletedAt` is never present here (a stale session in a sync reply can have it). Older sessions still count in `studyDays`.
- `ReviewState.newToday` is built, not stored: `count` = `reviewEvents.filter(e => e.localDay === today && e.isNew && !e.practice && !e.wordId.startsWith('u-')).length` (own words are introduced outside the daily limit, DECISIONS.md #58), `extra` = `newWordExtras[today]` (leave the key out when missing or 0, as `srs.ts` does).

### `POST /v1/sync`

`Content-Type: application/json`, at most 2 MB, one transaction. Any subset of the eight lists; at least one item in total.

```json
{
  "reviewEvents": [ { "id": "<crypto.randomUUID()>", "...": "every ReviewLogEntry field; localDay required" } ],
  "cards": [ { "wordId": "uhr", "card": { "...": "StoredCard" } } ],
  "attempts": [ { "id": "<crypto.randomUUID()>", "...": "every Result field except review; localDay required" } ],
  "lessons": [ { "lessonId": "u1-01-sich-vorstellen", "startedAt": "...", "updatedAt": "...", "lastSection": 3, "doneAt": null } ],
  "newWordExtras": [ { "localDay": "2026-09-29", "extra": 5 } ],
  "notes": [ { "id": "<crypto.randomUUID()>", "text": "Ich heiße Hayk.", "localDay": "2026-09-30", "createdAt": "...", "updatedAt": "...", "deletedAt": null } ],
  "customWords": [ { "id": "u-<crypto.randomUUID()>", "de": "Stau", "en": "traffic jam", "plural": "...", "example": { "de": "...", "en": "..." }, "note": "...", "createdAt": "...", "updatedAt": "...", "deletedAt": "..." } ],
  "studySessions": [ { "id": "<crypto.randomUUID()>", "startedAt": "...", "endedAt": "...", "activeMs": 2520000, "localDay": "2026-10-02", "label": "lesson 0.3", "manual": true, "createdAt": "...", "updatedAt": "...", "deletedAt": "..." } ]
}
```

Limits per request: 1000 review events, 2000 cards, 20 attempts, 500 lessons, 31 extras, 50 notes, 20 custom words, 100 study sessions; ids (and word ids, lesson ids, days) unique within a batch. A note's text is 1 to 5000 characters and not only whitespace; `updatedAt` is not before `createdAt`. A custom word's id is `u-` + a lowercase UUID; `de` (at most 100 characters) and `en` (200) are required, `plural` (100), `example.de`/`example.en` (300 each) and `note` (500) are optional and left out when empty, never blank; `deletedAt` is present only for a deleted word; `updatedAt` is not before `createdAt`. Review events and cards take `u-...` word ids like any other word id. A study session has `endedAt` not before `startedAt`, `activeMs` (the running time without pauses, whole milliseconds) from 0 to the time between `startedAt` and `endedAt` and at most 16 hours, `localDay` = the local day of `startedAt`, an optional `label` of 1 to 100 characters (not only whitespace; left out when empty), `manual: true` only for a session added by hand (left out otherwise), `deletedAt` only for a deleted one, and `updatedAt` not before `createdAt`. The table repeats these rules as CHECKs (`004_study_sessions.sql`).

```json
{
  "ok": true,
  "serverTime": "...",
  "reviewEvents": { "received": 3, "inserted": 3, "duplicates": 0 },
  "cards": { "received": 2, "written": 1, "unchanged": 0, "stale": [ { "wordId": "termin", "card": { "...": "the server's newer card" } } ] },
  "attempts": { "received": 1, "inserted": 1, "duplicates": 0 },
  "lessons": { "received": 1, "written": 1, "unchanged": 0, "stale": [] },
  "newWordExtras": { "received": 1, "written": 0, "unchanged": 0, "stale": [ { "localDay": "2026-09-29", "extra": 8 } ] },
  "notes": { "received": 1, "written": 0, "unchanged": 0, "stale": [ { "id": "...", "text": "...", "localDay": "...", "createdAt": "...", "updatedAt": "...", "deletedAt": null, "feedback": { "summary": "...", "at": "..." } } ] },
  "customWords": { "received": 1, "written": 1, "unchanged": 0, "stale": [] },
  "studySessions": { "received": 1, "written": 1, "unchanged": 0, "stale": [] }
}
```

Idempotency, so a retry after a timeout is always safe:
- Review events and attempts are inserted by `id`. The same id with the same content again counts as a duplicate. The same id with different content is **409 `conflict`**, and the whole batch is rolled back (an app bug: ids must be fresh `crypto.randomUUID()` values).
- Cards: per word, the card with the later `last_review` wins (the rule of `mergeStates` in `app/src/lib/srs.ts`).
- Lessons: per lesson, the record with the later `updatedAt` wins (every change in `app/src/lib/plan.ts` sets `updatedAt`, including un-marking "done").
- Extras: per day, the larger `extra` wins (it only grows during a day; `mergeStates` takes the max too).
- Notes: per note, the record with the later `updatedAt` wins; a delete is a record with `deletedAt` set (soft delete). **A note with Claude's feedback is locked:** it is never changed or deleted, and whenever the upload differs from it the server's version, with its `feedback`, comes back in `stale`. The app adopts it and tells Hayk that his change was not saved, with the changed text.
- Custom words: per word, the record with the later `updatedAt` wins; a delete is a record with `deletedAt` set (soft delete, so the word leaves practice while its reviews stay for the statistics). **A newer version whose fields (`de`, `en`, `plural`, `example`, `note`) differ from the stored ones clears Claude's check**, so Claude looks again; the same fields with a later time (a delete) keep it. A stale word comes back with its `check`.
- Study sessions: per session, the record with the later `updatedAt` wins (Hayk can edit the minutes and the label); a delete is a record with `deletedAt` set (soft delete).
- For those six, an older or equal value is not written, and when the server has a newer one it comes back in `stale`: adopt it locally.
- Attempts must not contain `review`, notes must not contain `feedback`, and custom words must not contain `check` (400). Only Claude writes those.

### Errors

Always JSON: `{"error": {"code", "message", "details"?}, "requestId"}`, with CORS headers for the allowed origins, so the app can show the message. Look up `requestId` with `neon logs query --source function`.

| status | code | meaning / what the app does |
|---|---|---|
| 400 | `invalid_body` | failed validation; `details.issues` lists `{path, message}` (first 20). Keep the outbox and show the error: it is a bug. |
| 400 | `invalid_json`, `invalid_query`, `invalid_data`, `empty_batch` | bad JSON, bad `days`, database rejected a value, nothing to sync |
| 401 | `unauthorized` | no, malformed or invalid token |
| 401 | `token_expired` | call `authClient.token()` again and retry once |
| 403 | `not_allowed` | signed in, but not on the allowlist (Claude runs `progress.py allow-user`) |
| 403 | `forbidden_origin` | page served from an origin not in `src/config.ts` |
| 404 | `not_found` | unknown route |
| 409 | `conflict` | reused id with different content; batch rolled back; `details.ids` |
| 413 | `payload_too_large` | split the batch |
| 415 | `unsupported_media_type` | send `Content-Type: application/json` |
| 500 | `internal` | look up the request id in the logs |
| 503 | `auth_unavailable` | Neon Auth keys could not be fetched; retry later |

### Suggested client flow

- **Outbox** in localStorage, written before the network: review events (with a fresh id), the latest card per word, submitted attempts (with a fresh id), the latest record per lesson, the latest extra per day. On a 200, remove exactly what was sent (a card, lesson or extra only if it has not changed since), and adopt everything in `stale`.
- **Flush** as in the budget rules. On tab hide, `fetch(..., { keepalive: true })` only works for bodies under 64 KB; the outbox survives anyway and the next start flushes it.
- **Check for feedback** (Notes page): one more `GET /v1/state`, only when Hayk presses the button. Never on a timer.
- **Start:** sign-in check, then flush the outbox if it has anything, then `GET /v1/state`. Build `ReviewState` from `cards` merged with outbox cards (later `last_review` wins) and `newToday` as above; results from `attempts`; `LessonProgress` from `lessonProgress` merged with outbox lessons (later `updatedAt` wins); the Stats events from `reviewEvents` + `attempts[].items` + `studyDays`.
- Settings (`voice`, `rate`, `newPerDay`) stay per device in localStorage, as today.

## Keeping the schemas in step

`src/schema.ts` mirrors `ReviewLogEntry`, `StoredCard`, `Result`, `ResultItem`, the entries of `LessonProgress` and `ReviewState.newToday.extra` from `app/src/content/schema.ts` (as of 2026-09-29 02:00), the note record (`NoteRecord` in `app/src/lib/outbox.ts`, text rules of `NoteText`, since 2026-09-30), the custom word record (`CustomWordRecord` in `app/src/lib/outbox.ts`, fields and limits of `CustomWordFields` / `CUSTOM_WORD_MAX`, since 2026-09-30), and the study session record (`StudySessionRecord` in `app/src/content/schema.ts`, with `STUDY_LABEL_MAX` and `STUDY_SESSION_MAX_MS`, since 2026-10-02), with strict objects: a new field in the app is a loud 400 naming the key until it is added here too. Anything new that `app/src/lib/storage.ts` starts to persist needs a table, a sync list and a state field. When one of those types changes: update `src/schema.ts`, add a migration if a column changes, redeploy, and rerun the smoke test. Claude's review rules are mirrored in `scripts/progress.py` (`validate_review`), the note feedback rules (`NoteFeedback`, including the text format) in `validate_note_feedback`, and the word check rules (`WordCheck`) in `validate_word_check`; `progress.py self-check` tests the last two.

## Security notes

- The function has a public URL. Every data route verifies the JWT and the allowlist before any work; queries are always filtered by the verified user id, never by an id from the request.
- The function uses the injected owner-role `DATABASE_URL`; there is no row-level security. Scoping lives in the code.
- Connection strings and tokens are never logged or printed (the smoke test's password is random and not logged).
