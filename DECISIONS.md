# Decisions

Newest at the top. Never delete a superseded entry - mark it and add a new one.

## 12. Audio, video and archives are not committed; they stay local and can be downloaded again

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The media is 258 MB (Schritte audio 195 MB in `books/schritte1_audio/`, A1 exam audio 63 MB in `reference/exams_A1/`). It would bloat every clone of a public repo, and the phone/cloud sessions can't play it anyway. All of it is free to download again from the URLs in `reference/README.md` and `_knowledge/2026-09-28_llm-tutoring-and-materials.md`. PDFs and CSVs (about 30 MB) are committed because Claude reads them in every session, including cloud ones.
- **Alternatives rejected:** committing everything (repo bloat, slow clones); Git LFS (quota limits on the free plan, and extra setup for files that are free to fetch again).
- **What would change this:** Claude needing the audio in cloud sessions (e.g. for transcription), or making its own audio that can't be downloaded again.

## 11. The app toolchain is pinned to versions that run on Node 20.20.0: Vite 8.3.1, TypeScript 6.0.3, Vitest 4.1.11, and CI uses Node 20.20.0 too

- **Date:** 2026-09-28 - **Status:** active
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

- **Date:** 2026-09-28 - **Status:** active
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

- **Date:** 2026-09-28 - **Status:** active
- **Why:** Hayk mostly practises on the PC with Claude in the chat ("tell me to go on localhost and do this and that and then it gets saved to repo and u check"). The local dev server writes results straight into the repo, and Claude reads them with no token and no service. Phone use is occasional, and Hayk said it's fine if those results aren't saved to the repo.
- **Alternatives rejected:** committing results through the GitHub API with a personal access token (every device needs token setup, and not needed while use is mostly on the PC); Neon Postgres (a static site can't hold a DB secret, so it would need a backend, and Hayk only floated it as an option); copy/paste of results into the chat (a manual step every session).
- **What would change this:** phone sessions becoming regular and their results mattering. Then add sync (Neon or GitHub API), see DEFERRED_TODO.md.

## 3. The learning platform is Vite + React + TypeScript, deployed to GitHub Pages by a GitHub Actions workflow

- **Date:** 2026-09-28 - **Status:** active
- **Why:** Hayk delegated the choice ("u just select the way that makes the most sense") and said Actions and amount of code don't matter. Vite's dev server can host a small local save endpoint (decision 4). Components suit several exercise types (tests, word review, listening). TypeScript types catch mistakes in the hand-written test JSON. React because Claude maintains the code and writes React most reliably.
- **Alternatives rejected:** plain HTML/JS with no build (its main advantage, editing from the phone without a build, matters little because use is mostly on the PC, and hand-rolled state for spaced repetition and the test runner gets messy); Vite + Svelte (smaller bundles, but less reliable for Claude to maintain); Astro (built for content sites, not an interactive app); Flask/FastAPI with server-side templates (Hayk asked about this 2026-09-29, and it was reconsidered and rejected: GitHub Pages can't run a Python server, so the phone site would need paid or free-tier hosting with a login, and the browser-only features (speechSynthesis, interactive exercises, phone storage) need JavaScript anyway. Hayk: "ok keep react").
- **What would change this:** repeated CI/build breakage, or the phone bundle getting slow. Features that need a server (Claude API grading inside the app, server-side neural TTS, Neon sync) would add a small FastAPI service next to this frontend, not replace it.

## 2. The repo stays public, including Hayk's results and progress

- **Date:** 2026-09-28 - **Status:** active
- **Why:** Hayk: "Public is fine". GitHub Pages on a private repo needs a paid plan, which isn't confirmed.
- **Alternatives rejected:** a private repo (Pages might not deploy); a public site with results in a separate private repo (a token with access to two repos, more setup).
- **What would change this:** Hayk wanting the progress data private.

## 1. The Goethe A1/A2/B1 word lists are parsed from the official PDFs by column position (pdfplumber)

- **Date:** 2026-09-28 - **Status:** active
- **Why:** The PDFs are the source of truth, and nothing else gives articles, plurals and example sentences for all three levels. `scripts/build_wortliste.py` gives 4,958 entries (A1 685, A2 1,190, B1 3,083), each running `ab` to `zwischen`, with 0 anomalies. 97% of its headword stems (2,648 of 2,718) also appear in the independent sprach-o-mat list.
- **Alternatives rejected:** technologiestiftung/sprach-o-mat CSV (Snowball stems only, and it includes names from the example sentences, verb forms and garbled tokens like `acrt`, 5,557 "stems"); wejn/goethe-b1-wortliste (B1 only, and the repo has the scripts but no CSV); xpdf `pdftotext -layout` (puts examples one row off their headwords on some A1 pages, e.g. "der Raum" next to "Die Rechnung, bitte.").
- **What would change this:** Goethe publishing a machine-readable list, or parse errors turning up in real lookups.
- **Known source quirks:** A1 prints `Satz, -ä, e` with no article, and A1's font turns the umlaut-plural sign into `-ä`/`-Ä` (the script maps it back to `¨-`).
