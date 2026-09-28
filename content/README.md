# Content authoring guide (for Claude)

Everything in this folder is written by Claude and read by the app in `app/`. You do not need to read the app code: this file is the full contract.

- `tests/<id>.json` - one test per file. Shows up in the app on its own (no restart while `npm run dev` runs).
- `words.json` - the word bank for spaced repetition.
- After every edit run `npm run check-content` in `app/`. It prints every problem as `file: field.path: message` and exits 1. The app refuses to start (it shows the same list) and the GitHub Pages deploy fails while any problem is left.

General rules:
- Files are UTF-8 JSON. Write umlauts and ß directly (`"heiße"`), never `ae/oe/ue/ss` substitutes.
- Objects are strict: an unknown or misspelled key (`"explanaton"`) is an error. Optional keys are left out, never `null`.
- Instructions, hints and explanations are in English; exercise content is in German. The level is A1 to B1, so keep German at Hayk's level (i+1).
- Every text field must be non-empty. Dates are `YYYY-MM-DD`.

## Test file

`tests/a1-02-familie.json` (the file name without `.json` must equal `id`):

```json
{
  "id": "a1-02-familie",
  "title": "Familie und Zahlen",
  "level": "A1",
  "created": "2026-09-30",
  "description": "Optional one-line summary shown in the test list.",
  "items": [ ... ]
}
```

| key | required | notes |
|---|---|---|
| `id` | yes | lowercase letters/digits with single hyphens. Suggested pattern: `<level>-<nn>-<topic>` |
| `title` | yes | shown as the heading |
| `level` | yes | `A1`, `A2`, `B1` or `B2` |
| `created` | yes | newest tests are listed first |
| `description` | no | |
| `items` | yes | at least 1 item, any mix of the types below |

Every item may also have these optional keys:

| key | notes |
|---|---|
| `instruction` | English instruction shown above the item. Leave it out to get the default for the type. |
| `hint` | behind a "Show hint" button. The result records whether it was used. |
| `explanation` | shown after the test is submitted. Explain the rule, not only the answer. |

Items are graded after the whole test is submitted. Hayk sees per-item feedback, and the result is saved (see `progress/README.md`).

### `mc` - multiple choice, auto-graded

```json
{
  "type": "mc",
  "question": "Woher kommen Sie?",
  "options": ["Ich komme aus Armenien.", "Ich wohne in Armenien.", "Ich heiße Armenien."],
  "answer": "Ich komme aus Armenien.",
  "explanation": "Woher? = from where? Answer with aus + country."
}
```
- `options`: at least 2, all different. They are shuffled for every attempt, so you can put the right one anywhere.
- `answer`: must be exactly one of the `options` strings.

### `gap` - fill in the gaps, auto-graded

```json
{
  "type": "gap",
  "text": "Ich ___ Hayk und ich ___ aus Armenien.",
  "answers": [["heiße"], ["komme", "bin"]],
  "hint": "ich form of heißen and kommen"
}
```
- Mark each gap in `text` with `___` (3 or more underscores).
- `answers[i]` lists every accepted answer for gap `i`; the number of lists must equal the number of gaps.
- Comparison trims and collapses spaces and is case-sensitive (German capitalization matters). Add `"caseSensitive": false` to the item to ignore case.
- Near misses are still wrong but labelled for you: `case` (only capitalization differs) and `umlaut` (ä/ö/ü/ß written as ae/oe/ue/ss, or dots left off).

### `order` - build a sentence from word tiles, auto-graded

```json
{
  "type": "order",
  "prompt": "Tomorrow I have an appointment.",
  "tiles": ["habe", "ich", "einen", "Termin", "morgen"],
  "answers": ["Morgen habe ich einen Termin", "Ich habe morgen einen Termin"]
}
```
- `tiles`: single words, no spaces. They are shuffled. Write a sentence-initial word in lowercase (`"ich"`, `"wann"`) unless it is a noun or name, so capitalization does not give away the first position.
- `answers`: every accepted word order, words separated by spaces, no final punctuation. Each answer must use exactly the tiles (compared ignoring case). Grading ignores case too; this type tests word order only.
- `prompt` is optional (English meaning or a task like "Make a question").

### `translate` - free translation, auto-graded only on an exact match

