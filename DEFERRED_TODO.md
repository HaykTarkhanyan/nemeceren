# Deferred

Topics cut from current work so they don't get lost.

- **Phone sync for the learning platform** (Neon Postgres or GitHub API commits). Deferred 2026-09-28: phone use is occasional and Hayk is fine with phone results not being saved. See DECISIONS.md #4.
- **der/die/das and verb conjugation drills** fed from `reference/goethe_wortliste.tsv` and `reference/german_nouns.csv`. Not picked for platform v1 (2026-09-28).
- **Schritte audio in `books/schritte1_audio/`** (195 MB, untracked): downloaded before Hayk decided on 2026-09-28 not to use the Schritte books. Mostly useless without the book, so ask Hayk whether to delete it.
- **Platform follow-ups from the v1 build (2026-09-29):**
  - Bake PC results (with Claude's reviews) into the Pages build so the phone can read feedback.
  - Test on a real phone (voices, umlaut buttons on a touch keyboard).
  - Check dark mode.
  - Take a test in phone mode.
  - Investigate a one-off `npm run build` crash (exit 134, native stack) if it happens again.
- **Node 20 is past end of life (April 2026):** move the PC and CI to Node 22/24, then Vitest 5 (DECISIONS.md #11).
- **Goethe A2/B1 Modellsaetze**: download when Hayk works at those levels (URLs in `_knowledge/2026-09-28_llm-tutoring-and-materials.md`).
