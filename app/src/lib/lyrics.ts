// How many words a song's full lyrics hold (DECISIONS.md #66): Hayk wants to know what learning a
// song by heart is worth. "Forms" counts distinct spellings, ignoring case (trinken, trinkt: 2);
// "dictionary words" merges forms with the same base form in the glossary (trinken, trinkt: 1).
import type { Lesson, LessonBlock } from '../content/schema.ts'
import { wordTokens } from '../content/german.ts'
import { lookup } from '../glossary/lookup.ts'
import type { Glossary } from '../glossary/lookup.ts'

type LyricsBlock = Extract<LessonBlock, { type: 'lyrics' }>

export interface WordCounts {
  lines: number
  /** All word tokens, with repeats. */
  words: number
  /** Distinct word forms, ignoring case. */
  forms: number
  /** Distinct base forms; null until the glossary is loaded. */
  lemmas: number | null
}

export function lyricsLines(block: LyricsBlock): string[] {
  return block.stanzas.flatMap((s) => s.lines.map((l) => l.de))
}

/** Every lyrics line of a lesson (a theme lesson may have one lyrics block, or none). */
export function lessonLyrics(lesson: Lesson): string[] {
  return lesson.sections.flatMap((b) => (b.type === 'lyrics' ? lyricsLines(b) : []))
}

export function wordCounts(lines: string[], glossary: Glossary | null): WordCounts {
  const tokens = lines.flatMap((l) => wordTokens(l))
  const forms = new Set(tokens.map((t) => t.word.toLowerCase()))
  let lemmas: number | null = null
  if (glossary) {
    const bases = new Set(
      tokens.map((t) => {
        const r = lookup(glossary, t.word, t.sentenceStart)
        return (r.kind === 'found' ? r.entries[0].lemma : t.word).toLowerCase()
      }),
    )
    lemmas = bases.size
  }
  return { lines: lines.length, words: tokens.length, forms: forms.size, lemmas }
}
