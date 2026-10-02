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

The course follows `SYLLABUS.md`: Units 0-7 to A1 (7 is a wrap-up with no new grammar), then the A2 table, Units 8-17 (DECISIONS.md #72). Units 0-6 were built this way; this skill keeps
later units consistent and lets a fresh session do it without the history of how 0-2 were made.
Work **one unit at a time, completely** (write, check, review, commit) before starting the next: a
later unit must build on the earlier unit's real word ids, lessons and wording.

**Before starting several units:** ask Hayk first and wait for a yes (global CLAUDE.md: more than 1-2
agents needs permission, with a cost estimate). Say what you'll run, e.g.: "3 units, one reviewer agent
per unit, run one at a time, roughly 250k tokens each". The last independent review of this skill used
about 250k tokens. Pushing to `main` deploys live for Hayk and Anahit: say so in the same question.

## 0. Read before writing (every unit)

Project rules and formats:
- `CLAUDE.md`: learner profile and "How to teach". Hint-first, Russian/Armenian comparisons, Hayk's level, they/them.
- `content/README.md`: every file format, the block types, the glossary (including the separable-verb limitation), and the checklist at the end.
- `DECISIONS.md`, at least:
  - #13 (syllabus);
  - #23-#28 (lessons and words);
  - #50 and #66 (word source and limits);
  - #64 (test keys: mc options numbered 1-9; digit umlaut keys in answer boxes).
- `_learnings/` file names; read the content ones (`mc-options-are-german`, `armenian-has-articles-not-gender`).
- **Style models:** read one finished lesson and one test of the previous unit, e.g. `content/lessons/u2-01-der-die-das.json` and `content/tests/u2-t3-familie-wohnung.json`, and match their shape, length and tone.

What to teach (the reference syllabuses):
- **`SYLLABUS.md`, the unit's row:** can-do, grammar and chunks, the Nicos Weg chapters, the end task, the hours. Also read:
  - "How a unit runs";
  - "Deviations as written";
  - "Checkpoints". After Unit 3 comes a mixed review test over Units 0-3; at the end, the Goethe A1 mock exam.
- **`_knowledge/2026-09-29_syllabus-research.md`:** the consensus grammar order across Schritte, Menschen, Nicos Weg and Linie 1, plus the hours and the v1 draft units. Use it to decide what belongs in this unit, and what is only a chunk now and taught properly later.
- **`reference/dw_nicos_weg_lessons.txt`:** every Nicos Weg lesson (title | topic | grammar). Read the chapters the syllabus row names.
  - **Mirror their situations, but take their grammar only where the syllabus row lists it.** Anything else is a chunk at most. For example: ch. 8.4 hatte belongs to Unit 5, ch. 9.3 the dative to Unit 6, ch. 12.4 the imperative to Unit 5, and ch. 11 and 13 have comparatives.
  - Each lesson's `nicosWeg` holds `{ title, url }` with the chapter as listed. The course URL is `https://learngerman.dw.com/en/nicos-weg/c-36519789`.
- **`reference/bamf_lernziele.tsv`:** BAMF integration-course goals (`niveau`, `hf` = field code, `lernziel` = can-do), 185 at A1. Filter by level and keyword, and turn the useful ones into lesson goals and test situations.
  - Example: `awk -F'\t' '$6=="A1"' reference/bamf_lernziele.tsv | grep -i -E "termin|verabred"`.
  - The `hf_title` column is noisy; prefer `hf` plus a keyword.
  - Unit 3's appointment goals sit in the cross-cutting group (D 2.5, Verabredungen treffen).
- **`reference/goethe_wortgruppen.txt`:** the closed word groups (numbers, times incl. "halb" and "Viertel", days, months, dates, seasons, countries ...). They are not in the TSV.
  - Unit 3 needs them.
  - There is no food group: Unit 4's food words come from the TSV.
  - Words from the word groups are A1. Check `reference/dwds_goethe_A1.csv`; for example, "halb" and "Viertel" appear only at B1 in the TSV.
- **`reference/goethe_A1_modellsatz.pdf`** and **`reference/exams_A1/uebungssatz01.pdf`, `uebungssatz02.pdf`:** real A1 task types (filling in a form, a short message, asking and answering with cards). Model end tasks and the realistic test items on them, but this is daily-life German, not exam drill (no exam: CLAUDE.md).
- **`_knowledge/2026-09-28_llm-tutoring-and-materials.md`:** why the teaching works the way it does.

Hayk's state:
- `uv run backend/scripts/progress.py summary --days 30`: most-missed word reviews, near misses, lessons done.
- `progress.py ungraded` and `progress.py notes`: open work.
- There is no command that lists past reviews; `progress.py show <attempt-id>` shows one attempt with its review. Recurring mistakes become review items and warnings in the new unit.
- `DEFERRED_TODO.md`: notes parked for this unit.
- **Runway:** write one unit ahead of where Hayk is. When asked for several units, write them in order, each fully finished before the next.

## 1. Plan the unit (write it down before drafting)

A short plan:
- the lessons, with their words and their grammar or chunk;
- the tests;
- the word list.

Keep it in the session log (step 5.5) so a fresh session can resume.

- **Lessons:** 5-7, ids `u<N>-<NN>-<slug>` (`u3-01-uhrzeit`), `order` 1, 2, 3 ... Title "English (German)". Each lesson has one job: a situation or a grammar point, plus its words.
  - Grammar goes from chunk to pattern: use it as a fixed phrase first, then show the pattern.
  - **Build on chunks earlier units already taught**, and name them in the text. Lessons can't link to each other: the text format has no links, and `nicosWeg` is only for Nicos Weg.
- **Words:** about 80-100 new cards per unit, each listed in the `words` of the lesson that teaches it.
  - Pick A1 words from `reference/goethe_wortliste.tsv` and the word groups first. A2 only when the situation needs it, and give it that level.
  - Search `content/words.json` for every candidate. Ids must be unique, an existing word never gets a second card, and a second word with the same id-spelling gets `-2` (e.g. `der Morgen` next to `morgen`: `morgen-2`).
  - **A card may be listed in several lessons; it unlocks when any of them is opened** (`lockedWordIds` in `app/src/lib/plan.ts`). Song lessons own some core A1 cards (tag `theme`: trinken, der Tag, genug, zusammen, allein, das Leben, die Sonne, das Licht, warten, das Auge, die Welt ...). When the unit teaches such a word, list the existing id in the course lesson's `words` too, so Hayk gets it even without opening the song.
  - A word already listed by an earlier course lesson doesn't need listing again: just use it.
- **Tests:** 3 per unit, `u<N>-t1..t3`, 10-12 items.
  - **Each test sets `unit`, `lesson` (the lesson it follows), `level`, `created` (today) and `description`** ("Unit N check after lessons X and Y."). The app orders tests by these fields (`courseTests` in plan.ts). That lesson also lists the test in its `tests`. The usual pattern is t1, t2, t3 after lessons 2, 4 and 6.
  - **Every test starts with 2 review items from earlier units**, about 20% (SYLLABUS.md). Their `explanation` starts "Review (Unit N): ".
  - **Every test ends with a `write` item.** In t1 and t2 it is a short task; in the last test it is the unit's end task: "Unit N final task: ... Claude will check it.", with `minWords`.
  - Use a mix of item types, including listening (`listen_mc`, `dictation`).
  - **Spoken end tasks** (role-plays or chats, as in Units 1, 4 and 5): the test gets the written version (write the dialogue or the message), and the item's instruction ends with "then ask Claude for the live role-play". In the chat, Claude's turns are 1-2 sentences with one question each, and corrections come batched at the end (CLAUDE.md).
- **Unit 3 only: the checkpoint.** Also write `u3-t4-...`, a mixed review over Units 0-3 (about 15 items), attached to the unit's last lesson.

## 2. Draft directly in `content/` (uncommitted)

Write lessons, tests and cards straight into `content/lessons/`, `content/tests/` and `content/words.json`. **All checks read only `content/`**, so drafts in the scratchpad would make every check pass on the old content. Nothing is committed until step 5; `git status` shows exactly what the unit touches.

Lesson blocks, in roughly this order:
1. a `table` or `explanation` that introduces the material;
2. the grammar or chunks;
3. a `comparison` for Russian/Armenian, only where it really helps;
4. `examples`;
5. a `tip` or `warning` for the trap;
6. `audio` (listen and repeat);
7. `exercise` ("Check yourself", 5 items).

Give an `id` (first key in the block) to sections Hayk will want to revisit, for Topics.

Rules from Units 0-2 and real mistakes:
- **German at Hayk's level:** short sentences, and only words from this or earlier units in the example sentences. Explanations are in English, with German inside them in `[[...]]`.
- **Russian/Armenian claims are where Claude is most often wrong.** "Armenian has no articles" was false. Check each comparison, mark unsure ones for the reviewer, or leave them out.
- **Item conventions (as in the existing files):**
  - **English text needs its language flag:** `questionLang: "en"` on mc and listen_mc questions in English, `promptLang: "en"` on write prompts in English. Otherwise the glossary check treats the English as German.
  - **mc and listen_mc options are always German.** They are numbered 1-9 in tests, get word popups and must be in the glossary. Put English in the question, or use a de-en `translate`.
  - **`order`** uses `prompt` (the English sentence), `tiles` and `answers`, with every correct order listed. **`gap`** lists every correct variant per gap; add an `instruction` with the English cue where the gap alone is ambiguous.
  - No answer or giveaway inside its question, and an `explanation` that teaches the rule for every item.
- **Digits and the umlaut keys (DECISIONS #64, #67):** the digit keys type ä ö ü ß in answer boxes, except where an expected answer contains a digit (gap, translate, dictation: automatic). A `write` item has no expected answer, so **set `"digits": true` on every write item that asks for times, dates, prices or numbers** (e.g. Unit 3's end task). Its box then types digits and says why, and the umlaut buttons still work.
- **Spoken German fields** (examples, audio, `listen_mc` audio, `dictation`) go through the browser voice. Write times and dates there as words ("um halb drei", "am dritten Oktober"), or listen to how the voice reads "14:30" or "3. Oktober" in the app before relying on it.
- **Cards:**
  - gender and plural from `reference/german_nouns.csv`;
  - level from the Goethe TSV, or `dwds_goethe_A1.csv` for word-group words, or your best estimate;
  - an example sentence using known words (no grammar from later units in it);
  - tags `["<topic>", "unit<N>"]` and `added` = today;
  - one line per card in `words.json`;
  - phrase cards without final punctuation ("Wie geht's");
  - **`en` in English only.** English-to-German review shows `en` as the prompt, so German in it gives the answer away ("halb drei = 2:30", "separable: ich stehe ... auf"). Irregular forms in brackets are the accepted exception ("to speak (du sprichst)"). Usage notes go in the example, or in a curated glossary note, because the generated popups copy `en` (rerun `npm run glossary` after changing `en`).
- **Scope:** moving grammar between units, or deciding to teach something only as a chunk, gets a `DECISIONS.md` entry (global CLAUDE.md) as well as a SYLLABUS deviation note.

## 3. Check (from `app/`; one heavy step at a time; free RAM per CLAUDE.md; long commands in the background)

1. **Glossary:** `npm run glossary`. It takes 2-3 minutes for a few dozen new words, and longer for about 100 new cards, because it waits about 700 ms per uncached word form. Then curate or ignore what it lists. Spot-check the popups of the unit's most frequent words. A quick way: a small `tsx` script built like `scripts/non_essential/check-taught.ts` lines 24-35, calling `lookup()`. The generated glosses fail on:
   - interjections and pronouns;
   - sentence starts, where a capitalized form shadows the lowercase one;
   - words split by an apostrophe (`roll'`, `fass'`);
   - rare senses ("müssen: to need the bathroom", "rein: purely");
   - **separable verbs (Unit 3 onward):** "rufe ... an" shows "rufen" and the preposition "an". Give every verb form the unit uses (rufe/ruft/rufst, stehe/steht, kaufe/kauft ...) a curated entry with the separable verb as its lemma and a note ("Ich rufe dich an. = I'll call you."). For the particles: the curated `auf` entry is currently only the preposition (note "Auf Wiedersehen!"), and `an` comes from the generated glossary. Because a curated key replaces the generated one, keep the preposition reading and add the particle reading as a second entry (1-3 entries per key).

   Also check wrong mc options ("Ich anrufe ...") and every ordinal, pronoun and article form the unit uses: in Units 3-4 the generated glossary gave `Viertel` the article der, `siebte` "to sieve", `achte` "to respect", `ihn` "them", `den` "nominative", `darf` "must" and `Prost` "a response to sneezing". Wiktionary also keeps vulgar senses ("gekocht: cooked, fucked", "französisch: oral sex"): grep `glossary.generated.json` glosses for vulgar words after every build and curate the hits.

   Fix these in `content/glossary.json`. **The lookup keeps only one entry per lemma + part of speech + form**, so two senses of the same form ("geht": to go / to work) go into one entry with two glosses.
2. `npm run check-content` must say OK.
3. `npx tsx scripts/non_essential/check-taught.ts <N>` (a few seconds): the German that the unit's exercises and tests need before any lesson or card showed it. Read every line: either teach the word earlier (lesson text, examples or a card) or change the item. Sound pairs and number words built from known parts are fine.
4. Re-read every German sentence once yourself: verb position, articles and cases, umlauts and ß.

## 4. Independent review (one reviewer subagent per unit, as agreed with Hayk)

Give the reviewer:
- the paths of the unit's files;
- the syllabus row;
- the teaching rules (CLAUDE.md "How to teach");
- section 2 of this skill;
- the Unit notes below.

Ask it to check, with file and field for every finding:
- every German sentence and translation;
- answer keys and accepted variants;
- giveaways;
- taught-before-tested;
- every Russian/Armenian claim;
- level, gender and plural;
- grammar from later units in places where it isn't marked as a chunk.

Apply the fixes. Disagree with a finding only with evidence (a reference file or a source).

## 5. Ship (per unit)

1. Add the unit's revisitable sections to `content/topics.json`, keeping each group in course order (unit, lesson, section).
2. Rerun the glossary build if any German changed since step 3, then `npm run check-content` and `check-taught.ts <N>`.
3. Update `DEFERRED_TODO.md` (what this unit took care of), `SYLLABUS.md` (deviations) and `DECISIONS.md` (scope decisions).
4. Commit exactly these files for this unit (check with `git status` that nothing else is staged):
   - `content/lessons/u<N>-*`, `content/tests/u<N>-*`;
   - `content/words.json`, `content/glossary.json`, `content/glossary.generated.json` (CI never builds the glossary, and check-content fails without it), `content/topics.json`;
   - the doc files above.

   Message "Add Unit N content: ...". Push only as agreed with Hayk, and watch the Pages deploy in the background; CI runs check-content, the tests and the build.
5. Write a short `_work_sessions/` note after each unit (the plan, what's done, what's next), so a fresh session can resume mid-way.
6. Tell Hayk in one short list: lessons, tests, the number of new words, and where to start.

## 6. When Hayk finishes a unit

The finish rules are in `SYLLABUS.md`:
- the end task done and reviewed;
- the final test at 80% or more after grading;
- every word of the unit introduced. "Words from: Unit N" brings all of them, with no daily cap.

Grade with `progress.py review` (hints first in the chat, then corrections). Then mark the unit done in the syllabus progress table, with dates and hours from `progress.py sessions --days <since the unit started>` (the default is 7 days).

## Notes for A2 (Units 8-17)

- **Plan:** the A2 table in `SYLLABUS.md`. Each unit has A1 size (about 6 lessons, 90-100 cards, 3 tests). Write one unit ahead of Hayk, not all of A2 at once (DECISIONS #72).
- **Words:** the Goethe A2 list (`reference/goethe_wortliste.tsv` level A2, `dwds_goethe_A2.csv`), plus any A1 word still missing (check: an A1 lemma from `dwds_goethe_A1.csv` that's on no card and in no glossary lemma).
- **Chunks from A1 that A2 must now explain, by name:** `ins Kino`, `in die Stadt` (two-way prepositions, Unit 10); `Wir treffen uns` (reflexive verbs, Unit 12); `langsamer`, `lieber`, `am liebsten` (comparison, Unit 13); `Liebe`/`Lieber`, `Sehr geehrte`/`geehrter`, `Schönen Feierabend`, `im ersten Stock` (adjective endings, Units 13-14); `Könnten Sie ...?`, `Ich hätte gern` (Konjunktiv II, Unit 11); the participles of separable and be-/er-/ver-/-ieren verbs, taught only for recognition in Unit 5 (Unit 8).
- **Glossary:** A2 brings subordinate clauses (verb at the end), so popups of separable verbs need their joined forms too (`weil ich um sieben aufstehe`). Curate them like Unit 3's split forms.

## Notes for Units 3-5 (from the syllabus, the research, Units 0-2 and an independent review)

**Unit 3, Making plans** (Nicos Weg ch. 7, 8):
- **Teach:**
  - times: formal (14:30, "vierzehn Uhr dreißig") and informal ("halb drei" = 2:30, "Viertel nach/vor");
  - days, months and ordinal dates from the word groups;
  - am / um / von ... bis;
  - separable verbs (anrufen, aufstehen, einkaufen);
  - time-first order;
  - können / wollen / müssen + the verb bracket.
- **Build on what exists:**
  - the Können chunks "Können Sie das bitte buchstabieren / wiederholen / erklären?" (u0-04, u1-05, u1-06);
  - time-first order from u1-06 `verb-position` ("In München wohne ich");
  - the song lesson "Sieben Tage lang" ("Was wollen wir trinken?", "Jetzt müssen wir streiken"), mentioned by name in the text.
- **Chunks only, with a pointer to the unit that teaches them:**
  - "am ersten / am dritten Oktober" and "im Oktober" (dative endings: Unit 6);
  - "Ich rufe dich an" (accusative pronoun: Unit 4);
  - "ins Kino", "in die Stadt", "zu mir", "nach Hause" (Units 4 and 6);
  - "Wir treffen uns" (reflexive: A2).
  - Avoid "den Termin" (the accusative "den" comes in Unit 4); write "Der Termin ist um ..." instead.
- **Traps:**
  - "halb drei" = 2:30, the same logic as Russian половина третьего. Check every comparison; have the reviewer check any Armenian one.
  - Hayk should *recognize* the southern/eastern "viertel drei" (2:15) and "dreiviertel drei" (2:45), which are common in Munich ([t-online](https://www.t-online.de/leben/familie/freizeit/id_85411858/uhrzeit-was-bedeutet-dreiviertel-drei-.html)).
  - "Ich will" means "I want", not English "will".
- **Re-add from DEFERRED_TODO:** der Termin, morgen, leider, pünktlich (old entries: `git show 50ac3db:content/words.json`).
  - Keep the ids.
  - Rewrite: tags `["termine","unit3"]`, `added` today, and the examples, since the old ones use "Am besten ... sofort" and "zum Arzt" (dative).
  - "der Morgen", if needed, gets the id `morgen-2`.
  - Die Uhr and die Zeit already exist.
- **End task:** a text-message exchange planning a Saturday with a friend, moving the time once.
  - Put the friend's messages in the German `prompt` (or an English instruction), so Hayk writes only the replies, one of them moving the time.
  - Claude plays the friend in the chat for the live version.
- **Plus:** the Unit 0-3 checkpoint test (`u3-t4`).

**Unit 4, Eating out and free time** (ch. 3, 11, 12):
- **Teach:**
  - the accusative in full (den/einen/keinen, ihn/sie/es), building on Unit 2's "einen" chunk and Unit 3's "Ich rufe dich an" chunk;
  - möchte and "Ich hätte gern" (Extras p13 already used it);
  - mögen;
  - gern / lieber / am liebsten;
  - vowel-change verbs (essen, nehmen).
- **Don't re-introduce:** sprechen e→i and gern were taught early in Unit 1 (SYLLABUS deviation note). Build on them.
- **Reuse wording:** "Zusammen oder getrennt?" (Extras p05) and "Stimmt so." (p03): teach them properly in the same words.
- **Not here:** comparatives (ch. 11.2) belong to A2 except "gern/lieber/am liebsten".
- **End task:** a role-play ordering for two, asking about a dish, paying. The written dialogue goes in the test, the live version in the chat.

**Unit 5, Work and class day** (ch. 9, 13, ch. 16 lesson 4):
- **Teach:**
  - the imperative (Sie, du);
  - dürfen and sollen (Nicos covers them in ch. 15.4 and 17.2, outside the row's chapters);
  - "Könnten Sie ...?" as the polite step up from Unit 1's "Können Sie ...?";
  - the Perfekt with haben and sein;
  - war and hatte.
- **Decide and record:** the Perfekt of separable, inseparable and -ieren verbs is A2 in the research (item 12), but a weekend report needs aufgestanden, eingekauft, angerufen, besucht, telefoniert. Either use them as chunks only, or teach the ge- inside separable verbs. Record the choice in DECISIONS.md.
- **Traps:**
  - "muss nicht" = don't have to; "mustn't" = "darf nicht";
  - "Ich will" is still not the future.
- **Context:** Hayk's priorities are work and classes, so use instructions from a teacher or a boss and a weekend report.
- **End task:** tell a colleague about your weekend, and ask a teacher to repeat and explain. The repeat/explain part reviews u1-06; "Könnten Sie" is the new step.
