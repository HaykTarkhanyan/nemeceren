# Progress (moved to Neon)

Hayk's progress is no longer stored in this folder. Since 2026-09-29 it lives in a private Neon Postgres database behind the API in `backend/` (DECISIONS.md #21): word reviews, FSRS cards, test and lesson-exercise attempts, Claude's reviews, lesson progress and extra new words. The app signs in with Neon Auth and syncs through `GET /v1/state` and `POST /v1/sync`; each device keeps unsynced changes in a local outbox until they are sent.

Claude reads and grades progress from the repo root:

```bash
uv run backend/scripts/progress.py summary --days 7      # activity, words, most-missed words, lessons
uv run backend/scripts/progress.py ungraded              # attempts waiting for a review
uv run backend/scripts/progress.py show <attempt-id>     # one attempt in full
uv run backend/scripts/progress.py review <attempt-id> review.json
```

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
