// Skipped words ("Skip word", DECISIONS.md #123): a word the learner chose not to study stays out of every
// review, new-word pick, practice list and game. The list lives in the progress view (useProgress().skipped)
// and syncs through Neon like the rest of the progress; skipWord in lib/storage.ts changes it.

/** The words without the skipped ones, in the same order. */
export function withoutSkipped<W extends { id: string }>(words: readonly W[], skipped: ReadonlySet<string>): W[] {
  return words.filter((w) => !skipped.has(w.id))
}

/** The same for a list of word ids. */
export function idsWithoutSkipped(ids: readonly string[], skipped: ReadonlySet<string>): string[] {
  return ids.filter((id) => !skipped.has(id))
}
