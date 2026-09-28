# Progress files

Written by the app when it runs locally (`npm run dev` in `app/`, "Saving to repo" badge). Claude reads them to grade and plan lessons. Phone mode (GitHub Pages) does not write here; it keeps its data in the browser.

| file | written by | format |
|---|---|---|
| `results/<test-id>__<timestamp>.json` | app, one file per submitted attempt; Claude adds `review` | JSON, see below |
| `review-state.json` | app, rewritten after every word review | FSRS state per word |
| `review-log.jsonl` | app, one line appended per word review, never rewritten | JSON Lines |

Run `npm run check-content` in `app/` after editing anything here. It validates every result (including your `review`) and the review state.

## Result file

`<timestamp>` is the submit time in UTC with `:` and `.` replaced by `-`, e.g. `a1-01-vorstellen-termine__2026-09-28T21-59-04-900Z.json`.

```json
{
  "version": 1,
  "testId": "a1-01-vorstellen-termine",
  "testTitle": "Sich vorstellen, Zahlen, Termine",
  "level": "A1",
  "mode": "repo",
  "startedAt": "2026-09-28T21:57:57.000Z",
  "submittedAt": "2026-09-28T21:59:04.900Z",
  "score": { "correct": 6, "wrong": 3, "pending": 2, "total": 11 },
  "items": [
    {
      "index": 1,
      "type": "gap",
      "question": "Ich ___ Hayk und ich ___ aus Armenien.",
      "answer": ["heiße", "Komme"],
      "expected": "Ich heiße Hayk und ich komme aus Armenien.",
      "status": "wrong",
      "nearMiss": ["case"],
      "gaps": [
        { "answer": "heiße", "correct": true, "nearMiss": null },
        { "answer": "Komme", "correct": false, "nearMiss": ["case"] }
      ],
      "timeMs": 13123,
      "hintUsed": true
    }
  ]
}
```

Per item:
- `index` - 0-based position in the test's `items`.
- `question` - what was asked (for `listen_mc` it includes the audio text; for `dictation` the text is in `expected`).
- `answer` - `null` if left empty. A string for `mc`, `listen_mc`, `translate`, `write`, `dictation`; a list with one string per gap for `gap`; the tiles in Hayk's order for `order`.
- `expected` - the correct answer (first accepted variant), the first translation reference, or `null` (`write`).
- `status` - `correct`, `wrong` or `pending` (`translate` without an exact reference match, and `write`).
- `nearMiss` - `null` or a list of `case`, `umlaut`, `article_missing`, `article_wrong`. A near miss is still `wrong`.
- `gaps` (gap only), `diff` (dictation only: a list of `{ "op": "ok" | "wrong" | "missing" | "extra", "expected", "typed", "nearMiss" }`).
- `timeMs` - time spent on the item, `hintUsed`, and `plays` (audio items: how often the audio was played).

## Claude's review (the feedback loop)

To grade an attempt, add a `review` key to the result file. Do not change anything else in the file. The app shows it next to Hayk's answers on the Results page, and a review verdict overrides the auto-grade in the score.

```json
"review": {
  "gradedAt": "2026-09-29T10:00:00Z",
  "summary": "Good start. Verbs are lowercase (komme), nouns uppercase (Uhr). Practise verb position 2.",
  "items": [
    { "index": 7, "correct": true, "note": "Fine. 'Monday' is capitalized in English." },
    { "index": 10, "correct": true, "correction": "Ich bin Programmierer.", "note": "'von Beruf' also works; this is the common form." }
  ]
}
```
- `gradedAt` - ISO date-time with `Z` or an offset. `summary` - required, shown at the top.
- `items` - only the items you want to grade or comment on; every `pending` item should get an entry. Each needs `index` (matching the item's `index`) and `correct`; `correction` (German, gets a speaker button) and `note` are optional. Each index at most once.

## `review-state.json`

```json
{
  "version": 1,
  "scheduler": "fsrs",
  "updatedAt": "2026-09-28T22:00:26.133Z",
  "newToday": { "date": "2026-09-29", "count": 3 },
  "cards": {
    "termin": { "due": "2026-09-28T22:09:52.925Z", "stability": 2.3065, "difficulty": 2.1181, "elapsed_days": 0, "scheduled_days": 0, "learning_steps": 1, "reps": 1, "lapses": 0, "state": 1, "last_review": "2026-09-28T21:59:52.925Z" }
  }
}
```
Keyed by word `id` from `content/words.json`; a word with no entry has never been reviewed. `state`: 0 New, 1 Learning, 2 Review, 3 Relearning. `newToday.date` is Hayk's local date. Do not edit this by hand; it is the ts-fsrs card state. It is also baked into the GitHub Pages build, so the phone starts from the state of the last push.

## `review-log.jsonl`

One JSON object per line, appended after every word review:

```json
{"ts":"2026-09-28T22:00:14.479Z","wordId":"uhr","de":"die Uhr","mode":"production","rating":1,"answer":"Uhr","correct":false,"nearMiss":["article_missing"],"isNew":true,"stateBefore":0,"stateAfter":1,"due":"2026-09-28T22:01:14.479Z"}
```
- `mode` - `recognition` (German to English, self-graded), `production` (English to German, typed), `listening` (audio, typed).
- `rating` - 1 Again, 2 Hard, 3 Good, 4 Easy (Hayk's choice; after a typed answer the app suggests 1 or 3).
- `answer`, `correct`, `nearMiss` - typed modes only, otherwise `null`.
- `stateBefore`/`stateAfter` - FSRS state as above; `due` - next review time.
