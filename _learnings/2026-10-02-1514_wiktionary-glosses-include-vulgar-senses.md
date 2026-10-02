# The generated glossary keeps Wiktionary's vulgar senses

**Symptom:** while spot-checking Unit 5 popups, `gekocht` showed "cooked, fucked". A grep of the whole generated glossary found one more, which had been live since Unit 1: `französisch` (from "Französisch" in `u1-02-laender-sprachen`) showed "French; oral sex".

```
('französisch', False, 'French oral sex ')
('gekocht', True, 'cooked, fucked ')
2 hits
```

**Cause:** `npm run glossary` takes glosses from kaikki.org (Wiktionary data) and keeps the first few senses. Wiktionary lists slang and vulgar senses next to the plain ones, and the generator has no filter.

**Consequences:**
- After every glossary build, grep the glosses in `content/glossary.generated.json` for vulgar words (fuck, shit, sex, oral, ass, piss, bitch ...) and override every hit with a curated entry in `content/glossary.json`. Both 2026-10-02 hits are fixed that way.
- The same build also gave plainly wrong readings for common forms: `Viertel` with the article der, `siebte` as "to sieve", `achte` as "to respect", `ihn` as "them", `den` as "nominative", `darf` as "must", `Prost` as "a response to sneezing". So spot-check every pronoun, article, ordinal and modal form a unit uses, not just the new nouns.
- Both checks are in the course-unit skill, step 3.
