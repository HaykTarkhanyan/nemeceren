# Deferred

Topics cut from current work so they don't get lost.

- **Phone sync for the learning platform** (Neon Postgres or GitHub API commits). Deferred 2026-09-28: phone use is occasional and Hayk is fine with phone results not being saved. See DECISIONS.md #4.
- **der/die/das and verb conjugation drills** fed from `reference/goethe_wortliste.tsv` and `reference/german_nouns.csv`. Not picked for platform v1 (2026-09-28).
- (Done 2026-10-02 with Unit 6: the curated `den`, `dem`, `mir`, `dir`, `ihm`, `ihr`, `zum`, `im` ... popups now include their dative readings.)
- **Unit 1 content:**
  - (Done 2026-10-02: Unit 3 re-added der Termin, morgen, leider and pünktlich with their old ids.)
  - The sample test `a1-01-vorstellen-termine` (Unit 1) mixes in Unit 3 material, and its gap hint gives the answer away. Rework or replace it when writing Unit 1.
  - Review the sample lesson `u1-01-sich-vorstellen` (written by the build agent), including its Russian/Armenian lines.
- **Pronunciation feedback:** Claude can't hear Hayk. Option: Hayk records on the desktop, and a local phoneme model (`facebook/wav2vec2-xlsr-53-espeak-cv-ft`) is compared against DWDS IPA. Whisper hides mispronunciations. See `_knowledge/2026-09-28_llm-tutoring-and-materials.md`. Heavy on this laptop: ask before running.
- **Platform follow-ups from the v1 build (2026-09-29):**
  - Bake PC results (with Claude's reviews) into the Pages build so the phone can read feedback.
  - Test on a real phone (voices, umlaut buttons on a touch keyboard).
  - Check dark mode.
  - Take a test in phone mode.
  - Investigate a one-off `npm run build` crash (exit 134, native stack) if it happens again.
- **Prune the popup stopgap entries.** 38 common words got hand-written glossary entries on 2026-09-29 as a stopgap for two popup bugs, which are now fixed in code (DECISIONS.md #46). Some may now be redundant; others fix misleading generated glosses and must stay. Review them one by one.
- **Node 20 is past end of life (April 2026):** move the PC and CI to Node 22/24, then Vitest 5 (DECISIONS.md #11). Hayk chose to stay on 20 for now (2026-09-29). This also blocks `neon skills install/update` (needs Node 22.20+); the workaround is a manual download from Neon's skill registry.
- **Goethe A2/B1 Modellsaetze**: download when Hayk works at those levels (URLs in `_knowledge/2026-09-28_llm-tutoring-and-materials.md`).
- **Duolingo-style features not picked (2026-11-06)**, research in `_knowledge/2026-11-06_duolingo-research.md` section 6:
  - F1: a daily goal, an earned streak freeze and milestones;
  - F3: session polish (progress bar, sounds, end screen) outside the daily mix;
  - F5: tiles first, typing later;
  - F8: XP and a league or shared streaks with Anahit and Armen (needs their consent and an API scope change);
  - F9: push reminders.
- **Duolingo HLR learning traces** (Harvard Dataverse doi 10.7910/DVN/N8XJME, 361 MB): "not now" (Hayk, 2026-11-06). The idea is to find which German words English speakers forget fastest, and give those cards extra examples. Ask before downloading.
- **Mistakes replay: exact reread sections for test items** (Hayk's Q10 answer, 2026-11-06). Today a returning test item links to the lesson the test comes after, and an exercise item to its own lesson. The plan:
  - add an optional `teaches` field (`<lesson id>#<section id>`) to test items;
  - tag all 311 test items, adding section ids where the teaching section has none;
  - then make check-content require it on course tests.
  - Not done yet: careful content work, best as its own session or one agent with a review.

- **Path Home follow-ups (minors from the final review, 2026-11-07):**
  - Undo on a station of a lesson finished before the path (`doneAt`, no events) clears the whole lesson's stations: hide "Mark as not done" there, or ask first.
  - Redoing a station rewrites the lesson's `doneAt` date (`finishStation` marks done again): only mark done when `doneAt` is null.
  - Phone performance: `computeGoal` runs per progress change in GoalToast and Home; DailyCard recomputes on every sheet open; LessonsPage rebuilds `courseStations` (reuse `STATIONS`, memo DailyCard and PathLines).
  - Contrast: white on the U3 orange `#de7a12` is about 3.0:1; darken it a little or per theme.
  - No header tab is active on `#/line`.
