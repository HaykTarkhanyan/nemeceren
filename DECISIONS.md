# Decisions

Newest at the top. Never delete a superseded entry - mark it and add a new one.

## 52. Sign-up stays closed; Claude has a permanent test account for browser checks; the sign-in page no longer offers sign-up (decided with Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - After Hayk's account was allowlisted, sign-up was disabled in Neon Auth (`neon neon-auth config email-password update --disable-sign-up`). Verified: a sign-up request now gets HTTP 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
  - Browser checks of pages behind sign-in need an account whose progress Claude may change freely, so the checks don't write into Hayk's data. Hayk chose a test account and asked to keep it for future tests: `claude-test@example.com`, allowlisted. Its password is only in the gitignored `.env.local` (`NEMECEREN_TEST_EMAIL`, `NEMECEREN_TEST_PASSWORD`).
  - `neon neon-auth user create` cannot set a password, so the account was made by reopening sign-up for a few seconds with Hayk's OK. The same user check afterwards showed exactly two users: Hayk and the test account.
  - `backend/scripts/progress.py` now defaults to the only allowed user apart from the test account, so grading still targets Hayk without `--user`.
  - The sign-in page hides the "Create one" link (`SIGN_UP_OPEN = false` in `AuthGate.tsx`), because it could only lead to the server's error. The sign-up code stays, for the day sign-up is reopened.
  - Same pass: the Words page labels unopened lessons "(not opened yet)", shorter than the "(not opened yet: its words will be new)" in #50, because it repeated on every line. The note under the select still explains it.
- **Alternatives rejected:** Hayk signing in himself in the test browser (the checks would then have to avoid anything that saves, such as opening lessons or reviews); a throwaway account per check (every check would need sign-up reopened).
- **What would change this:** a second real learner (then reopen sign-up for them and allowlist them); the Better Auth admin API becoming usable to set passwords, so sign-up never has to be reopened.

