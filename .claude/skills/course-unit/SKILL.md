---
name: course-unit
description: >-
  Write the next syllabus unit(s) (or a single new course lesson) for the nemeceren app: lessons,
  tests and word cards in content/, built from SYLLABUS.md and the reference syllabuses, checked
  against the reference data, reviewed, installed and committed. Use when Hayk asks for the next
  unit(s) ("write Units 3, 4, 5"), when the content runway is getting short, or when a course lesson
  needs adding to an existing unit. Not for songs, videos or topics outside the syllabus: that is
  the theme-lesson skill.
---

# Course unit

The course follows `SYLLABUS.md` (units 0-6 to A1). Units 0-2 were built this way; this skill keeps
later units consistent and lets a fresh session do it without the history of how 0-2 were made.
Work **one unit at a time, completely** (write, check, review, install, commit) before starting the
next: a later unit must build on the earlier unit's real word ids, lessons and wording.

## 0. Read before writing (every unit)

Project rules and formats:
- `CLAUDE.md`: learner profile and "How to teach". Hint-first, Russian/Armenian comparisons, Hayk's level.
- `content/README.md`: every file format, the block types, the glossary, and the checklist at the end.
- `DECISIONS.md`, at least #13 (syllabus), #23-#28 (lessons and words), #50 and #66 (word source and limits), #64 (test keys: mc options are numbered 1-9).
- `_learnings/` file names, and read the content ones: `mc-options-are-german`, `armenian-has-articles-not-gender`.
- **Style models.** Read one finished lesson and one test of the previous unit, e.g. `content/lessons/u2-01-der-die-das.json` and `content/tests/u2-t3-familie-wohnung.json`. Match their shape, length and tone.

What to teach (the reference syllabuses):
- **`SYLLABUS.md`, the unit's row:** can-do, grammar and chunks, the Nicos Weg chapters, the end task, the hours. Also read "How a unit runs" and "Deviations as written". Don't change scope silently: if something has to move between units, add a deviation note.
- **`_knowledge/2026-09-29_syllabus-research.md`:** the consensus grammar order across Schritte, Menschen, Nicos Weg and Linie 1, the source list, the hours, and the v1 draft units. Use it to decide what belongs in this unit, and what is only a chunk now and taught properly later.
- **`reference/dw_nicos_weg_lessons.txt`:** every Nicos Weg lesson (title | topic | grammar), by chapter. Read the chapters the syllabus row names. Mirror their situations and grammar points, and put matching links in each lesson's `nicosWeg` (chapter titles exactly as listed; course URL `https://learngerman.dw.com/en/nicos-weg/c-36519789`).
- **`reference/bamf_lernziele.tsv`:** the BAMF integration-course learning goals (`niveau`, `hf_title` = daily-life field, `lernziel` = can-do), 185 at A1. Filter A1 goals for the unit's fields (work, appointments, shopping, health ...) and turn the useful ones into lesson goals and test situations. Example: `awk -F'\t' '$6=="A1"' reference/bamf_lernziele.tsv | grep -i termin`.
- **`reference/goethe_wortgruppen.txt`:** the closed word groups (numbers, times, days, months, seasons, countries, school words ...). They are not in the TSV. Units 3 (times, dates) and 4 (food) need them.
- **`reference/goethe_A1_modellsatz.pdf`** and **`reference/exams_A1/uebungssatz01.pdf`, `uebungssatz02.pdf`:** real A1 task types (filling in a form, a short message, asking and answering with cards). Model end tasks and the realistic test items on them, but this is daily-life German, not exam drill (CLAUDE.md: no exam).
- **`_knowledge/2026-09-28_llm-tutoring-and-materials.md`:** why the teaching works the way it does.

Hayk's state:
- `uv run backend/scripts/progress.py summary --days 30`: most-missed words, near misses, lessons done. Then `progress.py ungraded` and recent reviews and notes. Recurring mistakes become review items and warnings in the new unit.
- `DEFERRED_TODO.md`: notes parked for this unit.
- **Runway:** write one unit ahead of where Hayk is. When asked for several units, write them in order, each fully finished before the next.

