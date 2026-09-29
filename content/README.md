# Content authoring guide (for Claude)

Everything in this folder is written by Claude and read by the app in `app/`. You do not need to read the app code: this file is the full contract.

- `tests/<id>.json` - one test per file. Shows up in the app on its own (no restart while `npm run dev` runs).
- `lessons/<id>.json` - one lesson per file (topic, explanation, examples, exercises), see [Lessons](#lessons).
- `words.json` - the word bank for spaced repetition.
- `topics.json` - the Topics page: lesson sections worth revisiting, see [Topics](#topics-topicsjson).
- `daily.json` - the Daily page: a joke, a fun fact and an everyday sentence per day, see [Daily](#daily-page-dailyjson).
- `glossary.json` (written by Claude) and `glossary.generated.json` (written by a script) - the word popups, see [Glossary](#glossary-word-popups).
- After every edit run, in `app/`: `npm run glossary` (only if German text changed), then `npm run check-content`. check-content prints every problem as `file: field.path: message` and exits 1. The app refuses to start on invalid files (it shows the same list), and the GitHub Pages deploy fails while any problem is left, including a German word with no glossary entry.

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
| `unit` | no | syllabus unit (0-6, see `SYLLABUS.md`). Used for "next test": tests run in unit order, then lesson order, then oldest first; tests with no unit come last |
| `lesson` | no | id of the lesson this test belongs to (its unit is used when `unit` is left out; if both are set they must agree) |
| `items` | yes | at least 1 item, any mix of the types below |

Every item may also have these optional keys:

| key | notes |
|---|---|
| `instruction` | English instruction shown above the item. Leave it out to get the default for the type. |
| `hint` | behind a "Show hint" button. The result records whether it was used. |
| `explanation` | shown after the test is submitted. Explain the rule, not only the answer. |

Items are graded after the whole test is submitted. Hayk sees per-item feedback, and the attempt is saved to Hayk's progress (Neon, see `progress/README.md`), where Claude reviews it with `uv run backend/scripts/progress.py`.

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
- `questionLang` (optional): `"en"` if the question is in English ("How do you say thank you?"). Default `"de"`. English questions get no speaker button and are not checked against the glossary; the options always count as German.
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
- `promptLang` (optional): `"en"` if the prompt is in English. Default `"de"`.
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
- `audio` is spoken, never shown before submitting. Same `options`/`answer`/`questionLang` rules as `mc`.
- Spell out abbreviations in `audio` ("Doktor", not "Dr.") so every voice reads them the same.

## Lessons

`lessons/u1-01-sich-vorstellen.json` (the file name without `.json` must equal `id`). A lesson is a page Hayk reads top to bottom, like a textbook page: topic, explanation, examples, tables, exercises. The Lessons page groups lessons by unit and shows each one as not started / in progress / done. The app remembers the section Hayk last looked at, and has a "Mark lesson as done" button.

```json
{
  "id": "u1-01-sich-vorstellen",
  "unit": 1,
  "order": 1,
  "level": "A1",
  "title": "Introducing yourself (Sich vorstellen)",
  "summary": "Say who you are and ask others: name, country, city, languages, job.",
  "goals": ["Say your name, where you come from and where you live"],
  "nicosWeg": [{ "title": "Nicos Weg A1 (course overview)", "url": "https://learngerman.dw.com/en/nicos-weg/c-36519789" }],
  "words": ["heissen", "kommen", "wohnen"],
  "tests": ["a1-01-vorstellen-termine"],
  "sections": [ ... ]
}
```

| key | required | notes |
|---|---|---|
| `id` | yes | suggested pattern `u<unit>-<nn>-<topic>`, e.g. `u0-03-zahlen` |
| `unit` | yes | syllabus unit, 0-6 for A1 |
| `order` | yes | 1, 2, 3... within the unit; no two lessons of a unit may share it |
| `level` | yes | `A1`, `A2`, `B1`, `B2` (saved with exercise results) |
| `title`, `summary` | yes | shown in the list and at the top |
| `goals` | yes | 1 or more can-do statements in English |
| `nicosWeg` | no | links: `{ "title", "url" }` |
| `words` | no | ids from `words.json` that this lesson introduces (see below) |
| `tests` | no | ids of tests that belong to the lesson (linked at the end of the lesson) |
| `sections` | yes | the blocks, in order |

**Words and lessons.** A word listed in some lesson's `words` is held back from the daily new words until that lesson is opened for the first time; opening the lesson unlocks its words, so Hayk meets them right after the explanation. Words in no lesson are introduced in `words.json` order as before. Words already introduced are always reviewed. So: add a lesson's words to `words.json` and list them in the lesson. On the Words page Hayk can also limit a review to one unit or one lesson (a word in no lesson belongs to no unit); a picked unit or lesson brings its words even if it was not opened yet, still within the daily new-word limit.

**Text format** of `explanation`, `comparison`, `tip` and `warning` (English text):
- paragraphs are separated by a blank line (`\n\n` in JSON); a single `\n` is a line break;
- consecutive lines starting with `- ` form a bullet list, with `1. ` a numbered list (a list may follow a text line directly: `"Three questions:\n- ...\n- ..."`);
- `**bold**` and `*italic*` (not inside each other);
- `[[German]]` marks German inside English text: it gets word popups and must be covered by the glossary like all German. Put whole German phrases in one `[[...]]`: `[[Wie heißen Sie?]]`.
Nothing else is special; there is no HTML. An unclosed `**`, `*` or `[[` is an error in check-content.

### Block types

Every block may have an optional `title`, and an optional `id` (kebab-case like `"verb-endings"`, unique within the lesson; put it first in the block) that `topics.json` links to. Word popups are on for everything except exercises, which are gated like tests (off until the answers are checked).

`explanation` - the teaching text:
```json
{ "type": "explanation", "title": "Three verbs to start with", "text": "With **ich** the verb ends in **-e**: [[ich heiße]], [[ich komme]].\n\n- [[Wie heißen Sie?]] - [[Ich heiße Hayk.]]\n- [[Woher kommen Sie?]] - [[Ich komme aus Armenien.]]" }
```

`comparison` - a Russian/Armenian comparison, shown in its own colour. Russian and Armenian are written as plain text; only `[[...]]` is German:
```json
{ "type": "comparison", "text": "Like Russian ты / Вы and Armenian դու / Դուք, German has [[du]] and [[Sie]]." }
```

`examples` - German sentences with English, each with a speaker button:
```json
{ "type": "examples", "items": [{ "de": "Ich heiße Hayk.", "en": "My name is Hayk.", "note": "optional short note" }] }
```

`table` - e.g. conjugations or letters and sounds. Each column says what it holds: `"de": "words"` (German words: popups, speaker, glossary check), `"de": "sound"` (letters or sounds: speaker only, no popups, not checked, e.g. `ei`, `ß`, `ch`), or nothing (English or other text). Every row has one cell per column; an empty cell is `""`.
```json
{
  "type": "table",
  "title": "heißen in the present tense",
  "columns": [{ "header": "Person", "de": "words" }, { "header": "heißen", "de": "words" }, { "header": "English" }],
  "rows": [["ich", "heiße", "I am called"], ["du", "heißt", "you are called"]]
}
```
```json
{ "type": "table", "columns": [{ "header": "Letters", "de": "sound" }, { "header": "Sounds like" }, { "header": "Example", "de": "words" }], "rows": [["ei", "the 'i' in 'wine'", "mein"]] }
```

`tip` and `warning` - short notes in the text format, shown with a label:
```json
{ "type": "tip", "text": "Answer with the same verb: [[Woher kommen Sie?]] - [[Ich komme aus Armenien.]]" }
```
```json
{ "type": "warning", "text": "Write every noun with a capital letter: [[der Name]], [[das Land]]." }
```

`audio` - listen and repeat aloud (pronunciation); each line has Play and Slow buttons:
```json
{ "type": "audio", "title": "Say these aloud", "items": [{ "de": "Wie heißen Sie?", "en": "What is your name? (polite)", "note": "optional" }] }
```

`exercise` - items with exactly the same schema and grading as test items (all 7 types above), shown together with one "Check answers" button:
```json
{
  "type": "exercise",
  "title": "Check yourself",
  "items": [
    { "type": "gap", "text": "Ich ___ aus Armenien.", "answers": [["komme"]], "explanation": "ich komme" },
    { "type": "mc", "question": "How do you ask a colleague's name politely?", "questionLang": "en", "options": ["Wie heißen Sie?", "Wie heißt du?"], "answer": "Wie heißen Sie?" }
  ]
}
```
Each check is saved like a test attempt (see `progress/README.md`) with the test id `<lesson id>-ex<n>` (`n` counts the lesson's exercise blocks from 1), so no test may have that id. Claude reviews them like tests.

The glossary covers all German in lessons: `[[...]]` in the text blocks, `examples` and `audio` sentences, table cells in `"words"` columns, and the German fields of exercise items.

## Topics: `topics.json`

The Topics page lists lesson sections worth coming back to, in groups, with the key ones starred. Each item opens its lesson at that section (`#/lesson/<lesson id>/<section id>`), scrolled into view and briefly highlighted.

```json
{
  "groups": [
    {
      "id": "grammar",
      "title": "Grammar",
      "summary": "Starred tables: learn them by heart.",
      "items": [
        { "title": "sein: bin, bist, ist, sind, seid, sind", "lesson": "u1-03-andere-vorstellen", "section": "sein", "star": true }
      ]
    }
  ]
}
```

- Groups and items are shown in file order. Group `id`s are kebab-case and unique.
- `lesson` is a lesson id; `section` is the `id` of a block in that lesson (add the id to the block first).
- `star` is `true` or left out.
- A section may appear in two groups (a grammar point that is also a word theme), but only once per group.
- The page shows each item's unit, taken from its lesson.

## Daily page: `daily.json`

"German in the wild": each day one joke, one fun fact and one everyday sentence, each with a breakdown. Deliberately not tied to Hayk's level. Day 1 unlocks on `startDate` (Hayk's local date), then one more day per calendar day; later days stay hidden. check-content prints how many days are left after today, so write more before they run out.

```json
{
  "startDate": "2026-09-29",
  "days": [
    {
      "id": "d01",
      "joke": {
        "title": "The knocking lettuce",
        "lines": [{ "de": "Was ist grün und klopft an die Tür?", "en": "What is green and knocks on the door?" }, { "de": "Ein Klopfsalat.", "en": "A 'knock lettuce'." }],
        "breakdown": [{ "de": "klopft", "en": "knocks", "note": "klopfen = to knock" }],
        "explain": "The pun: [[der Kopfsalat]] is a real word, 'head lettuce'."
      },
      "fact": { "title": "...", "lines": [...], "breakdown": [...], "explain": "..." },
      "phrase": { "title": "...", "lines": [...], "breakdown": [...], "explain": "..." }
    }
  ]
}
```

- `startDate` must be a real date. Day `id`s are `d01`, `d02`, ... in order.
- Every card has a `title`, 1 or more `lines` (`de` + `en`), 1 or more `breakdown` entries (`de`, `en`, optional `note`) and an `explain` in the lesson text format.
- Jokes: every line but the last is the setup. The last line (the punchline), the joke's `title`, the breakdown and `explain` are shown after "Show punchline", so the title may give the joke away.
- Every German line gets a speaker button. There are no word popups on this page and daily.json is not checked against the glossary: the breakdown is the gloss, and jokes may use made-up words.

## Content runway

How much prepared material is left for Hayk depends on Hayk's progress, which lives in Neon, so check-content (which runs without it, also in CI) only prints the content totals. The runway is on the app's Stats page ("Prepared material left": words not introduced yet and roughly how many days they last at Hayk's daily limit, untaken tests, unfinished lessons), and `uv run backend/scripts/progress.py summary` shows the words introduced and lessons done. When it runs low, write more. When something runs out completely the app says so ("No more new words prepared yet. Ask Claude for more.") instead of showing an empty screen.

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

## Glossary (word popups)

After a test item is submitted, after a word-review card is revealed, and on the results page, Hayk can hover (PC) or tap (phone) any German word to see its base form, part of speech, level, a short meaning, article and plural. Before answering, popups are off (Hayk's decision). Every German word in content needs a glossary entry or must be on the ignore list, otherwise check-content fails.

**Which text counts as German** (the same list is used by the generator, check-content and the app, in `app/src/content/german.ts`):

| type | German fields |
|---|---|
| `mc`, `listen_mc` | `question` (unless `questionLang` is `"en"`), `options`, and `audio` for `listen_mc` |
| `gap` | `text`, every accepted answer |
| `order` | `tiles`, `answers` (not `prompt`, which is English) |
| `translate` | `text` if `direction` is `"de-en"`, else `references` |
| `write` | `prompt` (unless `promptLang` is `"en"`) |
| `dictation` | `text` |
| words.json | `de`, `plural`, `example.de` |
| lessons | `[[...]]` in explanation, comparison, tip and warning text; `examples` and `audio` sentences (`de`); table cells in `"words"` columns; exercise items as above |

Not German: `title`, `description`, `instruction`, `hint`, `explanation`, every `en` field, and all of `daily.json` (no popups there).

**Generating.** In `app/` run `npm run glossary` (TypeScript, like check-content; about 1 s per new word because it fetches kaikki.org one word at a time with a pause; cached words are instant; the cache is `.cache/kaikki/` at the repo root, git-ignored). It needs network, so CI never runs it: commit `glossary.generated.json` together with the content. The script:
- collects every word from the fields above (plus the lowercase form of capitalized words, which may just start a sentence);
- looks each up on kaikki.org (Wiktionary data). An inflected form ("macht", "komme") points to its base form ("machen, er/sie/es form, present");
- keeps the readings a learner most likely means: the word bank first, then words (with a matching part of speech) in the DWDS Goethe A1-B1 lists in `reference/`, then the rest. Example: "einen" becomes the article "ein", not the verb "einen" (to unite);
- uses the word bank's own `en` meaning instead of Wiktionary's for its words;
- writes `glossary.generated.json` (never edit it by hand, the next run overwrites it) and lists every word still without an entry, with exit code 1.

**Checking and overriding: `glossary.json`.** Read the generated entries for the words you just added (the script prints them). Where Wiktionary is misleading for a beginner, or a word is missing, write your own entry here; it replaces the generated entry for that exact spelling. Person names go on the ignore list (no popup at all). Country and city names usually have a generated entry ("Armenien: Armenia") and can stay.

```json
{
  "ignore": ["Hayk", "Müller"],
  "entries": {
    "das": [
      { "lemma": "der", "pos": "article", "level": "A1", "gloss": ["the (neuter)"], "note": "das Kind, das Land" },
      { "lemma": "das", "pos": "pronoun", "gloss": ["this, that, it"] }
    ],
    "rufe": [
      { "lemma": "anrufen", "pos": "verb", "form": "ich form, present", "gloss": ["to phone, to call"], "note": "Separable: Ich rufe dich an." }
    ]
  }
}
```

Keys are the word exactly as written in the content (case matters: "Morgen" the noun, "morgen" tomorrow). A capitalized word at the start of a sentence also finds the lowercase key, so "Ich" at the start is covered by "ich". At a sentence start, curated entries of either spelling come before generated ones, the capitalized curated key first: a note on "Es" ("Es geht.") shows even though "es" also has an entry. The popup shows entries that differ only in part of speech (same lemma, form and gloss list) as one line, "adverb, preposition", with every note. Each key has 1-3 entries:

| key | required | notes |
|---|---|---|
| `lemma` | yes | the base form ("machen", "Termin"), without article |
| `pos` | yes | `noun`, `verb`, `adjective`, `adverb`, `pronoun`, `preposition`, `conjunction`, `article`, `determiner`, `numeral`, `interjection`, `particle`, `name`, `phrase`, `contraction`, `other` |
| `gloss` | yes | 1-3 short English meanings |
| `article` | no | nouns: `der`, `die` or `das` |
| `plural` | no | nouns: the plural without article ("Termine") |
| `form` | no | for an inflected form: "ich form, present", "dative plural" |
| `note` | no | a short hint shown under the meaning |
| `level` | no | `A1`/`A2`/`B1`; shown in the popup. At a sentence start, readings with a level win over readings without one |

The ignore list and entries must not overlap, and a word may be listed only once.

**Known limitation: separable verbs.** Popups look at one word at a time, so in "Ich rufe dich an" the word "rufe" shows "rufen", and "an" shows the preposition. The escape hatch is a curated entry for the form in that sentence (like "rufe" above, with a `note`). The same applies to other multi-word expressions ("Wie geht's?").

## Checklist before telling Hayk a test is ready

1. `cd app && npm run glossary` covers every word (curate or ignore what it lists), then `npm run check-content` prints `OK`.
2. Each item has an `explanation` for the rule it practises.
3. `gap` and `order` items list every correct variant you would accept, otherwise Hayk is marked wrong for a correct answer.
4. Tell Hayk the test title; it appears at the top of the list on `http://localhost:5173/`.
