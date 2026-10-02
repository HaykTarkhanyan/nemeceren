---
name: theme-lesson
description: >-
  Build a theme lesson for the nemeceren app from something Hayk brings: a song URL, a video,
  an article, or just a topic ("going to the doctor"). Produces content/themes/<slug>.json in the
  lesson format with a theme header, key lines with translations and nuances, word cards and
  exercises, then checks and commits it. Use when Hayk shares a song or video link, or asks for a
  lesson "about" something outside the course syllabus.
---

# Theme lesson

A theme lesson is a normal lesson (content/README.md, "Lessons") with a `theme` header instead of a
place in the course (`unit`/`order`). It lives in `content/themes/<slug>.json` and appears in the app
under Lessons → Themes. Its `words` unlock when Hayk opens it, like any lesson. It is **not tied to
his level**: the point is real German he cares about, explained so he can follow it.

Prerequisite: the Themes tab and the `theme` schema (DECISIONS.md, "theme lessons"). If
`content/themes/` isn't supported yet (check-content rejects the file), stop and tell Hayk.

## Inputs

- A URL (YouTube, Spotify, lyrics page, article) or a title, or a topic with no source.
- Optionally what Hayk wants from it ("the slang", "sing along", "work vocabulary"). Ask only if
  the source is ambiguous (two songs with the same name, say). Otherwise just start.

## Steps

1. **Identify the source.** Open the URL with WebFetch. If that returns nothing useful (JS pages,
   YouTube), use Playwright and read the title from the page. Get the title, the artist or author,
   the year, the genre or outlet, and the language variety (standard, Bavarian, Austrian, Swiss,
   youth slang). Check facts (year, album, who sings) with a web search. Never state them from
   memory.
2. **Get the text.** Read lyrics, transcript or article text from a page that has it. If there
   isn't a reliable text, ask Hayk to paste it into the chat. **Never reconstruct lyrics from
   memory**, and mark any line you are unsure of. A topic with no source skips this step: you write
   short dialogues yourself, as in a course lesson.
3. **Pick the teaching lines.** Choose 6-12 lines, favouring:
   - the chorus or hook;
   - high-frequency chunks Hayk can reuse;
   - one or two grammar showcases;
   - slang, dialect and cultural references that need explaining.

   These go in the teaching sections (examples with notes).
3b. **Full text.** Hayk wants the whole song too (2026-10-02): add a `lyrics` block right after
   "About this song", folded away by default, with every line and a natural English translation,
   grouped into stanzas (labels like "Verse 1", "Chorus"). Keep repeats as they are sung. Write
   standard spelling where a lyrics site has typos ("am besten", "wie lang") and say so in the
   lesson. Leave out pure filler like "lalala". The app counts the unique words from this block
   and shows the count on the lesson and the Themes card.
4. **Write the lesson** (template below). Explanations are in English, with Russian/Armenian
   comparisons only where they really help (CLAUDE.md). For every excerpt:
   - a translation that is natural, not word-salad;
   - word-by-word notes for the hard parts;
   - what is colloquial, dialect (with the standard German next to it), or a pun;
   - a pointer to the course unit where the grammar is taught ("verb at the end: Unit 3").
5. **Word cards.** Add 5-12 words worth keeping to `content/words.json` (one line per word, format
   in content/README.md):
   - tags `["theme", "<slug>"]`;
   - gender and plural checked in `reference/german_nouns.csv`;
   - level from `reference/goethe_wortliste.tsv`; if the word isn't there, use your best estimate
     (B1/B2);
   - list their ids in the lesson's `words`;
   - skip words Hayk already has (search words.json first).
6. **Exercises.** 4-6 items: gaps in key lines, the meaning of a phrase (mc), putting a line in
   order, a short translation. Follow the teaching rules: no answer inside its question, every
   correct variant listed, an `explanation` for each item.
7. **Checks** (from `app/`, memory permitting):
   - `npm run glossary`, then curate or ignore what it lists. Dialect forms and names go to the
     ignore list or get curated entries that give the standard form.
   - Spot-check the popups of the most common words. The generated glosses are weakest there
     (`_learnings/`, 2026-09-29).
   - `npm run check-content` must say OK.
8. **Self-review before committing:**
   - every German sentence you wrote is correct;
   - every translation has been checked line by line;
   - every dialect form is labelled;
   - every fact has a source;
   - the full-text translation has been checked line by line, like the excerpts;
   - no exercise gives its answer away.
9. **Commit and push** content only (`content/themes/<slug>.json`, `content/words.json`, the glossary
   files), then watch CI. Tell Hayk the title and that it's under Lessons → Themes. Offer a chat
   drill on the lines or a sing-along/shadowing session.

## Template

```json
{
  "id": "t-<slug>",
  "theme": {
    "kind": "song",
    "title": "<song title>",
    "by": "<artist>",
    "year": 2019,
    "url": "<link to listen or read>",
    "variety": "standard German | Bavarian | Austrian | Swiss | youth slang"
  },
  "level": "B1",
  "title": "<English title> (<German title>)",
  "summary": "One sentence: what it is and what Hayk gets from it.",
  "goals": ["Understand the chorus", "..."],
  "words": ["<word ids>"],
  "sections": [
    { "id": "about", "type": "explanation", "title": "About this song", "text": "Who, when, why it's worth it, where you'd hear it." },
    { "id": "lyrics", "type": "lyrics", "title": "Full lyrics with translation", "stanzas": [ { "label": "Verse 1", "lines": [ { "de": "<line>", "en": "<translation>" } ] } ] },
    { "id": "chorus", "type": "examples", "title": "The chorus", "items": [ { "de": "<line>", "en": "<translation>", "note": "<nuance>" } ] },
    { "id": "chorus-notes", "type": "explanation", "title": "What's going on in the chorus", "text": "Word-by-word, colloquial vs standard, grammar pointers." },
    { "id": "words", "type": "table", "title": "Words worth keeping", "columns": [{ "header": "German", "de": "words" }, { "header": "English" }], "rows": [["", ""]] },
    { "type": "tip", "title": "How to use it", "text": "Listen with the link, read along, sing the chorus, shadow a line." },
    { "type": "audio", "title": "Say the key lines slowly", "items": [ { "de": "<line>", "en": "<translation>" } ] },
    { "type": "exercise", "title": "Check yourself", "items": [] }
  ]
}
```

- `kind`: `song`, `video`, `article` or `topic` (a topic has no `url`/`by`).
- The field names above follow the theme schema in `app/src/content/schema.ts`. If they differ,
  the schema wins; fix this template.
- Slug: lowercase ASCII with hyphens, e.g. `t-cro-bye-bye`. Section ids are needed only for sections
  Topics might point to.
