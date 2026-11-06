# Light daily mode and four Duolingo-style features: design

**As built (2026-11-06):** see DECISIONS.md #77-#81. The main change from this design: Mistakes replay saves redos as ordinary one-item attempts (`m-<source>-i<n>`) instead of a new table (#81).

Date: 2026-11-06.
- **Inputs:**
  - Hayk's interview answers (Q1-Q30 in the 2026-11-06 chat);
  - the research in `_knowledge/2026-11-06_duolingo-research.md`.
- **Instructions:** Hayk then said: no more questions; rebuilding existing parts is fine; commit regularly. Everything marked *(Claude's call)* below was decided without Hayk, and can be changed.

## 1. Intent

Hayk's own words:

> "What i like the most is easy entry point i can open daily and do some stuff in a quicker lighter way compared to concentrated stuff now i want features for that, i definitely like the feature with list of words i need to repeat and i wanna more stuff that will help build vocabulary"

- **Main thing:** a light daily mode, opened on the Android phone for one calmer 10-15 minute session (Q25), that builds vocabulary. The concentrated work (lessons, tests, writing) stays, for when Hayk has focus.
- **Also picked:**
  - Mistakes replay (F2);
  - an Ask-Claude button (F10);
  - speaking on listen-and-repeat (F6);
  - one story per unit (F7).
- **Success:** Hayk opens the daily mode most days, the number of known words grows, and the mode points onward to the next lesson instead of replacing lessons.

## 2. Goals, non-goals, anti-goals

**Goals:**
- the daily mix;
- match pairs;
- listen and pick;
- a Words list with practice sets;
- topic word sets;
- pre-learning the next lesson's words;
- Mistakes replay;
- the Ask-Claude button;
- speaking practice;
- stories.

**Non-goals:**
- **Not picked on 2026-11-06:**
  - XP, leagues, gems, hearts or energy;
  - push reminders;
  - a daily goal and streak freeze (F1);
  - session polish (F3);
  - tiles-before-typing (F5).
- **Not part of this design:**
  - adaptive difficulty;
  - AI calls from the app;
  - the Duolingo HLR dataset (Q3: "not now").

**Anti-goals** (failures even if the feature works):
- **Easy answers moving the schedule:** easy recognition games change the FSRS schedule and inflate "known" words.
- **Crowding out the course:** the daily mode replaces the lessons, so Hayk never moves through the course.
- **Punishing mistakes:** anything that limits practice or penalizes errors.
- **Friction before starting:** a session that needs decisions before it starts, or feels longer than about 15 minutes.
- **Recognizer errors as Hayk's errors:** speech recognition marking Hayk wrong because the recognizer misheard.

## 3. Constraints

- **Phone first:** Android Chrome, then PC Chrome or Edge. Layouts must work at 360 px.
- **Existing stack:**
  - Vite, React and TS;
  - zod schemas double as the types;
  - an outbox synced to the Neon Functions API;
  - Neon Free plan only;
  - the API's schemas mirror the app's (#32);
  - idempotent ids (#36).
- **Practice never moves the schedule:** practice never changes FSRS. It is logged with `practice: true` (#25) and counts as study activity.
- **Shared daily cap:** the new-word cap (`newPerDay`, default 10) is shared by everything that introduces words in the normal flow.
- **Every learner gets the features:** Hayk, Anahit and Armen all use the app. Tests never touch their data.
- **Content rules:**
  - CLAUDE.md "How to teach";
  - `check-content` and the glossary must pass;
  - German stays at the learner's level.
- **No silent fallbacks:** every failure is shown (`reportError`).
- **Public repo:** no personal data in the content.
- **Pushing deploys live** for all three learners. Backend changes (a migration, an API deploy) are critical changes and need Hayk's OK before they are applied.

## 4. The parts

### 4.1 The daily mix (Home)

**Hayk decided:**
- **Entry (Q28):** a big Start button runs a ready-made mix, with the single activities listed below it.
- **Activities (Q26):** match pairs, listen and pick, the Words list sets, topic sets.
- **New words (Q27):** by default from the next lesson; from a topic set when one is chosen.

***(Claude's call):***
- **Placement:** the mix sits at the top of Home.
- **The steps**, in this order, about 12 minutes. A step with nothing to do is skipped.
  1. **Warm-up:** match pairs, 2 rounds of known words.
  2. **Due word reviews:** at most 15 inside the mix; any others stay available on the Words page.
  3. **New words:** up to 5. They come from the active topic set if there is one, otherwise from the next lesson. They are introduced the normal way, within the shared daily cap.
  4. **Listen and pick:** 6 items, from today's and recent words.
  5. **Mistakes:** up to 5 due items (4.6), once that part is built.
  6. **End screen:** time, words practised, new words, and a link to the next lesson.
- **Stopping:** you can leave at any step.
- **Pre-learning:** introducing next-lesson or topic words before their lesson is opened revisits DECISIONS #26, so it gets its own entry.

### 4.2 Match pairs

***(Claude's call):***
- **The round:** 5 German words (nouns with their article) and their 5 meanings, shuffled into two columns.
  - Tap one on each side. A right pair is locked; a wrong pair flashes, with no other penalty.
  - Tapping a German word reads it aloud.
  - A timer counts up.
- **Words:** introduced words only, preferring recent and weak ones.
- **Logging:** practice. Each pair is logged as a recognition practice event, right on the first try or not.

### 4.3 Listen and pick

***(Claude's call):***
- **The item:** the browser voice reads a word, with replay and slow buttons. You tap one of 4 options.
  - The options alternate between English meanings and German spellings.
  - Distractors come from the same part of speech, and from the same topic where possible.
- **Logging:** practice, as listening events.

### 4.4 Words list (Q24, Q29)

- Rebuilt from the existing "All words" tab.
- **Practice sets** (Hayk picked all four):
  - by topic;
  - learned recently (introduced in the last 7 days);
  - words you tick;
  - weakest first (most lapses and the lowest % correct).
- **How a set is practised** *(Claude's call)*:
  - Up to 20 words per run.
  - You choose the game: match pairs, listen and pick, or the existing typed and flip review in practice mode.

### 4.5 Topic word sets (Q30)

- **The first four:** Food and shopping; Work and office; Health and doctor; City and transport.
- ***(Claude's call):***
  - **Where they live:** `content/sets.json`, with an id, title, description and an explicit, ordered list of word ids, checked by `check-content`.
  - **The words:**
    - mostly existing cards from Units 1-7;
    - plus new cards where a topic needs more, A1 first.
  - **The example sentences:**
    - New cards get examples using Unit 0-2 grammar.
    - Existing later-unit cards keep their examples, which always show a translation.
  - **Activating a set:**
    - **Turning it on:** Hayk activates one set, which becomes the source of new words in the mix.
    - **Practising it:** once its words are introduced, the set is practised like any Words list set.

### 4.6 Mistakes replay (F2)

**Hayk decided:**
- **What comes back (Q6):** any wrong item: test items, lesson exercise items, and writing that Claude marked wrong.
- **When (Q7):** it comes back after about a day. It is fixed once answered right on 2 different days; a wrong answer restarts the count.
- **History (Q12):** only mistakes made from the launch on.
- **Reread link (Q10):** each item links to the exact lesson section that teaches it. Every course test item gets a `teaches` reference, which `check-content` requires.

***(Claude's call):***
- **Session:** up to 10 items in the original item type (5 inside the mix).
- **Write items:**
  1. The prompt is shown again and Hayk rewrites the answer.
  2. Claude's correction is shown.
  3. Hayk marks the answer right or wrong.
- **Item identity:** an item is the test or lesson id, plus the item index, plus a hash of the question. If the item's content has changed, the mistake is dropped with a visible note.
- **Storage:** redo answers need a new synced record type: a migration, API schemas and the outbox. Building and testing them is in scope; applying the migration and deploying the function wait for Hayk's OK.

### 4.7 Ask-Claude button (F10)

**Hayk decided:**
- **Placement (Q8):** on every answered item: test results, lesson exercises, mistakes.
- **Claude's reply (Q11):** explain right away, with the rule and one example. This goes into CLAUDE.md "How to teach" as an exception to hint-first.

***(Claude's call):***
- **What it copies:** plain text with the source id, the item index, the question, your answer, the expected answer and the status.
- **A failed copy** is shown as an error, with the text left visible to copy by hand.

### 4.8 Speaking on listen-and-repeat (F6)

**Hayk decided:**
- **Devices (Q14):** Android Chrome and PC Chrome or Edge.
- **Feedback (Q15):** both: what the recognizer heard, and your own recording.
- **Privacy (Q16):** browser recognition is fine.
- **Placement (Q17):** only the lessons' audio ("listen and repeat") blocks.
- **Strictness (Q18):** never a mistake.

***(Claude's call):***
- **Per line:**
  - a mic button: the heard text is shown word by word against the line, ignoring case and punctuation, and with number words equal to digits;
  - your recording, played after the German voice.
- **Recordings stay in memory** for the visit only. They are never uploaded or stored.
- **Without SpeechRecognition** (Firefox): record and compare only, with a note why.
- **Logging:** nothing is logged or synced.

### 4.9 Stories (F7)

**Hayk decided:**
- **Scenes (Q19):** standalone scenes.
- **Length (Q20):** 5-10 minutes, with questions inside.
- **Display (Q21):** the text is always shown, with play on each line.
- **Placement (Q22):** one per unit as its last lesson, from Unit 1.
- **Words (Q23):** 3-5 key new words become cards.

***(Claude's call):***
- **Format:** a new `story` lesson block. It holds speaker lines (de, en) with question items between them, using the existing item schema.
  - Translations appear on tap.
  - Answers are saved like lesson exercises, so wrong answers feed Mistakes replay.
  - The two speakers use two German voices when the device has two, otherwise one voice at two pitches.
- **Content:**
  - Unit 1's story comes first.
  - Units 2-7 follow in later sessions.
  - The course-unit skill gets a step for writing the story.

## 5. Build order *(Claude's call)*

1. The daily mix, match pairs, listen and pick, pre-learning.
2. The Words list sets, plus the four topic sets.
3. The Ask-Claude button.
4. Speaking.
5. Stories (Unit 1).
6. Mistakes replay. It is last because it needs the backend change.

Each step is committed on its own. Pushing (deploying live) waits for Hayk, because it changes the app for all three learners.