## 1. Plan the unit (write it down before drafting)

A short plan in the scratchpad:
- the lessons, with their words and their grammar or chunk;
- the tests;
- the word list.

- **Lessons:** 5-7, ids `u<N>-<NN>-<slug>` (`u3-01-uhrzeit`), `order` 1, 2, 3 ... Title "English (German)". Each lesson has one job: a situation or a grammar point, plus its words. Grammar goes from chunk to pattern: use it first as a fixed phrase, then show the pattern.
- **Words:** about 80-100 per unit, each card in exactly one lesson's `words`.
  - Pick A1 words from `reference/goethe_wortliste.tsv` and the word groups first. A2 only when the situation needs it, and give it that level.
  - Search `content/words.json` for every candidate: ids must be unique, and existing words are reused, not re-added.
  - Song lessons have their own cards (tag `theme`), e.g. trinken, der Tag, zusammen. Don't duplicate them.
- **Tests:** 3 per unit, `u<N>-t1..t3`, 10-12 items, attached to the lessons they check (`tests` on the lesson).
  - Every test starts with 2 review items from earlier units, about 20% (SYLLABUS.md).
  - The last test ends with the unit's end task as a `write` item ("Unit N final task: ... Claude will check it", with `minWords`).
  - Use a mix of item types, including listening (`listen_mc`, `dictation`).

## 2. Draft (scratchpad first)

Lesson blocks, in roughly this order:
1. a `table` or `explanation` that introduces the material;
2. the grammar or chunks;
3. a `comparison` for Russian/Armenian, only where it really helps;
4. `examples`;
5. a `tip` or `warning` for the trap;
6. `audio` (listen and repeat);
7. `exercise` ("Check yourself", 5 items).

Give an `id` to sections Hayk will want to revisit, for Topics.

