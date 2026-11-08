# Extend a live lesson only at the end: results and stations are keyed by section index

**Symptom:** extending Elya's lessons, the writer agent put new sections (a full letter, teacher phrases, its exercise blocks) in the middle of `t-schule-briefe`, `t-schule-lehrerin` and `t-schule-krank`, about an hour after they went live. It noticed that the old final block went from `-ex2` to `-ex3`. The real problem was wider than that.

**Cause:** a saved lesson check finds its questions by section index, not by block id. `app/src/content/lessons.ts`:

```ts
if (result.lessonId !== undefined) {
  const block = lessons.find((l) => l.id === result.lessonId)?.sections[result.section ?? -1]
  return block?.type === 'exercise' ? block.items : undefined
}
```

`ResultView` then matches each answer to `items[ri.index]` and only checks that the item type is the same. Any section inserted before a saved block shifts it. The old result then shows the questions of another block: silently when the item types line up, or with no questions at all when the index lands on a non-exercise block. Finished stations are saved as section ranges, so changing the cuts moves those too.

**What is safe, and what isn't:**
- **Safe:** new sections after the last one; new items at the end of an exercise block (an old result has fewer items, matched by index); rows added to a table; lines added to `examples` or `audio`; a new station cut that only splits off the new part.
- **Not safe:** a section inserted or removed in the middle; reordered sections; changed cuts for existing stations; items inserted in the middle of a block.

**What was done:** each lesson was rebuilt as its committed sections, in committed order, plus the new part at the end. A script checked that every committed section still sits at its committed index. The old station cuts were kept: krank [7, 11], lehrerin [6] became [6, 13], and briefe was pinned to its automatic [7, 13]. The file was rebuilt from the committed text, so the diff only adds lines: 241 added, 4 removed. Elya's progress was not looked at. Append-only is safe whatever she has done.

**Rule:** written into content/README.md under Lessons ("Changing a lesson someone may have started: append only").
