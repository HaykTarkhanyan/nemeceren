# Progress (moved to Neon)

Hayk's progress is no longer stored in this folder. Since 2026-09-29 it lives in a private Neon Postgres database behind the API in `backend/` (DECISIONS.md #21): word reviews, FSRS cards, test and lesson-exercise attempts, Claude's reviews, lesson progress, extra new words, and (since 2026-09-30) Hayk's notes with Claude's feedback. The app signs in with Neon Auth and syncs through `GET /v1/state` and `POST /v1/sync`; each device keeps unsynced changes in a local outbox until they are sent.

Claude reads and grades progress from the repo root:

```bash
uv run backend/scripts/progress.py summary --days 7      # activity, words, most-missed words, lessons, attempts and notes waiting
uv run backend/scripts/progress.py ungraded              # attempts waiting for a review
uv run backend/scripts/progress.py show <attempt-id>     # one attempt in full
uv run backend/scripts/progress.py review <attempt-id> review.json
uv run backend/scripts/progress.py notes --pending       # notes waiting for feedback (without --pending: every note not deleted)
uv run backend/scripts/progress.py note <note-id>        # one note in full, with its feedback
uv run backend/scripts/progress.py note-feedback <note-id> feedback.json   # "-" reads stdin; --replace overwrites
uv run backend/scripts/progress.py self-check            # offline check of the feedback validator
```

Data commands take `--user <email>`. Without it they use the only allowed user apart from Claude's test account, and stop with an error when there are several.

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
