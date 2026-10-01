# Progress (moved to Neon)

Hayk's progress is no longer stored in this folder. Since 2026-09-29 it lives in a private Neon Postgres database behind the API in `backend/` (DECISIONS.md #21): word reviews, FSRS cards, test and lesson-exercise attempts, Claude's reviews, lesson progress, extra new words, (since 2026-09-30) Hayk's notes with Claude's feedback and his own words with Claude's check, and (since 2026-10-02) the study timer's sessions. The app signs in with Neon Auth and syncs through `GET /v1/state` and `POST /v1/sync`; each device keeps unsynced changes in a local outbox until they are sent.

Claude reads and grades progress from the repo root:

```bash
uv run backend/scripts/progress.py summary --days 7      # activity (measured and timer minutes), words, most-missed words, lessons, attempts, notes and own words waiting
uv run backend/scripts/progress.py sessions --days 7     # study timer sessions, oldest first: day, minutes, start-stop (UTC), pauses, label
uv run backend/scripts/progress.py ungraded              # attempts waiting for a review
uv run backend/scripts/progress.py show <attempt-id>     # one attempt in full
uv run backend/scripts/progress.py review <attempt-id> review.json
uv run backend/scripts/progress.py notes --pending       # notes waiting for feedback (without --pending: every note not deleted)
uv run backend/scripts/progress.py note <note-id>        # one note in full, with its feedback
uv run backend/scripts/progress.py note-feedback <note-id> feedback.json   # "-" reads stdin; --replace overwrites
uv run backend/scripts/progress.py my-words --unchecked  # Hayk's own words without a check yet (without --unchecked: every word not deleted)
uv run backend/scripts/progress.py check-word <word-id> ok [--note "..."]
uv run backend/scripts/progress.py check-word <word-id> fix --de "der Stau" [--en "..."] [--plural "die Staus"] [--note "..."]   # --replace overwrites a check
uv run backend/scripts/progress.py self-check            # offline check of the feedback and word-check validators
```

Data commands take `--user <email>`. Without it they use `NEMECEREN_DEFAULT_USER` from the gitignored `.env.local` (Hayk), or else the only allowed user apart from Claude's test account, and stop with an error when there are several.

A review (the file given to `progress.py review`) is Claude's grading of one attempt; the app shows it next to Hayk's answers, and each verdict overrides the auto-grade in the score:

```json
{
  "summary": "Good start. Verbs are lowercase (komme). Practise verb position 2.",
  "items": [
    { "index": 1, "correct": false, "correction": "Ich komme aus Armenien.", "note": "Verbs are lowercase." },
    { "index": 2, "correct": true, "note": "Fine." }
  ]
}
```

