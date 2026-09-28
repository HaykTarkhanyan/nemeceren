// Glossary lookup shared by the popups and check-content.
// Sources, strongest first: content/glossary.json (Claude's curated entries and ignore list),
// then content/glossary.generated.json (from kaikki.org). A curated key replaces the
// generated key completely.
import { wordTokens } from '../content/german.ts'
import type { GermanField } from '../content/german.ts'
import type { CuratedGlossary, GeneratedGlossary, GlossEntry } from '../content/schema.ts'

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
 *   Both are candidates; if any candidate is a learner word (has a level), the others are
 *   dropped ("Ich" is "ich", not "das Ich", ego), and lower levels come first.
 */
export function lookup(g: Glossary, word: string, sentenceStart = false): Lookup {
  if (g.ignore.has(word)) return { kind: 'ignored' }
  const lower = lowerFirst(word)
  const exact = entriesFor(g, word)
  const lowered = lower !== word ? entriesFor(g, lower) : []
  let all = sentenceStart ? [...lowered, ...exact] : exact.length > 0 ? exact : lowered
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
