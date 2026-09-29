# Deferred

Topics cut from current work so they don't get lost.

- **Phone sync for the learning platform** (Neon Postgres or GitHub API commits). Deferred 2026-09-28: phone use is occasional and Hayk is fine with phone results not being saved. See DECISIONS.md #4.
- **der/die/das and verb conjugation drills** fed from `reference/goethe_wortliste.tsv` and `reference/german_nouns.csv`. Not picked for platform v1 (2026-09-28).
- **Unit 1 and Unit 3 content:**
  - When writing Unit 3 ("Making plans"), re-add the appointment words taken out of `content/words.json` on 2026-09-29 so they wouldn't be introduced before Unit 0: der Termin, morgen, leider, pünktlich. Their old entries are in git history (commit 50ac3db). Die Uhr and die Zeit are back already, as Unit 2 cards (Unit 2 also uses "leider" in one sentence, with a popup but no card).
  - The sample test `a1-01-vorstellen-termine` (Unit 1) mixes in Unit 3 material, and its gap hint gives the answer away. Rework or replace it when writing Unit 1.
  - Review the sample lesson `u1-01-sich-vorstellen` (written by the build agent), including its Russian/Armenian lines.
- **Pronunciation feedback:** Claude can't hear Hayk. Option: Hayk records on the desktop, and a local phoneme model (`facebook/wav2vec2-xlsr-53-espeak-cv-ft`) is compared against DWDS IPA. Whisper hides mispronunciations. See `_knowledge/2026-09-28_llm-tutoring-and-materials.md`. Heavy on this laptop: ask before running.
- **Platform follow-ups from the v1 build (2026-09-29):**
  - Bake PC results (with Claude's reviews) into the Pages build so the phone can read feedback.
  - Test on a real phone (voices, umlaut buttons on a touch keyboard).
  - Check dark mode.
  - Take a test in phone mode.
  - Investigate a one-off `npm run build` crash (exit 134, native stack) if it happens again.
- **Node 20 is past end of life (April 2026):** move the PC and CI to Node 22/24, then Vitest 5 (DECISIONS.md #11). Hayk chose to stay on 20 for now (2026-09-29). This also blocks `neon skills install/update` (needs Node 22.20+); the workaround is a manual download from Neon's skill registry.
- **Goethe A2/B1 Modellsaetze**: download when Hayk works at those levels (URLs in `_knowledge/2026-09-28_llm-tutoring-and-materials.md`).