Rules that came from real mistakes:
- **German at Hayk's level:** short sentences, only words from this or earlier units in the example sentences. Explanations in English, with German inside them in `[[...]]`.
- **Russian/Armenian claims are where Claude is most often wrong.** "Armenian has no articles" was false. Check each comparison. Mark unsure ones for the reviewer, or leave them out.
- **Exercises and tests:**
  - **mc and listen_mc options are always German.** They are numbered 1-9 in tests, get word popups and must be in the glossary. Put English in the question, or use a de-en `translate`.
  - `gap` and `order` list every correct variant, with an `instruction` that gives the English cue.
  - No answer or giveaway inside its question, and an `explanation` that teaches the rule for every item.
  - An answer that needs digits ("um 8 Uhr") switches off the digit umlaut keys for that item automatically (DECISIONS #64). Fine, just know it.
- **Cards:**
  - gender and plural from `reference/german_nouns.csv`;
  - level from the Goethe TSV, or your best estimate;
  - an example sentence using known words;
  - tags `["<topic>", "unit<N>"]`, `added` = today;
  - one line per card in `words.json`;
  - phrase cards without final punctuation ("Wie geht's").

## 3. Check (from `app/`; one heavy step at a time; memory per CLAUDE.md; long commands in the background)

1. `npm run glossary` (2-3 min), then curate or ignore what it lists. Spot-check the popups of the unit's most frequent words; the generated glosses fail on:
   - interjections and pronouns;
   - sentence starts, where a capitalized form shadows the lowercase one;
   - words split by an apostrophe (`roll'`, `fass'`);
   - rare senses ("müssen: to need the bathroom", "rein: purely").

   Fix these in `content/glossary.json`. A quick way to see the popups: a small `tsx` script with `lookup()` from `src/glossary/lookup.ts`.
2. `npm run check-content`: OK.
3. `npx tsx scripts/non_essential/check-taught.ts <N>`: German the unit's exercises and tests need before any lesson or card showed it. Read every line: either teach the word earlier (lesson text, examples or a card) or change the item. Sound pairs and number words built from known parts are fine.
4. Re-read every German sentence once yourself: verb position, articles and cases, umlauts and ß.

## 4. Independent review (one reviewer subagent per unit; one agent is allowed without asking)

When writing several units in one go, tell Hayk up front how many reviewer agents that means (one per unit, run one at a time). Global CLAUDE.md asks for that count before going past 1-2 agents.

Give the reviewer:
- the draft paths;
- the syllabus row;
- the teaching rules (CLAUDE.md "How to teach");
- this skill's section 2 rules.

Ask it to check, with file and field for every finding:
- every German sentence and translation;
- answer keys and accepted variants;
- giveaways;
- taught-before-tested;
- every Russian/Armenian claim;
- level, gender and plural.

Apply the fixes. Disagree with a finding only with evidence (a reference file or a source).

## 5. Install and ship (per unit)

1. Copy the drafts into `content/lessons/` and `content/tests/`, and append the cards to `content/words.json`. Fail on any id clash.
2. Add the unit's revisitable sections to `content/topics.json`, keeping each group in course order (unit, lesson, section).
3. Run `npm run glossary` again if anything changed, then `npm run check-content` and `check-taught.ts <N>` again.
4. Update `DEFERRED_TODO.md` (what this unit took care of) and `SYLLABUS.md` (deviations, if any).
5. Commit only the content and doc files for this unit ("Add Unit N content: ..."), push, and watch the Pages deploy in the background.
6. Write a short `_work_sessions/` note after each unit, so a fresh session can resume mid-way.
7. Tell Hayk in one short list: lessons, tests, the number of new words, and where to start.

## 6. When Hayk finishes a unit

The finish rules are in `SYLLABUS.md`:
- the end task done and reviewed;
- the final test at 80% or more after grading;
- every word of the unit introduced. "Words from: Unit N" brings all of them, with no daily cap.

Grade with `progress.py review` (hints first in the chat, then corrections). Then mark the unit done in the syllabus progress table, with dates and hours from `progress.py sessions`.

## Notes for Units 3-5 (from the syllabus, the research and Units 0-2)

- **Unit 3, Making plans** (Nicos Weg ch. 7, 8):
  - times (formal 14:30 and informal "halb drei"), days, months and ordinal dates from `goethe_wortgruppen.txt`;
  - am / um / von ... bis;
  - separable verbs (anrufen, aufstehen);
  - time-first word order (Am Samstag gehe ich ...);
  - können / wollen / müssen + the verb bracket. The song lesson `t-sieben-tage-lang` already used "Was wollen wir trinken?" and "Jetzt müssen wir streiken" as chunks, so link to it.

  Russian comparison: "halb drei" = 2:30, the same logic as половина третьего. Check it before writing.

  Re-add from DEFERRED_TODO: der Termin, morgen, leider, pünktlich (old entries in git history, commit 50ac3db). Die Uhr and die Zeit already exist.

  End task: a text-message exchange planning a Saturday with a friend, including moving the time once.
- **Unit 4, Eating out and free time** (ch. 3, 11, 12):
  - the accusative in full, building on Unit 2's "einen" chunk (den/einen/keinen, ihn/sie/es);
  - möchte and "Ich hätte gern" (the Extras phrase p13 already used it);
  - mögen;
  - gern / lieber / am liebsten;
  - vowel-change verbs (essen, nehmen). sprechen e→i and gern were already taught early in Unit 1 (SYLLABUS deviation note): build on them, don't re-introduce them.

  The paying phrases "Zusammen oder getrennt?" and "Stimmt so." are in Extras. Teach them properly and reuse the wording.

  End task: role-play ordering for two, asking about a dish, paying.
- **Unit 5, Work and class day** (ch. 9, 13, ch. 16 lesson 4):
  - the imperative (Sie, du);
  - dürfen and sollen;
  - "Könnten Sie ...?" as a polite chunk;
  - the Perfekt with haben and sein;
  - war and hatte. Nicos introduces these early; the research file has the timing across textbooks.

  Hayk's priorities are work and classes, so use instructions from a teacher or boss and a weekend report.

  End task: tell a colleague about your weekend, and ask a teacher to repeat and explain.