## 51. The Daily page ("German in the wild") unlocks one day of `content/daily.json` per local calendar day, has no word popups and is not glossary-checked (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - Each day brings a joke, a fun fact and an everyday sentence, each with a breakdown. It is deliberately not tied to Hayk's level.
  - Day 1 unlocks on `startDate` in Hayk's local date (`dates.ts` `localDay`, like every other day count in the app), then one more day per calendar day. Today's day comes first, earlier days are a collapsed archive (`<details>`, newest first), and later days are never rendered, so each day is a surprise. They are still in the bundle (~29 KB of JSON). From the last day on, the page says "That's all N days so far. Ask Claude for more."
  - Jokes show every line but the last. The punchline, its translation, the breakdown and the explanation come after "Show punchline". The joke's title is also held back until then, and it is left out of the archive summary, because titles like "The knocking lettuce" give the punchline away.
  - No popups (a new `daily` gate surface), and daily.json is not in the glossary: the breakdown is the gloss, and puns use made-up words that no dictionary has.
  - check-content validates the schema, `d01, d02, ...` in order, a real `startDate`, and non-empty lines and breakdowns. It prints how many days are left after today, because this runway runs on the calendar, not on progress in Neon (#44).
- **Alternatives rejected:** tying the days to study days instead of calendar days (a missed day would hold the next joke back, and a daily feature should not feel like homework); fetching future days from the API so they cannot be peeked at (a backend change for a joke page, and Hayk has no reason to cheat); popups with glossary entries for every pun word (made-up words would need hand-written entries that only repeat the breakdown).
- **What would change this:** Hayk wanting to catch up on missed days in order, or wanting to mark favourites (then days need saved progress).

## 50. A word review can be limited to one unit or one lesson; a picked unit or lesson brings its words even if not opened yet (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active; refines #26 (lessons unlock their words when opened)
- **Why:**
  - Hayk wants to choose where the words in a review come from. The Words page has a "Words from" select: all words (the default, unchanged), a whole unit, or one lesson, grouped by unit in course order. Only lessons that list words are offered.
  - The pick filters the words for due reviews, new words (still within the daily limit, in `words.json` order) and weak-word practice. It never changes FSRS: `wordsForSource` (`lib/plan.ts`) only chooses which words enter the queue.
  - Picking a lesson that was not opened yet includes its words as new words, because picking it is the explicit choice to learn them. A unit works the same way for all its lessons: one rule is easier to predict than "lessons yes, units no". The select marks unopened lessons "(not opened yet: its words will be new)", and a note under it says how many lessons of a picked unit are unopened. Picking does not mark the lesson as started.
  - The pick is remembered per device as a setting (`wordSource` in `lib/settings.ts`, e.g. `"lesson:u2-03-plural"`), so it reuses the existing per-device storage. A save error is reported through the error banner, and the pick still applies until the page is left. A saved pick whose unit or lesson no longer exists falls back to all words, with a note on the page.
  - If the pick has nothing due and no new words today, the page says so and offers "Switch to all words".
- **Alternatives rejected:** a unit pick that keeps the unopened-lesson rule (Hayk picks Unit 2 and sees 0 new words with no obvious reason); a separate review queue or schedule per unit (FSRS keeps one schedule per word, #25); remembering the pick in the account (a device setting like the daily limit; no need to sync it).
- **What would change this:** Hayk picking unopened lessons and then meeting words before their explanation too often (then ask before including them), or wanting several lessons at once.

## 49. A theme button in the header cycles System, Light and Dark; the choice is per device, applied before the first paint (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - The colours were two sets of CSS variables switched by `@media (prefers-color-scheme: dark)`. They are now switched by `data-theme="dark"` on `<html>`, so a manual choice and the system setting use the same dark block. System is the default.
  - A tiny inline script in `index.html` reads `localStorage["nemeceren.theme"]` and sets `data-theme` before the stylesheet paints, so there is no flash. `lib/theme.ts` then owns it: it follows the device setting live while System is chosen, and saves changes.
  - Storage is read and written in try/catch. If it cannot be read, or holds an unknown value, the app uses System and reports it in the error banner. The inline script cannot use the error banner, so it falls back quietly, and `theme.ts` reports the same failure at start-up.
  - The button shows the current mode as an icon (half circle, sun, moon) and says the next one in its tooltip. It sits next to the sync dot, so it is one tap away on the phone too.
  - Both themes keep the existing colour tokens, so popups, badges and warnings look as they did in each mode.
- **Alternatives rejected:** CSS `light-dark()` (one list of colours, but Safari only since 17.5, and a browser without it would get no colours at all); a Light/Dark toggle without System (Hayk could not go back to following the phone); a select on the Settings page only (a theme is switched on the spot, when a room gets dark).
- **What would change this:** a third theme (e.g. high contrast), or a flash of the wrong theme seen on the phone.

## 48. The header fits on one line from 900 px: the sync status is a coloured dot, and the header is wider than the page; on a phone the nav is a 4-column grid

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - With 8 links (Home, Lessons, Topics, Words, Daily, Results, Stats, Settings) the header wrapped on a 1180 px window. The real limit was the 760 px page width, which the header shared.
  - The header now has its own maximum width, 960 px. The sync status in the header is a coloured dot (green synced, amber unsynced or offline, red error) with the full text as its tooltip and label. The dot links to Settings, where the full status line still is, and "Sync now" still appears next to it whenever there is something to send. Links are a little tighter (8 px padding instead of 10).
  - Estimated with the system font, the widest case (unsynced changes, so "Sync now" shows) is about 800 px of the 868 px a 900 px window gives. Below 900 px the nav takes its own row. From 520 px down it is a 4-column grid: two rows of 4 equal buttons, all visible, no scrolling. Not checked in a browser.
- **Alternatives rejected:** a horizontally scrolling nav row on the phone (hides Stats and Settings off-screen); a menu button (hides everything behind a tap and needs open/close state); shorter link names (less clear for no real gain).
- **What would change this:** more nav entries (a ninth fits the grid, 3 rows), or the header still wrapping on Hayk's screen (then measure it and move Settings behind the brand or into a menu).

## 47. The English-to-German word review ignores punctuation and treats phone apostrophes as '

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Phrase cards like "Noch einmal, bitte" and "Wie geht's" failed on a missing comma or a curly apostrophe (’) from a phone keyboard. `checkWord` (`lib/text.ts`) now turns `, . ! ? ; :` and quotation marks into spaces and ’ ‘ ` ´ into ' before comparing. Capitals and umlauts still count, with their near-miss labels, and nouns still need their article. Tests keep their own, stricter comparison, because there the exact spelling can be the point of an item.
- **Alternatives rejected:** ignoring apostrophes completely ("gehts" for "geht's" would pass; the apostrophe is part of the spelling); a case-insensitive comparison (German capitalisation is part of the word, and a slip is already labelled "case").
- **What would change this:** a card whose punctuation carries meaning, e.g. a word-bank entry that is a question you must mark as one.

## 46. Word popups: at a sentence start curated entries come first; the popup merges readings that share lemma, form and gloss list

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - At a sentence start, `lookup()` put the lowercase key first and dropped later duplicates (same lemma, part of speech and form). So a curated capitalized key ("Gut", "Welche", "Es") lost to the lowercase entry and its note never showed. Now the curated key comes first: the capitalized curated key before the lowercase one (Claude wrote it for that spelling), and a curated lowercase key before a generated capitalized one. The learner-level filter and the level sort stay as they were, so at the same level a curated entry wins the duplicate check.
  - Many generated words had the same gloss under 2-3 parts of speech ("aus": adverb, adjective, preposition, each "from (a country or city)"). The popup now shows them as one line with the parts of speech joined, keeping every note, and the noun's article and plural if the noun is merged in. Merged are entries with the same lemma, form and gloss list; "seit" stays two lines ("since" and "since, for").
  - The 38 curated stopgap entries from the content review (commit 3d6eb8a) are left in place. Some of them fixed misleading generated glosses and are still needed.
- **Alternatives rejected:** changing the dedupe key to ignore the part of speech in `lookup()` (would change what check-content and the other callers see; the merge is a display matter); merging entries with different lemmas or forms (the headword or form line would be wrong for one of them).
- **What would change this:** a popup that looks wrong after a merge, e.g. two parts of speech whose same gloss means different things.

## 45. A Topics page links to lesson sections by id; section ids live on the blocks, topics in `content/topics.json` (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - Hayk wanted a list of "the topics I need to study": lesson sections worth revisiting, grouped, with the key tables starred. Claude drafted 66 items in 4 groups (pronunciation, grammar, phrase kits, word themes).
  - Lesson blocks got an optional `id` (kebab-case, unique within the lesson); `topics.json` names lesson + section id. Ids, not section indexes, so inserting a block into a lesson does not silently move every link. The 65 ids were added to the lesson files by inserting one line per block (65 insertions, no other change).
  - check-content checks that every topic's lesson and section exist, group ids are unique, and no section is listed twice in one group. The same section may be in two groups: "Male and female job names" is a grammar point and the "Jobs" word theme.
  - A topic links to `#/lesson/<id>/<section id>`. The lesson page scrolls that section into view and highlights it for 2.5 s; the hash keeps the section, so a direct link or a reload lands there too. Without a section id it still returns to where Hayk left off. An unknown section id shows an error with a link to the lesson start.
  - Lessons have no lock: the Lessons page links every lesson, and opening one starts it and unlocks its words (#26). Topic links behave the same way. So opening a Unit 2 topic early starts that lesson and adds its words to the daily new words.
- **Alternatives rejected:** section indexes in topics.json (break when a lesson gets a new block); anchors inside the hash (`#/lesson/x#sec`, the hash router has one hash); generating the topics from block titles (many blocks have no title, and choosing what is worth revisiting is the teacher's job).
- **What would change this:** Hayk opening topics of later units by accident and getting their words early (then open topics of unstarted lessons read-only, without starting the lesson).

## 44. check-content validates content only; the content runway is shown only on the Stats page

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The runway (words not introduced yet, untaken tests, unfinished lessons, #27) depends on Hayk's progress, which is now in Neon (#21). check-content runs in CI and must work offline without secrets, so it prints only the content totals and points to the Stats page and `uv run backend/scripts/progress.py summary`.
- **Alternatives rejected:** giving check-content a database connection (a secret in CI, and a network dependency for a content lint); keeping a progress snapshot in the repo for it to read (the file storage #21 retired).
- **What would change this:** Claude needing the runway often while writing content; then add it to `progress.py summary`, which already reads the database.

## 43. Login is one page with a "create account" toggle; the PC and the phone use the same backend, and the dev-server file API is gone

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - Hayk creates exactly one account, then sign-up is closed (#39), so "Create one" is a toggle on the sign-in page, not its own route. Passwords need 8+ characters (Better Auth's default minimum).
  - After sign-up the API answers 403 `not_allowed` until Claude allowlists the account. The app then says "Account created. Ask Claude to activate it (allowlist)." with a "Try again" button, instead of a generic error. Every other auth or API error is shown with its message and HTTP status.
  - Sign-out first tries to sync. If changes are still unsynced it asks, and keeps them on the device; they sync after the next sign-in to the same account.
  - The app remembers the last signed-in user, so with no network it starts from the cached copy of the last state (#41) instead of a sign-in page it cannot use.
  - `npm run dev` (localhost:5173) and GitHub Pages talk to the same API. The dev-server file API (`app/server/progress-plugin.ts`), the baked-in review snapshot and the phone merge (`mergeStates`) are removed: one storage path to test instead of two. `npm run preview` (port 4173) cannot sign in, because the API only allows the origins `http://localhost:5173` and `https://hayktarkhanyan.github.io` (#37). Adding 4173 would mean a backend redeploy for a rarely used command.
- **Alternatives rejected:** keeping the file API on the PC (progress split between the repo and Neon); a separate sign-up page; magic links or OTP (#39).
- **What would change this:** a second learner, or Hayk wanting to use the app without an account.

## 42. The outbox is sent after a test or lesson exercise, after a review round, every 5 minutes while visible, when the tab is hidden, when the device comes back online, and with "Sync now"; never on a timer when it is empty

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - A submitted test is what Claude grades next, so it syncs at once.
  - A review round ends naturally, so one request covers ~10-50 cards instead of one per card.
  - The 5-minute timer catches lesson reading positions and long rounds, and only fires while the tab is visible and the outbox has something.
  - The tab being hidden (phone switching apps, window closed) uses `fetch` with `keepalive`, when the body is under 60,000 characters (browsers cap keepalive bodies at 64 KiB; a bigger batch waits for the next trigger).
  - An empty outbox never makes a request, and nothing polls for the other device's changes. They appear at the next start. Estimate: 5-15 requests on a study day.
- **Alternatives rejected:** a request per change (~100 a day, and every one fails offline); only a manual "Sync now" (easy to forget on the phone); polling `/v1/state` for live updates from the other device (keeps the compute awake on the Free plan, and one learner uses one device at a time).
- **What would change this:** Hayk using two devices at the same time and wanting live updates, or CU-hours climbing toward the Free limit (then lengthen the timer).

## 41. Unsynced changes wait in a per-user outbox in localStorage; the app shows the server state merged with the outbox, with the server's own rules

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - localStorage survives reloads and offline use. Its writes are synchronous, so a submitted test is stored before the tab can close.
  - A study day is well under 1 MB (~100 reviews at ~0.5 KB, attempts at ~10 KB) against a ~5 MB limit.
  - Keys carry the user id (`nemeceren.outbox.<id>`, `nemeceren.state.<id>`), so a second account in the same browser never sends someone else's changes.
  - The last `/v1/state` reply is cached too, so the app can start offline.
  - The merged view uses the same rules as the server (#36): per word the later `last_review`, per lesson the later `updatedAt`, the larger extra. So what Hayk sees before a sync is what the server keeps. Stale replies are adopted.
  - A 409 or 400 is an app bug. It shows a banner, keeps the outbox and stops automatic syncs until "Sync now", because resending the same batch would fail again and spend requests. A 5xx or `auth_unavailable` is retried at the next trigger. Offline shows in the status line, not as an error.
  - The outbox logic is pure functions (`app/src/lib/outbox.ts`), tested apart from `fetch` (`outbox.test.ts`, and `storage.test.ts` with a fake API).
- **Alternatives rejected:** IndexedDB (an async API and more code, and nothing here needs its size); memory or sessionStorage (lost on reload or tab close); sending each change as it happens (#42).
- **What would change this:** the outbox nearing the storage limit (weeks offline), or a browser evicting localStorage while changes are unsynced (Safari's 7-day cap on script-writable storage). Then move the outbox to IndexedDB with `navigator.storage.persist()`.

## 40. The app uses Neon's auth SDK `@neondatabase/auth` 0.5.0-beta with the vanilla Better Auth adapter, loaded as a separate chunk; the API token comes from `getSession()`, not `token()`

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - It is Neon's client for Managed Auth. The neon-auth skill says to stay on this wrapper, not bare `better-auth/client`, because it pins the plugin list and handles the JWT.
  - It sends the session cookie of the auth host (`credentials: 'include'`, #39). The 15-minute API token comes from `getSession()`: the SDK copies the `set-auth-jwt` reply header into `session.token` and caches the session in memory until 10 s before the JWT expires. That is what the SDK's own `getJWTToken()` does.
  - Not `token()`: the SDK sends `/token` through the same session cache, and with a cached session it answers `{ session, user }` instead of `{ token }`. The integration probe found this on 2026-09-29 (the first run failed right after sign-up). The auth host exposes `set-auth-jwt` to the app's origin (`access-control-expose-headers: set-auth-jwt`, measured on the same run), so the browser can read it.
  - `0.5.0-beta` is the only release line (`npm view @neondatabase/auth dist-tags` on 2026-09-29: `latest: 0.5.0-beta`). It is pinned exactly.
  - Cost: it bundles its Supabase adapter and its own zod 4.3.6, a 344.6 kB / 84.3 kB gzip chunk.
  - It is imported dynamically so it builds as its own chunk (the main chunk went from 941.7 kB / 252.1 kB gzip to 616.0 kB / 172.4 kB gzip). The app needs it at start anyway, so this splits the download rather than saving it.
  - After a 401 `token_expired` the app asks for the token once more. If it gets the same token back, the device clock is wrong, and the app says so instead of looping.
- **Alternatives rejected:** raw `fetch` to the Better Auth endpoints (`/sign-in/email`, `/get-session`, `/token`, ...), ~2 kB and proven by the smoke test, but it hand-codes endpoints that Neon does not document as a public contract; `@neondatabase/neon-js` (the combined SDK, which adds the unused Data API client).
- **What would change this:** the phone start feeling slow (then try raw fetch first, it is the big cut), a stable SDK release with breaking changes, or the beta misbehaving on Hayk's phone.

## 39. Login is email + password; sign-up gets closed after Hayk's account exists, and the API has its own allowlist table

- **Date:** 2026-09-29 - **Status:** active (the app is wired, #43; sign-up stays open until Hayk's account exists, then it is closed as described in `backend/README.md`, "Hayk's account")
- **Why:** The Neon docs say "Anyone can sign up for your application by default" (auth/authentication-flow). The CLI can close it (`neon neon-auth config email-password update --disable-sign-up`), but not before Hayk has signed up, and a valid token must never be enough on its own. So the function also checks `allowed_users` (one indexed lookup per request; removal takes effect at once, no redeploy). Email + password needs no email round trip per sign-in and works on the shared SMTP sender, which the docs call rate-limited and fit only for development.
- **Alternatives rejected:** email OTP (a code by email at every sign-in, and it depends on the shared, rate-limited sender); OAuth (Google/GitHub need our own OAuth apps in production; ruled out in the brief); an allowlist in a Function env variable (every change needs a redeploy with an `--env` file); relying on disabled sign-up alone (it is a setting that can be switched back, and the smoke test has to open it temporarily).
- **What would change this:** a second learner (then roles instead of a flat allowlist), or Neon adding built-in sign-up restrictions per email. Also: the session is a 7-day partitioned (CHIPS) cookie on the Neon Auth host, and bearer sessions are not available on Managed Auth (tested 2026-09-29: `/token` with the session token as a bearer and no cookie gives 401). If Hayk's phone rejects that cookie (Safari before 18.4, or ITP flagging the host), the fix is self-managed Better Auth with the bearer plugin in a Neon Function, which would be a new decision for Hayk.

## 38. The backend lives in `backend/` with its own `package.json`, lockfile and `neon.ts`, not at the repo root

- **Date:** 2026-09-29 - **Status:** active
- **Why:** It mirrors `app/`: each deployable has its own dependencies and lockfile, and the repo root stays free of a second `node_modules`. The Neon CLI finds `neon.ts` by walking up from the current folder and reuses the repo-root `.neon` link from subfolders (docs: cli/link, cli/config). `neon deploy --no-env-pull` plus `neon env pull --file ../.env.local` keeps a single `.env.local` at the root, where the scripts read it.
- **Alternatives rejected:** `neon.ts` + `package.json` at the repo root (the layout in Neon's quick starts; it puts a Node project over the whole repo and a `node_modules` next to `reference/` and `content/`).
- **What would change this:** the CLI failing to resolve `.neon` or `neon.ts` from `backend/` in practice, or a second Neon function that shares code with the app.

## 37. One Hono function `api` with three routes: `GET /v1/health` (no auth, no database), `GET /v1/state`, `POST /v1/sync`

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The app needs only "load everything" and "upload a batch". Few routes mean few requests, which is the Free-plan lever. Health never queries the database, so nobody can wake the compute (and spend CU-hours) without a valid, allowlisted token. Every error is JSON with a code and a request id, with CORS headers even on errors so the app can show the message. Unknown `Origin` values are rejected with 403 (Neon's auth page says to check the origin against an allowlist rather than echo it).
- **Alternatives rejected:** a REST resource per table (more requests per session); a health check that pings the database (an unauthenticated way to keep compute awake); separate functions per job (more deploys, more cold starts).
- **What would change this:** a feature that needs server work outside a sync (e.g. Claude grading inside the app via an API call).

## 36. Writes are idempotent by client-generated UUIDs; a reused id with different content is a 409 that rolls back the batch; cards, lessons and extras merge by a clear "newer wins" rule

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Retried syncs (timeouts, tab closed mid-request) must never duplicate rows. `INSERT ... ON CONFLICT DO NOTHING` on `(user_id, id)` makes a resend harmless; comparing the resent row with the stored one turns a real id collision (an app bug) into a loud 409 instead of silently keeping one version. The whole batch is one transaction. Cards keep the rule of DECISIONS.md #8 / `mergeStates`: per word, the later `last_review` wins. Lesson progress: the later `updatedAt` wins (every change in `app/src/lib/plan.ts` sets it, including un-marking "done", so a "done stays done" rule would be wrong). Extras: the larger value wins. In all three, the server returns its newer version as `stale` so a device that was offline adopts it. Each table takes the whole list as one JSON parameter (`jsonb_to_recordset`), one query per table per batch.
- **Alternatives rejected:** server-generated ids (a lost response makes the client resend and duplicate); last-write-wins by arrival time for cards (an offline phone would overwrite newer PC progress); per-row inserts (up to 1000 round trips per batch).
- **What would change this:** true concurrent editing of the same word on two devices at the same moment (not a realistic case for one learner).

## 35. `GET /v1/state` returns all cards, raw reviews of the last 35 days, all-time study days, all attempts in full, lesson progress and recent extras, gzip-compressed

- **Date:** 2026-09-29 - **Status:** active
- **Why:** One request on start gives the app everything, in the app's own field names (`lessonProgress` is the app's `LessonProgress` exactly). Raw reviews are windowed because they grow fastest (~100 a day); the Stats page charts 30 days, and streaks only need the list of study days, which is sent for all time. Attempts are sent in full because the Results page shows them with Claude's reviews and they grow slowly (a few per week, ~10 KB each). Estimated reply after a year: ~1 MB raw, ~100-200 KB gzipped, ~30 MB/month of the 5 GB egress.
- **Alternatives rejected:** incremental sync with `since` cursors and a client cache (more client code to get wrong, not needed at this size); attempt summaries plus a detail endpoint (the Results page would need a second request per attempt and the score logic would have to move); all review events every time (would grow without bound).
- **What would change this:** more than ~300 attempts or a state reply over ~500 KB gzipped; then add `?since=` for attempts and events.

## 34. `ReviewState.newToday.count` is derived from today's review events; only `newToday.extra` is stored (table `new_word_extras`, larger value wins)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** `count` is a per-day counter two devices would have to merge (the old `mergeStates` took the max). Counting today's `isNew` events that are not practice gives the same number from data that is already synced. `extra` ("learn more" words asked for that day, added by the other agent at ~02:00 on 2026-09-29) cannot be derived from events, so it gets a tiny per-day table; it only grows during a day, so the larger value wins, as in `mergeStates`.
- **Alternatives rejected:** storing the whole `newToday` object (a second source of truth for the count); keeping `extra` per device (the phone and the PC would disagree on how many new words are left today).
- **What would change this:** a daily limit that is not about introduced words (e.g. a time budget), or `extra` becoming able to shrink.

## 33. Plain SQL migrations applied by a small Python script, node-postgres in the function, no ORM

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Six small tables and one query per table per route. Versioned `.sql` files are readable by Claude in any session, `migrate.py` records each file's SHA-256 and refuses edited history, and it uses the direct (unpooled) URL as Neon recommends. The function uses `pg` with one small module-scope pool and `attachDatabasePool`, as the Neon Functions docs require.
- **Alternatives rejected:** Drizzle (suggested by the Neon skills for new TypeScript schema work; a schema DSL and migration generator for six small tables, and the grading script would still need raw SQL); the `@neondatabase/serverless` driver (Neon says not to use it in Functions).
- **What would change this:** the schema growing past ~10 tables or queries getting complex enough that typed query building pays off.

## 32. The API's upload schemas mirror the app's zod types (duplicated, strict), instead of importing `app/src/content/schema.ts`

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Importing across packages would make the function's bundle depend on `app/node_modules` being installed and on a file another agent edits for unrelated features (glossary, tests). The mirror covers six small types in ~150 lines. Strict objects make drift loud: an app field the backend does not know is a 400 naming the key, not data dropped on the way in.
- **Alternatives rejected:** importing the app schema (cross-package coupling at deploy time); loose `jsonb` with no validation (bad data would only fail later, when the app parses it on load); a shared package (restructuring `app/`, out of scope for this task).
- **What would change this:** the mirror drifting more than once; then extract the synced types into a shared package both import.

## 31. Claude's scripts (migrate, progress, smoke test) are Python run with `uv run` and PEP 723 inline dependencies pinned with `==`

- **Date:** 2026-09-29 - **Status:** active
- **Why:** They run from a fresh clone with only `uv` (no `npm install` in `app/` or `backend/`), use ~60 MB of RAM against ~150 MB for a tsx process, work the same in the Linux cloud session, and follow the repo's Python rules (logging to console and `logs/`). Claude's review is checked in Python with the same rules as the app's zod `Review` schema (tested on 12 bad cases, 2026-09-29).
- **Alternatives rejected:** TypeScript via tsx importing the app's zod `Review` (one validator, but it needs both `node_modules` trees installed and couples the script to files under active edit).
- **What would change this:** the review format getting complex enough that a second validator drifts; then validate by calling the app's schema from a small tsx script.

## 30. The function uses the owner-role `DATABASE_URL` that Neon injects; access is scoped by user id in code, with no row-level security

- **Date:** 2026-09-29 - **Status:** active (a default accepted, not deliberated)
- **Why:** Neon injects the owner connection string; a separate least-privilege role would need extra setup and a secret passed through `--env` on every deploy. With one user, one function and every query filtered by the verified `sub`, the extra role buys little.
- **Alternatives rejected:** a restricted Postgres role for the function; RLS policies with `auth.user_id()` (that helper belongs to the Data API path, which is not used).
- **What would change this:** a second user, third-party code in the function, or any route that builds SQL from request input.

## 29. No branch policy in `neon.ts`: compute is already 0.25 CU fixed with 5-minute scale to zero

- **Date:** 2026-09-29 - **Status:** active
- **Why:** `neon projects get` on 2026-09-29 showed `autoscaling_limit_min_cu` and `autoscaling_limit_max_cu` both 0.25, and the org plan `free`. That is the cheapest compute, and scale to zero cannot be turned off on Free. A `branch` closure that restates it would make `neon deploy` touch compute settings for no gain.
- **Alternatives rejected:** pinning 0.25 CU in `neon.ts` for the default branch (no change today, and a later edit there could raise costs by accident).
- **What would change this:** the project defaults changing, or creating extra branches (then give them a TTL in `neon.ts`).

## 28. Lesson progress is one file, `progress/lessons.json`, going through `app/src/lib/storage.ts` like all other progress; the position is the section at the top of the screen

- **Date:** 2026-09-29 - **Status:** active; the storage part is superseded by #21 (2026-09-29): lesson progress is now a Neon table synced through the outbox (#41), not `progress/lessons.json`
- **Why:** Per lesson: `startedAt`, `updatedAt`, `lastSection` and `doneAt`. Opening a lesson starts it. The lesson is one scrolling page, like a textbook page, so "where you were" is the section nearest the top of the screen (an IntersectionObserver). It is saved 1.5 s after scrolling stops and restored on the next visit. All reads and writes go through `loadLessonProgress`/`saveLessonProgress` in `storage.ts`, so the Neon swap stays in one module.
- **Alternatives rejected:** a step-by-step lesson (one section per screen; exact position, but it reads less like a book and makes tables and examples harder to compare); saving on every scroll event (too many writes); keeping lesson progress in browser storage only (the PC must save to the repo like everything else).
- **What would change this:** Neon (#21) replacing the file with a table; lessons getting so long that a section is too coarse a position.

## 27. "Never run out of work": a What-next menu instead of "All done for today", a Today panel on Home, and a content runway (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active (revisited 2026-09-29: check-content no longer prints the runway, #44)
- **Why:** Hayk: "in web I just hit All done for today, I'd like to always have stuff to work on". When reviews are done, the Words page (and its start page, when nothing is due) offers:
  - +5/+10 new words for today only;
  - practice of weak words (#25);
  - the next lesson;
  - the next untaken test, in course order (unit, lesson order, oldest first; tests got optional `unit`/`lesson`);
  - listening practice (dictation of example sentences of learned words, no new content needed).
  Each option either works or says plainly why not ("No more new words prepared yet. Ask Claude for more."), so there is never an empty screen. The extra new words are stored with the day in the review state (`newToday.extra`), so they apply to that day on every device and reset the next day. The runway (words left and roughly how many days at the daily limit, untaken tests, unfinished lessons) is on the Stats page and printed by check-content at the default 10 words a day, so Claude sees when to write more.
- **Alternatives rejected:** raising the daily limit in Settings (permanent, and Hayk wanted "more today"); an endless random review of all words (hides that the prepared content is running out); putting the runway on Home (it is for the author, not the learner).
- **What would change this:** Hayk ignoring the menu (then pick one next step automatically), or the runway needing per-unit detail.

## 26. A lesson's words are introduced automatically once the lesson is opened, not by an "add to my word bank" button

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The word bank already holds every prepared word, and new words are introduced 10 a day in file order. If lesson words were not held back, the app would introduce them days before the lesson explains them. So a word listed in a lesson's `words` waits until that lesson is opened, then joins the daily new words in `words.json` order. Words in no lesson work as before, and words already introduced are always reviewed. Opening the lesson is the natural "I'm learning this now" signal and needs no extra click, which a beginner could forget.
- **Alternatives rejected:** an "add these words" button (one more thing to forget, and the words are already in the bank); introducing all of a lesson's words at once when it opens (can be 20+ new cards in a day, against the daily limit Hayk set); ignoring lessons when introducing words (words arrive before their explanation).
- **What would change this:** Hayk wanting to preview a lesson without starting its words, or wanting to learn words ahead of the lessons.

## 25. Practising weak words does not change the FSRS schedule; the answers are logged with `practice: true`

- **Date:** 2026-09-29 - **Status:** active (Claude's suggestion, adopted by the build agent)
- **Why:** Weak words are those graded Again or a near miss in the last 14 days, or with FSRS lapses. They are extra practice on top of the schedule. If practice also rescheduled the cards, an extra same-day review would distort the FSRS memory model (it would read a review that the algorithm did not ask for as a normal review), and the next due date would move for reasons Hayk cannot see. So practice only appends a log line with `practice: true`, `stateBefore = stateAfter` and the unchanged `due`. The stats count practice as study time, sessions and study days, but not in the reviews chart or % correct. The UI says "schedule unchanged" in the practice header and the menu.
- **Alternatives rejected:** rescheduling on practice (distorts FSRS; FSRS has no notion of voluntary extra reviews); not logging practice (Claude could not see which words Hayk struggles with).
- **What would change this:** FSRS support for same-day extra reviews, or evidence from the log that practiced words are still forgotten at their next scheduled review.

## 24. Lesson exercises use the test item schema, grading and result files

- **Date:** 2026-09-29 - **Status:** active
- **Why:** One item format and one grading path, so everything in `content/README.md` about test items also holds in lessons, and Claude reviews lesson exercises exactly like tests. An exercise block's items are shown together with one "Check answers" button, using the same inputs as tests (`components/ItemInput.tsx`). The result is saved with `testId` `<lesson id>-ex<n>` plus `lessonId` and `section`. check-content rejects a test id that would collide with such an id. Time per item is the time since Hayk last clicked or focused that item.
- **Alternatives rejected:** a separate, simpler exercise format (two formats for Claude to write and keep in step); not saving lesson exercises (Claude could not review them); one item per screen as in tests (breaks the reading flow of a lesson).
- **What would change this:** lesson exercises needing a kind of interaction tests do not have (e.g. matching pairs); then add it as a new item type for both.

## 23. Lessons are JSON files of typed blocks, with a tiny text format instead of Markdown (lessons asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk asked for lessons "like in the Schritte book: topic, explanation, examples, exercises". `content/lessons/<id>.json` has unit, order, level, title, summary, goals, optional Nicos Weg links, words and tests, and `sections` made of 8 block types: `explanation`, `comparison`, `examples`, `table`, `tip`, `warning`, `exercise`, `audio`.
  - Text blocks use a 4-rule format: blank-line paragraphs, `- `/`1. ` lists (also directly under a text line, as in Markdown; the first version required a blank line and the smoke test showed a list rendered as plain lines), `**bold**`/`*italic*`, and `[[German]]` to mark German inside English. The marker is what gives German phrases popups and the glossary check.
  - It is parsed in about 60 lines (`content/richtext.ts`) and rendered as React nodes, never as HTML, so content cannot inject markup (a render test checks this). Broken markup fails check-content.
  - Table columns say whether they hold German words (popups and glossary check), letters/sounds (speaker only), or other text.
- **Alternatives rejected:** a Markdown library such as marked or markdown-it plus a sanitizer (a dependency, and still no way to mark German for popups); raw HTML in JSON (XSS risk, hard to write by hand); one free-text field per lesson (no structure for examples, tables and exercises).
- **What would change this:** lessons needing images, audio files or video (then add block types), or the text format growing past a handful of rules.

## 22. The PC stays on Node 20.20.0 (decided by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk: "lets stay 20" when asked about a machine-wide upgrade to Node 22 LTS. It also corrects #11, which wrongly said upgrading Node was "ruled out by Hayk". That constraint came from Claude's brief to the build agent, not from Hayk.
- **Consequences:**
  - `neon skills` (needs Node 22.20+) can't run, so Neon skills are downloaded from Neon's registry and checked by sha256.
  - The Neon CLI (`>=20.19.0`) and the app toolchain (#11) work.
  - Neon Functions run on Node 24 on Neon's side regardless.
- **Alternatives rejected:** a machine-wide upgrade to Node 22/24 (it could affect Hayk's other projects on this PC).
- **What would change this:** a tool we need refusing Node 20, or Hayk upgrading for another project. Node 20 is past end of life (April 2026).

## 21. Progress moves to a private Neon Postgres database on the Free plan, via Neon Auth and a Neon Functions API (Hono)

- **Date:** 2026-09-29 - **Status:** active (the app is wired to it since 2026-09-29, #40-#43)
- **Why:**
  - Hayk wants sessions done on the website (phone or any browser) saved so we can pick them up, and chose Neon over saving into the repo and over Supabase (Hayk: "neon").
  - Neon's own guidance (its `neon` skill) is to not expose Postgres to the browser via the Data API for new apps, because row-level security policies are easy to get wrong. So the website logs in with Neon Auth (Managed Better Auth), and a small Neon Functions API checks the token and does all database access. Hayk: "whatever u chose".
  - Progress becomes private (the repo stays public).
  - **Hayk's hard rule: Neon stays on the Free plan.** Checked on neon.com/pricing.md on 2026-09-29: the Free plan is permanent with no card, and hitting a limit pauses or blocks but never bills. Expected use (1 learner) is about 8 of 100 CU-hours a month, a few MB of 0.5 GB storage, and a few thousand of 1M Functions invocations.
  - Project: `nemeceren` (`aged-violet-98333413`), `aws-eu-central-1`, Postgres 18.
- **Alternatives rejected:**
  - Repo sync via the GitHub API (commit noise, progress public, a JSON merge between devices).
  - The Neon Data API from the browser (Neon advises against it for new apps).
  - Supabase (another service and account, and Hayk preferred Neon).
- **What would change this:** usage approaching the Free limits, Neon changing the Free plan, or the Functions/Auth setup turning out too heavy to maintain.
- **Supersedes:** #4, and the file storage of #8 once the wiring lands. It revisits #2 for progress data.

## 20. Charts are hand-drawn SVG bars (`app/src/components/BarChart.tsx`), no chart library

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The dashboard needs three small bar charts. One component of about 140 lines covers value labels on the bars (turned upright when a bar is too narrow, with the top padding sized so they are never clipped), hover/tap/arrow-key tooltips, and light/dark colors from CSS variables. The whole dashboard added 6.9 kB gzip to the main bundle (117.0 -> 123.9 kB, including popups).
- **Alternatives rejected:** Plotly (the global default for reports, but several MB; far too big for a phone bundle); Chart.js or Recharts (tens of kB gzip for three bar charts).
- **What would change this:** needing many chart types, zooming, or several charts per screen with complex interaction.

## 19. Study statistics use the recorded local day, 30-minute sessions, measured and capped minutes, and "known" = interval of 21 days or more

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - Hayk splits time between Munich and Armenia, so each review and test result now records `localDay` when it happens. A review at 23:30 in Munich stays on that Munich day wherever the stats are viewed, and a snapshot built in CI (UTC) cannot shift days.
  - Minutes come from time actually measured (card open to grade, and time on each test item), capped at 2 min per card and 20 min per test item, so an open tab does not count as study. Summing session wall-clock time was rejected because a 25-minute break inside a session would count as study.
  - A session ends after a gap of 30 minutes or more and counts on the day it started.
  - "Known" follows Anki's "mature" rule (interval of 21 days or more).
  - All definitions are in `progress/README.md` and `app/src/lib/stats.ts`, and unit-tested (midnight, Munich vs Yerevan, the 2026-10-25 clock change).
- **Alternatives rejected:** session wall-clock minutes (counts breaks); computing the day from UTC timestamps at view time (moves late-evening study to the wrong day when viewed from another time zone); FSRS stability as "known" (harder to explain to Hayk than "interval of 3 weeks").
- **What would change this:** the caps clearly cutting real work (for example long writing items), or Hayk wanting a different streak rule (e.g. a minimum number of reviews per day).

## 18. The dashboard shows streaks, study days and word progress (decided by Hayk, 2026-09-29); the stats maths is pure functions over plain event arrays, and there is no phone stats snapshot

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk picked "Streaks + study days" and "Words progress". Progress storage is moving to Neon Postgres (Hayk's decision, 2026-09-29, a separate task), after which PC and phone read the same live data. So the planned build-time snapshot of PC stats for the phone was dropped, and the maths (`app/src/lib/stats.ts`) takes plain `ReviewEvent`/`TestItemEvent` arrays with no knowledge of storage. Only `app/src/lib/storage.ts` reads and writes progress (`loadActivity()` builds the events), so the Neon swap is contained there. Until then the phone dashboard shows only that browser's activity, and the page says so.
- **Alternatives rejected:** a build-time snapshot of daily PC aggregates merged with phone data (thrown away once Neon exists); computing stats inside the storage code (would have to be rewritten for Neon).
- **What would change this:** the Neon task, which should feed database rows into the same functions.

## 17. A test question or writing prompt can be marked as English (`questionLang` / `promptLang`: `"en"`)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk is a complete beginner, so many Unit 0 questions will be in English ("How do you say thank you?"). Without a marker, every English word in them would fail the glossary check, and the app would put a German speaker button on English text. The marker is optional and defaults to German, so existing tests are unchanged.
- **Alternatives rejected:** putting English questions in `instruction` (the question field is required and shown differently); adding English words to the glossary ignore list (hides real gaps); a language field on every text (more to write for little gain).
- **What would change this:** needing mixed-language options, or languages other than German and English in content.

## 16. Generated glossary entries keep only the readings a learner most likely means, ranked by the word bank and the DWDS Goethe A1-B1 lists

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Plain Wiktionary data misled on the sample content: "einen" came out as the verb "to unite" (not the accusative article), "heiße" also as "hot; horny" (a form of "heiß"), "Namen" as the city Namur, and sentence-initial "Ich" as "ego". The generator now ranks candidates in 3 tiers and keeps only the best one:
  - tier 0: the lemma is in `content/words.json`;
  - tier 1: the lemma, with a matching part of speech, is in `reference/dwds_goethe_{A1,A2,B1}.csv`;
  - tier 2: anything else.
  Entries also carry the learner level, and at a sentence start the lookup drops readings without a level when one has it. After the change, all four examples above are right. The word bank's own English meaning replaces Wiktionary's for its words (Wiktionary lists "date" and "deadline" before "appointment" for "Termin").
- **Alternatives rejected:** first Wiktionary entry only (wrong for "einen", "das", "Namen"); "a dictionary entry beats an inflected form" (tried first; hid "einen" = "ein" and "das" = the article); the Goethe TSV for levels (it leaves out days, numbers and articles, which live in the word-group pages).
- **What would change this:** the DWDS lists turning out to miss many words Hayk meets (then add a frequency list), or curated overrides piling up for the same kind of mistake.

## 15. Word popups use a glossary generated from Wiktionary data via kaikki.org, checked and overridden by Claude (data source decided by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk chose kaikki.org. Implementation choices:
  - `npm run glossary` (TypeScript via tsx, like check-content) fetches each word's JSONL from `kaikki.org/dictionary/German/meaning/<c>/<cc>/<word>.jsonl`, sequentially with a 700 ms pause and a disk cache. The first run over the sample content took 137 s for 193 requests; reruns are instant.
  - It is TypeScript so the generator, check-content and the app share one tokenizer and one list of German fields.
  - It needs network, so CI does not run it; the generated file is committed.
  - `content/glossary.json` holds Claude's overrides (they replace a generated key) and an ignore list for person names.
  - check-content fails, naming the word and where it is used, when a German word has no entry. The popup shows a visible "no entry" line rather than nothing.
  - The glossary is a separate lazy chunk (3.8 kB gzip for the sample content), so the first page load does not pay for it.
- **Alternatives rejected:**
  - A Python generator (would duplicate the tokenizer and field rules).
  - Fetching glossary data at runtime from the phone (no network guarantee, rate limits, slower popups).
  - Bundling a whole dictionary (megabytes).
  - Machine translation (not a dictionary, no base form or article).
- **What would change this:** kaikki.org changing its URL scheme or data format, or Claude's overrides outgrowing the generated data.
- **Known limitation:** popups look at one word at a time, so split separable verbs ("Ich rufe dich an") show "rufen" for "rufe". Curated entries with a `note` are the fix.

## 14. Word popups appear only after answering (decided by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk's decision. Popups would otherwise give answers away: a translation of a multiple-choice option or a gap word before answering is a hint. The rule:
  - tests: off on every unanswered item, on after the test is submitted and graded (results page included);
  - word review: off on the prompt before the answer is revealed, on afterwards;
  - everywhere else German is shown: on;
  - never inside text inputs.
  Enforced by `GlossScope` (`app/src/glossary/gate.ts`): German text rendered outside a scope throws, so a new screen cannot leak popups by accident. Unit-tested at function and render level.
- **Alternatives rejected:** always on (gives answers away); only on the results page (Hayk also wants them after revealing a word).
- **What would change this:** Hayk wanting popups as a paid hint during tests (e.g. recorded like `hintUsed`).

## 13. The syllabus is 7 units from zero to A1, built around work, classes and friends, with DW Nicos Weg as the video companion (`SYLLABUS.md` v3)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk is a complete beginner who wants A1 for now, for daily life with no exam, and whose priorities are work, classes and friends. Hayk chose no placement test, Nicos Weg as the companion, and explanations in English with Russian/Armenian comparisons, then asked Claude to self-review and finalise. The self-review of v2 fixed:
  - the accusative arriving after unit 2's "what you have" task (now a chunk in unit 2);
  - the Nicos Weg mapping checked against its lesson list (numbers are in ch. 2; ch. 14, 15 and 18 teach adjective endings, which the textbooks consensus puts at A2);
  - missing A1 consensus items: dates, verbs with dative, gern/lieber, polite chunks;
  - no process at all, now "how a unit runs" with word targets, 20% mixed-in review, and done-criteria.
- **Alternatives rejected:**
  - v1 (15 units A1 to B1, which wrongly assumed Hayk was already A1);
  - following a textbook (Hayk decided against Schritte);
  - following Nicos Weg's own order (it puts adjective endings and two-way prepositions in A1, earlier than every textbook);
  - admin-first ordering from the BAMF curriculum (Hayk's priorities are work, classes and friends).
- **What would change this:**
  - unit tests staying under 80% twice in a row (slow down or split units);
  - Hayk's real situations changing (e.g. a flat search, which pulls admin forward);
  - reaching A1 (plan A2 in detail).

## 12. Audio, video and archives are not committed; they stay local and can be downloaded again

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The media is 258 MB (Schritte audio 195 MB in `books/schritte1_audio/`, A1 exam audio 63 MB in `reference/exams_A1/`). It would bloat every clone of a public repo, and the phone/cloud sessions can't play it anyway. All of it is free to download again from the URLs in `reference/README.md` and `_knowledge/2026-09-28_llm-tutoring-and-materials.md`. PDFs and CSVs (about 30 MB) are committed because Claude reads them in every session, including cloud ones.
- **Alternatives rejected:** committing everything (repo bloat, slow clones); Git LFS (quota limits on the free plan, and extra setup for files that are free to fetch again).
- **What would change this:** Claude needing the audio in cloud sessions (e.g. for transcription), or making its own audio that can't be downloaded again.

## 11. The app toolchain is pinned to versions that run on Node 20.20.0: Vite 8.3.1, TypeScript 6.0.3, Vitest 4.1.11, and CI uses Node 20.20.0 too

- **Date:** 2026-09-28 - **Status:** active; corrected 2026-09-29: "ruled out by Hayk" below is wrong. The Node 20 constraint came from Claude's brief. Hayk decided to stay on Node 20 on 2026-09-29 (#22).
- **Why:** Node is not being upgraded on the PC. Checked with `npm view` on 2026-09-28: Vite 8.3.1 needs `^20.19.0 || >=22.12.0` (fine); Vitest 5.0.2 needs `^22.12.0`, so the last 4.x (4.1.11, `^20 || ^22 || >=24`, peer `vite ^6 || ^7 || ^8`); TypeScript 7.0.2 is `latest` but it is the Go port and the official `create-vite` 9.2.1 react-ts template still pins `~6.0.2`, so 6.0.3. `check-content` is TypeScript run through tsx 4.23.15 because Node 20 has no type stripping (`node --experimental-strip-types` -> "bad option"). All versions are exact (`save-exact=true`, lockfile committed).
- **Alternatives rejected:** upgrading Node (ruled out by Hayk); Vitest 5 (needs Node 22); TypeScript 7 (template and plugin ecosystem still on 6); CI on Node 22/24 (would test something different from the PC).
- **What would change this:** moving the PC to Node 22 or 24 (Node 20 left maintenance in April 2026). Then bump CI's `node-version`, and Vitest to 5.

## 10. Styling is one plain CSS file with CSS variables, light/dark via prefers-color-scheme, no UI kit

- **Date:** 2026-09-28 - **Status:** active
- **Why:** The app has five screens and simple controls. The whole stylesheet is 8.2 kB (2.2 kB gzip), keeping the phone bundle small.
- **Alternatives rejected:** Tailwind (extra build setup and long class strings for a small app); a component kit like MUI or Chakra (tens of kB of JS for buttons and cards).
- **What would change this:** the UI growing past roughly 15 screens, or needing complex widgets (dialogs, date pickers, drag and drop).

## 9. Routing is a 20-line hash router in `app/src/lib/router.ts`, not react-router

- **Date:** 2026-09-28 - **Status:** active
- **Why:** Five routes with at most one parameter. Hash URLs (`#/test/<id>`) work on GitHub Pages without server rewrites, and the router needs no dependency.
- **Alternatives rejected:** react-router's HashRouter (a dependency for five flat routes); history URLs with the Pages `404.html` redirect trick (fragile, needs two files).
- **What would change this:** nested layouts, several parameters per route, or route-level data loading.

## 8. Progress is one JSON file per test attempt, one review-state JSON, and an append-only review log (JSONL); phone mode merges per word by the latest review

- **Date:** 2026-09-28 - **Status:** superseded by #21 (2026-09-29). The structure (one record per attempt, per-word review state, append-only review log) carries over as tables, and the per-word merge rule lives on in #36 and #41.
- **Why:** One file per attempt (`progress/results/<test-id>__<timestamp>.json`) is never rewritten by the app, so Claude can add a `review` to it without conflicts, and each file is self-contained (question, answer, expected, near-miss labels, time). The review log is only appended, so the full history survives for mistake analysis. In phone mode the build embeds `progress/review-state.json`; on load it is merged with the browser's state, keeping for each word the card with the later `last_review`, so the phone picks up PC progress after each deploy without losing phone-only reviews.
- **Alternatives rejected:** one big `results.json` (rewritten on every attempt, easy to corrupt, noisy diffs); SQLite (binary, Claude cannot read or edit it with plain file tools); Claude's grading in separate files next to the results (two files to keep in step).
- **What would change this:** hundreds of result files making the Results page slow (add an index file), or phone sync being built (DEFERRED_TODO.md), which replaces the merge rule.

## 7. Content and progress files are validated with zod 4 schemas that are also the TypeScript types; objects are strict and JSON is parsed by the app, not by Vite

- **Date:** 2026-09-28 - **Status:** active
- **Why:** One schema (`app/src/content/schema.ts`) gives both the types and the runtime check, with errors like `content/tests/x.json: items[3].answers[0]: ...`. Strict objects turn a misspelled optional key into an error instead of a silently ignored field. The app, `npm run check-content` and CI share the same code, so a bad file blocks the app and the deploy. Content files are imported as raw text (`?raw`) and parsed by the app, because with a plain `.json` import a syntax error broke Vite's transform and Vite 8.3.1's error overlay itself crashed (`TypeError ... .split is not a function` in `@vite/client`), leaving the old page on screen with only console errors. Measured cost: the zod chunk is 91.4 kB / 25.8 kB gzip of a 117 kB gzip bundle (React 68.2 kB, app 17.0 kB, ts-fsrs 6.6 kB).
- **Alternatives rejected:** a hand-written validator (more code, and the types would be written twice); `zod/mini` (about 20 kB gzip smaller, but its functional API makes the schema file harder to read and keep in step with `content/README.md`); JSON Schema + ajv (bigger, types separate).
- **What would change this:** the phone load feeling slow; then switch to `zod/mini` first, it is the cheapest cut.

## 6. Each word has one review schedule, shared by the three review modes (German to English, English to German, listening)

- **Date:** 2026-09-28 - **Status:** active
- **Why:** Separate cards per mode would triple the new-card load (10 new words a day would become about 3 words in 3 directions) and make the "due today" count hard to read. Every log line records the mode, the typed answer and near-miss labels, so Claude can still see which direction is weak.
- **Alternatives rejected:** one card per word and mode, like Anki's reversed cards (3x the reviews for a learner with limited daily time).
- **What would change this:** the review log showing words rated Good in recognition but failing in production or listening; then split production into its own cards.

## 5. Word review scheduling uses FSRS through ts-fsrs 5.4.2 with its default parameters, not a hand-written SM-2

- **Date:** 2026-09-28 - **Status:** active
- **Why:** ts-fsrs is actively maintained: 5.4.2 was released 2026-09-01 and 6.0 betas were published up to 2026-09-26 (`npm view ts-fsrs time`). FSRS is the newer algorithm (Anki added it in 23.10), and using the library means no scheduler code of our own to get wrong. Defaults: 90% target retention, learning steps 1 min and 10 min; interval fuzz is turned on so reviews do not bunch up. The card state is stored as ts-fsrs fields in `progress/review-state.json`.
- **Alternatives rejected:** SM-2 written by hand (more code to test, weaker scheduling); ts-fsrs 6.0 beta (not stable yet, removes `elapsed_days`).
- **What would change this:** ts-fsrs being abandoned, or 6.0 going stable (upgrade and migrate the stored cards), or enough review history to fit personal FSRS parameters.

## 4. Results and review state are saved as JSON files in the repo; phone progress stays in the browser

- **Date:** 2026-09-28 - **Status:** superseded by #21 (2026-09-29)
- **Why:** Hayk mostly practises on the PC with Claude in the chat ("tell me to go on localhost and do this and that and then it gets saved to repo and u check"). The local dev server writes results straight into the repo, and Claude reads them with no token and no service. Phone use is occasional, and Hayk said it's fine if those results aren't saved to the repo.
- **Alternatives rejected:** committing results through the GitHub API with a personal access token (every device needs token setup, and not needed while use is mostly on the PC); Neon Postgres (a static site can't hold a DB secret, so it would need a backend, and Hayk only floated it as an option); copy/paste of results into the chat (a manual step every session).
- **What would change this:** phone sessions becoming regular and their results mattering. Then add sync (Neon or GitHub API), see DEFERRED_TODO.md.

## 3. The learning platform is Vite + React + TypeScript, deployed to GitHub Pages by a GitHub Actions workflow

- **Date:** 2026-09-28 - **Status:** active
- **Why:** Hayk delegated the choice ("u just select the way that makes the most sense") and said Actions and amount of code don't matter. Vite's dev server can host a small local save endpoint (decision 4). Components suit several exercise types (tests, word review, listening). TypeScript types catch mistakes in the hand-written test JSON. React because Claude maintains the code and writes React most reliably.
- **Alternatives rejected:** plain HTML/JS with no build (its main advantage, editing from the phone without a build, matters little because use is mostly on the PC, and hand-rolled state for spaced repetition and the test runner gets messy); Vite + Svelte (smaller bundles, but less reliable for Claude to maintain); Astro (built for content sites, not an interactive app); Flask/FastAPI with server-side templates (Hayk asked about this 2026-09-29, and it was reconsidered and rejected: GitHub Pages can't run a Python server, so the phone site would need paid or free-tier hosting with a login, and the browser-only features (speechSynthesis, interactive exercises, phone storage) need JavaScript anyway. Hayk: "ok keep react").
- **What would change this:** repeated CI/build breakage, or the phone bundle getting slow. Features that need a server (Claude API grading inside the app, server-side neural TTS, Neon sync) would add a small FastAPI service next to this frontend, not replace it.

## 2. The repo stays public, including Hayk's results and progress

- **Date:** 2026-09-28 - **Status:** revisited 2026-09-29: progress data moves to a private Neon database (#21). The repo itself stays public.
- **Why:** Hayk: "Public is fine". GitHub Pages on a private repo needs a paid plan, which isn't confirmed.
- **Alternatives rejected:** a private repo (Pages might not deploy); a public site with results in a separate private repo (a token with access to two repos, more setup).
- **What would change this:** Hayk wanting the progress data private.

## 1. The Goethe A1/A2/B1 word lists are parsed from the official PDFs by column position (pdfplumber)

- **Date:** 2026-09-28 - **Status:** active
- **Why:** The PDFs are the source of truth, and nothing else gives articles, plurals and example sentences for all three levels. `scripts/build_wortliste.py` gives 4,958 entries (A1 685, A2 1,190, B1 3,083), each running `ab` to `zwischen`, with 0 anomalies. 97% of its headword stems (2,648 of 2,718) also appear in the independent sprach-o-mat list.
- **Alternatives rejected:** technologiestiftung/sprach-o-mat CSV (Snowball stems only, and it includes names from the example sentences, verb forms and garbled tokens like `acrt`, 5,557 "stems"); wejn/goethe-b1-wortliste (B1 only, and the repo has the scripts but no CSV); xpdf `pdftotext -layout` (puts examples one row off their headwords on some A1 pages, e.g. "der Raum" next to "Die Rechnung, bitte.").
- **What would change this:** Goethe publishing a machine-readable list, or parse errors turning up in real lookups.
- **Known source quirks:** A1 prints `Satz, -ä, e` with no article, and A1's font turns the umlaut-plural sign into `-ä`/`-Ä` (the script maps it back to `¨-`).
