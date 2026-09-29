// Glossary lookup shared by the popups and check-content.
// Sources, strongest first: content/glossary.json (Claude's curated entries and ignore list),
// then content/glossary.generated.json (from kaikki.org). A curated key replaces the
// generated key completely.
import { wordTokens } from '../content/german.ts'
import type { GermanField } from '../content/german.ts'
import type { CuratedGlossary, GeneratedGlossary, GlossEntry, Pos } from '../content/schema.ts'

export interface Glossary {
  curated: Record<string, GlossEntry[]>
  generated: Record<string, GlossEntry[]>
  ignore: Set<string>
}

export function makeGlossary(generated: GeneratedGlossary, curated: CuratedGlossary): Glossary {
  return { curated: curated.entries, generated: generated.entries, ignore: new Set(curated.ignore) }
}

export type Lookup = { kind: 'ignored' } | { kind: 'found'; entries: GlossEntry[] } | { kind: 'missing' }

function entriesFor(g: Glossary, key: string): GlossEntry[] {
  return g.curated[key] ?? g.generated[key] ?? []
}

function lowerFirst(word: string): string {
  return word.charAt(0).toLowerCase() + word.slice(1)
}

const LEVEL_RANK: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3 }

/**
 * Look up a word as it appears in a sentence.
 * - In the middle of a sentence a capitalized word is a noun or a name, so only its exact
 *   entries count, with the lowercase form as a last resort.
 * - At the start of a sentence it may also be the lowercase word ("Ich", "Wann", "Morgen").
 *   Both are candidates. Curated entries come first, the capitalized key before the lowercase
 *   one (Claude wrote it for this spelling: "Es geht."), then the generated lowercase and
 *   capitalized entries. If any candidate is a learner word (has a level), the others are
 *   dropped ("Ich" is "ich", not "das Ich", ego), and lower levels come first. Of two entries
 *   for the same reading (lemma, part of speech, form) the first one stays, so at the same
 *   level a curated entry and its note beat a generated duplicate.
 */
export function lookup(g: Glossary, word: string, sentenceStart = false): Lookup {
  if (g.ignore.has(word)) return { kind: 'ignored' }
  const lower = lowerFirst(word)
  const exact = entriesFor(g, word)
  const lowered = lower !== word ? entriesFor(g, lower) : []
  let all: GlossEntry[]
  if (!sentenceStart) all = exact.length > 0 ? exact : lowered
  // A curated key replaces its generated key (entriesFor), so this puts curated entries first.
  else all = g.curated[word] ? [...exact, ...lowered] : [...lowered, ...exact]
  if (sentenceStart && all.some((e) => e.level)) {
    all = all.filter((e) => e.level).sort((a, b) => LEVEL_RANK[a.level!] - LEVEL_RANK[b.level!])
  }
  const seen = new Set<string>()
  const entries = all.filter((e) => {
    const key = `${e.lemma}|${e.pos}|${e.form ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return entries.length > 0 ? { kind: 'found', entries } : { kind: 'missing' }
}

/** One popup line: an entry, plus the parts of speech and notes of entries merged into it. */
export interface GlossLine {
  entry: GlossEntry
  pos: Pos[]
  notes: string[]
}

/**
 * Merge entries that differ only in part of speech: same lemma, form and gloss list. "aus" as
 * adverb, adjective and preposition, each "from (a country or city)", becomes one line. Every
 * note is kept, and a noun's article and plural are kept even if the noun comes second.
 */
export function mergeSameGloss(entries: GlossEntry[]): GlossLine[] {
  const lines = new Map<string, GlossLine>()
  for (const e of entries) {
    const key = JSON.stringify([e.lemma, e.form ?? '', e.gloss])
    const line = lines.get(key)
    if (!line) {
      lines.set(key, { entry: e, pos: [e.pos], notes: e.note ? [e.note] : [] })
      continue
    }
    if (!line.pos.includes(e.pos)) line.pos.push(e.pos)
    if (e.note && !line.notes.includes(e.note)) line.notes.push(e.note)
    if (e.article && !line.entry.article) line.entry = { ...line.entry, article: e.article, plural: e.plural }
  }
  return [...lines.values()]
}

/** Every German word in the fields that has no entry and is not ignored, with its first location. */
export function glossaryGaps(fields: GermanField[], g: Glossary): { word: string; where: string }[] {
  const gaps = new Map<string, string>()
  for (const f of fields) {
    for (const t of wordTokens(f.text)) {
      if (!gaps.has(t.word) && lookup(g, t.word, t.sentenceStart).kind === 'missing') gaps.set(t.word, f.where)
    }
  }
  return [...gaps].map(([word, where]) => ({ word, where }))
}
