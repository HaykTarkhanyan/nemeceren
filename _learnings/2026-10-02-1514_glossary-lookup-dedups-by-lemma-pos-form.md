# The popup lookup keeps one entry per lemma, part of speech and form

**Symptom:** a curated `geht` entry with two entries, "gehen: to go" (note "Wie geht es dir?") and "gehen: to work, to be possible" (note "Das geht."), showed only the first line in the popup. The second sense never appeared.

**Cause:** `app/src/glossary/lookup.ts` removes duplicates with this key:

```ts
const key = `${e.lemma}|${e.pos}|${e.form ?? ''}`
if (seen.has(key)) return false
```

Both `geht` entries had lemma `gehen`, pos `verb` and form `er/sie/es form, present`, so the second was dropped.

**Consequences:**
- Put two senses of the same form in one entry with two glosses: `"gloss": ["to go", "to work, to be possible"]`, with one combined note.
- Entries that differ in lemma, part of speech or form do show separately. That's how separable verbs work: `stehe` has an `aufstehen` entry and a `stehen` entry.
- The same rule is useful the other way: giving a capitalized key the same lemma, pos and form as the lowercase key (e.g. `Wollen` and `wollen`) merges them into one line at a sentence start.
- Recorded in the course-unit skill, step 3.