```json
{
  "type": "translate",
  "direction": "en-de",
  "text": "My name is Hayk. I live in Munich.",
  "references": ["Ich heiße Hayk. Ich wohne in München.", "Mein Name ist Hayk. Ich wohne in München."]
}
```
- `direction`: `"en-de"` or `"de-en"` (`text` is in the source language).
- `references` (optional): an answer identical to one reference (spaces collapsed, final `.`/`!`/`?` ignored, case-sensitive) is marked correct. Anything else is `pending` and waits for your review. The first reference is shown to Hayk after submitting.

### `write` - free writing, always reviewed by you

```json
{
  "type": "write",
  "instruction": "Introduce yourself: name, country, city, languages, job. 5-6 short sentences.",
  "prompt": "Stellen Sie sich vor: Name, Land, Wohnort, Sprachen, Beruf.",
  "minWords": 25
}
```
- `minWords` (optional, positive integer): shown as a live word counter; it does not block submitting.
- Always `pending` unless left empty (then `wrong`).

### `dictation` - listen and type, auto-graded word by word

```json
{
  "type": "dictation",
  "text": "Der Termin ist am Dienstag um neun Uhr."
}
```
- The app reads `text` aloud (normal and slow buttons) and never shows it before submitting.
- Grading compares word by word, case-sensitive, ignoring punctuation at word edges. The feedback shows a diff (wrong, missing, extra words). Only a perfect match is correct.
- Write numbers as words if you want them typed as words ("neun"), since TTS reads "9" and "neun" the same.

### `listen_mc` - listen, then multiple choice, auto-graded

```json
{
  "type": "listen_mc",
  "audio": "Guten Tag, hier ist die Praxis Doktor Weber. Ihr Termin ist am Donnerstag um elf Uhr.",
  "question": "Wann ist der Termin?",
  "options": ["am Donnerstag um 11 Uhr", "am Dienstag um 11 Uhr", "am Donnerstag um 12 Uhr"],
  "answer": "am Donnerstag um 11 Uhr"
}
```
- `audio` is spoken, never shown before submitting. Same `options`/`answer` rules as `mc`.
- Spell out abbreviations in `audio` ("Doktor", not "Dr.") so every voice reads them the same.

## Word bank: `words.json`

A JSON array. New words are introduced in array order (default 10 new per day), so append new words at the end.

```json
[
  {
    "id": "termin",
    "de": "der Termin",
    "plural": "die Termine",
    "en": "appointment",
    "example": { "de": "Am besten machen wir sofort einen Termin.", "en": "It's best if we make an appointment right away." },
    "level": "A1",
    "tags": ["termine"],
    "added": "2026-09-28"
  },
  {
    "id": "heissen",
    "de": "heißen",
    "en": "to be called (name)",
    "example": { "de": "Ich heiße Charlotte Meier." },
    "level": "A1",
    "added": "2026-09-28"
  }
]
```

| key | required | notes |
|---|---|---|
| `id` | yes | unique and stable forever (the review history is keyed by it). Lowercase ASCII of the lemma: `ä`->`ae`, `ß`->`ss`, e.g. `heissen`, `puenktlich`. For a second word with the same spelling append `-2`. |
| `de` | yes | nouns WITH the article (`"der Termin"`); in English-to-German review Hayk must type the article too. Verbs in the infinitive. |
| `plural` | no | nouns only: the full plural with `die` (`"die Termine"`). Leave it out if there is none. If present, `de` must start with der/die/das. |
| `en` | yes | short English meaning; separate senses with `, ` or `; ` |
| `example` | no | `{ "de": "...", "en": "..." }`, `en` optional. Prefer the Goethe example from `reference/goethe_wortliste.tsv`. |
| `level` | yes | `A1`, `A2`, `B1`, `B2` |
| `tags` | no | topic tags, lowercase |
| `added` | yes | date the word was added |

Changing `de` or `en` of an existing word is fine; changing or deleting its `id` loses its review history.

## Checklist before telling Hayk a test is ready

1. `cd app && npm run check-content` prints `OK`.
2. Each item has an `explanation` for the rule it practises.
3. `gap` and `order` items list every correct variant you would accept, otherwise Hayk is marked wrong for a correct answer.
4. Tell Hayk the test title; it appears at the top of the list on `http://localhost:5173/`.