`summary` is required; `items` lists only the items graded or commented on (`index` = the item's 0-based position, at most once each; every `pending` item should get one); `correction` (German) and `note` are optional; `gradedAt` is filled in by the script. The schema is `Review` in `app/src/content/schema.ts`.

The API contract, the tables and the other formats are in `backend/README.md`. The statistics definitions (study day, streak, session, minutes, known word) are in `app/src/lib/stats.ts`.

## Notes and Claude's feedback

Hayk writes notes on the app's Notes page: free writing, mostly in German, or a question. A note is `{ id, text, localDay, createdAt, updatedAt }` (text 1-5000 characters, not only whitespace). Hayk can edit or delete it until it has feedback; after that it is locked, so the feedback always matches the text. Feedback reaches the app at its next start, or when Hayk presses "Check for feedback".

The feedback (the file given to `progress.py note-feedback`) follows the teaching rules in CLAUDE.md: hints first, so Hayk can fix the note himself, then the corrections, with real errors kept apart from style:

```json
{
  "summary": "Good start. Look at the verb in [[Morgen ich gehe]]: where does it go?",
  "hints": ["Sentence 2: which word comes second?"],
  "corrected": "Morgen gehe ich zur Arbeit.",
  "edits": [
    { "from": "Morgen ich gehe", "to": "Morgen gehe ich", "why": "The verb comes second.", "kind": "error" },
    { "from": "zu der", "to": "zur", "why": "Shorter and more usual.", "kind": "style" }
  ]
}
```

- `summary` is required and uses the lesson text format (`**bold**`, `*italic*`, lists, `[[German]]`; see `content/README.md`). A single `*` starts italics, so write no stray asterisks.
- `hints`, `corrected` and `edits` are optional; leave a key out rather than sending an empty list or text.
- Each edit has `from` and `to` (different, both non-empty), `why`, and `kind`: `"error"` (a real mistake) or `"style"` (a suggestion; never counted as a mistake).
- `at` is set by the script; do not send it.
- The app shows the summary and hints at once; the corrected text and the edits appear after "Show corrections", mistakes apart from style suggestions. There are no word popups in notes or feedback.
- The script refuses feedback that the app could not show (the schema is `NoteFeedback` in `app/src/content/schema.ts`), feedback on a deleted note, and a second feedback without `--replace`.

## Hayk's own words and Claude's check

Hayk adds words he hears in daily life on the app's Words page ("Add a word"). A custom word is `{ id: "u-<uuid>", de, en, plural?, example?: { de, en? }, note?, createdAt, updatedAt, deletedAt? }`; the `u-` prefix keeps it apart from the ids in `content/words.json`, and its FSRS card and reviews are stored under the same id like any other word. It is practised right away, on top of the daily new-word limit, then it is a normal FSRS card. Hayk can edit or delete it; a delete is soft (the word leaves practice, its reviews stay in the statistics).

Claude checks new words with `progress.py`: `my-words --unchecked` lists them (German, plural, English, example, Hayk's note, reviews so far), then for each one either

- `check-word <id> ok [--note "..."]`: fine as it is; the app shows "checked by Claude";
- `check-word <id> fix --de/--en/--plural ... [--note "..."]`: the corrected fields, which the app shows instead of Hayk's in practice and in the "All words" list, with "corrected by Claude: <note>" and what Hayk wrote. Nouns get their article in `--de` ("der Stau") and the full plural in `--plural` ("die Staus"); check gender and plural in `reference/german_nouns.csv` first (CLAUDE.md).

The check is `WordCheck` in `app/src/content/schema.ts`: `{ at, ok, note?, fixed?: { de?, en?, plural? } }` (`at` is set by the script; `ok: true` has no `fixed`, `ok: false` has at least one fixed field). When Hayk edits a checked word, the check is cleared and the word is "waiting for a check" again; `summary` counts these as "Own words waiting for a check".

## The study timer

Hayk times their study with the timer in the app's header (Start, Pause/Resume, Stop), or adds time by hand on the Stats page (DECISIONS.md #62). A study session is `{ id, startedAt, endedAt, activeMs, localDay, label?, manual?: true, createdAt, updatedAt, deletedAt? }`:

- `activeMs` is the time the timer ran, without pauses, at most 16 hours; `localDay` is the local day of `startedAt`, and the whole session counts on that day.
- `label` is optional (up to 100 characters), e.g. "lesson 0.3".
- `manual: true` marks time added by hand; its `startedAt` is local noon of the chosen day and its `endedAt` follows its minutes.
- Hayk can edit the minutes and the label, or delete a session (a soft delete); the later `updatedAt` wins.
- A stop under 1 minute is not saved; a stop over 3 hours asks Hayk to confirm or correct the minutes first.

In `progress.py`:

- `summary` shows two kinds of minutes per day and in total: **measured** (the time the app measured on word cards and test items, capped as on the Stats page) and **timer** (the sessions, with their count in brackets). The timer usually shows more: it also covers lessons, videos and books.
- `sessions [--days N]` lists the sessions (default 7 days, by the local day of the start), oldest first: id, day, minutes, start and stop in UTC with the paused minutes (or "added by hand"), "edited", and the label.
- A day with a timer session (also one added by hand) counts as a study day in `summary`, in the streak and in the study-day counts, like a day with a review or an answered test item.
