# Decisions

Newest at the top. Never delete a superseded entry - mark it and add a new one.

## 28. Lesson progress is one file, `progress/lessons.json`, going through `app/src/lib/storage.ts` like all other progress; the position is the section at the top of the screen

- **Date:** 2026-09-29 - **Status:** active (moves to Neon with the rest of progress, #21)
- **Why:** Per lesson: `startedAt`, `updatedAt`, `lastSection` and `doneAt`. Opening a lesson starts it. The lesson is one scrolling page, like a textbook page, so "where you were" is the section nearest the top of the screen (an IntersectionObserver). It is saved 1.5 s after scrolling stops and restored on the next visit. All reads and writes go through `loadLessonProgress`/`saveLessonProgress` in `storage.ts`, so the Neon swap stays in one module.
- **Alternatives rejected:** a step-by-step lesson (one section per screen; exact position, but it reads less like a book and makes tables and examples harder to compare); saving on every scroll event (too many writes); keeping lesson progress in browser storage only (the PC must save to the repo like everything else).
- **What would change this:** Neon (#21) replacing the file with a table; lessons getting so long that a section is too coarse a position.

## 27. "Never run out of work": a What-next menu instead of "All done for today", a Today panel on Home, and a content runway (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
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

- **Date:** 2026-09-29 - **Status:** active (the app wiring is in progress)
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

- **Date:** 2026-09-28 - **Status:** revisited 2026-09-29: storage moves to Neon (#21). The structure (one record per attempt, per-word review state, append-only review log) carries over as tables.
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

- **Date:** 2026-09-28 - **Status:** superseded by #21 (takes effect when the Neon wiring lands)
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
