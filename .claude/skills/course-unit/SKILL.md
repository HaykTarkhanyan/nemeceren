---
name: course-unit
description: >-
  Write a new syllabus unit (or a single new course lesson) for the nemeceren app: lessons, tests
  and word cards in content/, checked against the reference data, reviewed, installed and
  committed. Use when Hayk asks for the next unit ("write Unit 3"), when the content runway is
  getting short, or when a course lesson needs adding to an existing unit. Not for songs, videos or
  topics outside the syllabus: that is the theme-lesson skill.
---

# Course unit

The course follows `SYLLABUS.md` (units 0-6 to A1). Units 0-2 were built this way; this skill
keeps later units consistent. Formats are in `content/README.md`. Teaching rules are in
`CLAUDE.md` ("How to teach"). Read both first, and skim the `_learnings/` file names.

## 0. Before writing

- **The unit's row in `SYLLABUS.md`:** can-do, grammar and chunks, Nicos Weg chapters, end task, hours. Read the "Deviations as written" notes too. Don't silently change scope: if something should move between units, say so and add a note to the syllabus.
- **`DEFERRED_TODO.md`:** notes parked for this unit. For example, Unit 3 must re-add der Termin, morgen, leider, pünktlich (their old entries are in git history, commit 50ac3db).
- **Hayk's progress:** `uv run backend/scripts/progress.py summary --days 30`. Use the most-missed words and recurring mistakes (in reviews, notes and graded tests) for review items and warnings.
- **Existing cards:** search `content/words.json` before adding any word. Ids must be unique, and you shouldn't re-introduce a word Hayk already has.
- **Runway:** write one unit ahead of Hayk, not three. The content should adapt to how the last unit went.

## 1. Plan

- **Lessons:** 5-7 per unit, ids `u<N>-<NN>-<slug>` (`u3-01-uhrzeit`), `order` 1, 2, 3... Title "English (German)". Each lesson has one job: a situation or a grammar point, plus its words.
- **Words:** about 80-100 per unit (about 50 in Unit 0), spread over the lessons, each card listed in exactly one lesson's `words`. Pick them from `reference/goethe_wortliste.tsv` (A1 first; A2 only when the situation needs it, and label it) and from the unit's situations: work, classes, friends, Munich.
- **Tests:** 3 per unit, `u<N>-t1..t3`, 10-12 items each, attached to the lessons they check (`tests` in the lesson).
  - From Unit 2 on, every test starts with 2 review items from earlier units, about 20%.
  - The last test ends with the unit's end task as a `write` item ("Unit N final task ... Claude will check it").

## 2. Write

Lessons, in roughly this order of blocks:
1. a table or explanation that introduces the material;
2. the explanation of the grammar or chunks;
3. a `comparison` for Russian/Armenian, only where it helps;
4. `examples`;
5. a `tip` or `warning` for the trap;
6. `audio` (listen and repeat);
7. `exercise` ("Check yourself", 5 items, mixed types).

Give the sections Hayk will want to revisit an `id`, for Topics.

Rules that came from real mistakes:
- **German at Hayk's level:** short sentences, words from this or earlier units. Check new words against the Goethe list. Explanations are in English; keep German inside them in `[[...]]`.
- **Russian/Armenian claims are where Claude is most often wrong.** Example: "Armenian has no articles" was false; it has articles but no gender (`_learnings/2026-09-29-1213_...`). Check every comparison, and flag any you're unsure of for the reviewer.
- **Taught before tested:** every word an exercise or test needs must appear earlier in a lesson or a card of this or an earlier unit. The exceptions are wrong options and accepted variants. Hayk is also told unknown words he will meet ("einen Bruder: see lesson 6").
- **Exercises:**
  - **mc options are always German**: they get word popups and must be in the glossary (`_learnings/2026-10-02-0024_mc-options-are-german.md`). Put English in the question, or use a de-en `translate`.
  - Give `gap` and `order` items every correct variant, and an `instruction` with the English cue.
  - No answer or giveaway inside the question, and an `explanation` for every item.
- **Cards:**
  - gender and plural from `reference/german_nouns.csv`;
  - level from the Goethe TSV, or your best estimate if the word isn't there;
  - an example sentence using known words;
  - tags `["<topic>", "unit<N>"]`, `added` = today;
  - one line per word in `words.json`.
- **Phrases as cards:** no final punctuation in `de` ("Wie geht's", "Noch einmal, bitte"), matching Units 0-1.

Draft in the scratchpad first: lessons, tests, `words.json` additions.

## 3. Check

From `app/`, one heavy step at a time, with memory checked (CLAUDE.md):
- `npm run glossary`, then curate or ignore what it lists. Then spot-check the popups of the unit's most common words: generated glosses are weakest on frequent words, interjections and pronouns, and at sentence starts (`content/glossary.json` holds the curated fixes).
- `npm run check-content` must say OK.
- A taught-before-tested scan: the German tokens of each exercise and test against the words shown in earlier lessons and cards. The Unit 0-2 review did this with a throwaway script, so write one again or ask Hayk whether it should become a kept script in `app/scripts/non_essential/`.

## 4. Independent review

One reviewer subagent (allowed without asking: one agent, CLAUDE.md). Give it:
- the draft paths;
- the syllabus row;
- the teaching rules.

Ask it to check:
- every German sentence and translation;
- answer keys and accepted variants;
- giveaways;
- taught-before-tested;
- the Russian/Armenian claims;
- level, and gender and plural.

Apply the fixes. Disagree with a finding only with evidence (a reference file or a source).

## 5. Install and ship

1. Copy the drafts into `content/lessons/` and `content/tests/`, and append the cards to `content/words.json`. Fail on any id clash.
2. Add the new revisitable sections to `content/topics.json`, in course order.
3. Run the glossary build and check-content again.
4. Update `DEFERRED_TODO.md` (what this unit took care of, what moves on) and `SYLLABUS.md` if anything deviates.
5. Commit only the content and doc files, push, and watch the Pages deploy.
6. Tell Hayk what's new, in one short list: lessons, tests, the number of new words. He reaches them in order: Lessons, then Words, then the tests on Home.

## 6. When Hayk finishes a unit

The finish rules are in `SYLLABUS.md` ("The unit is done when ..."):
- the end task done and reviewed;
- the final test at 80% or more after grading;
- every word of the unit introduced.

Grade his attempts with `progress.py review` (hints first in the chat, then corrections). Then mark the unit done in the syllabus progress table, with dates and hours (`progress.py sessions`).
