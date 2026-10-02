# A word card's `en` is the prompt in English-to-German review, so German in it gives the answer away

**Symptom:** the Unit 3 reviewer found 17 cards whose `en` contained their own German answer. For example, `halb` had "half; halb drei = half past two", `nacht` had "night (in der Nacht = at night)", and every separable verb had "(separable: ich stehe ... auf)". In English-to-German review, Hayk would see the answer in the prompt. The `nacht` prompt even nudged towards "der Nacht" instead of "die Nacht".

**Cause:** `app/src/pages/WordsPage.tsx:612` shows `word.en` as the big prompt (`<p className="word-big">{word.en}</p>`). The usage notes had been written as if `en` were only a gloss.

**Consequences:**
- Keep `en` in English. Usage goes in the card's `example`, or in a curated glossary note.
- Irregular forms in brackets are the accepted exception, as on the older cards ("to speak (du sprichst)", "to meet (er trifft)").
- Two cards shouldn't have prompts that invite each other's answer. Units 4-5 had zahlen/bezahlen both as "to pay", toll/super both as "great", and beginnen/anfangen. Add a short distinction to one of them ("to pay (for something)", "to begin (not separable)").
- The generated popups copy the card's `en`, so rerun `npm run glossary` after editing it.
