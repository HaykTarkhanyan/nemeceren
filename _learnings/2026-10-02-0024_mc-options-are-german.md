# Multiple-choice options are always treated as German

**Symptom:** after installing the two song lessons (2026-09-30), `npm run glossary` reported 17 "German" words with no glossary entry that were plain English: strange, odd, wonderful, lonely, knocked, over, from, ten, Because, is, masculine, the, sun, It's, a, mistake, song. All came from `mc` items whose options were English ("strange, odd", "out (knocked out, over)", "Because Stern is masculine: der Stern").

**Cause:** in `app/src/content/german.ts` (`itemGermanFields`), `questionLang: "en"` only marks the question as English. The `options` of `mc` and `listen_mc` are always German fields: they get word popups and must be covered by the glossary. There is no `optionsLang`.

**Fix used:** rewrite the question so that the options are German.
- "What does 'wunderlich' mean?" (English options) became "Which word means 'strange, odd'?" with the options wunderlich / wunderbar / einsam.
- "What does 'aus' mean?" became "Which sentence uses 'aus' the same way?" with the options "Das Licht ist aus." / "Ich komme aus Armenien." / "Sie ist aus Berlin."

Both are better exercises anyway: Hayk reads German, not English.

**Consequences:** when writing tests or lesson exercises, keep mc options German. An English answer belongs in a `translate` (de-en) item, or in the question.
