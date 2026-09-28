// Picks the entries a beginner most likely means, using two learner word lists:
//   tier 0: the lemma is in content/words.json (Claude's own word bank)
//   tier 1: the lemma, with a matching part of speech, is in the DWDS Goethe A1-B1 lists
//           (reference/dwds_goethe_{A1,A2,B1}.csv)
//   tier 2: neither
// Only entries of the best tier present are kept. Example: "einen" is the accusative of the
// article "ein" (A1), not the rare verb "einen" (to unite).
import type { GlossEntry, Level, Pos } from '../content/schema.ts'

/** DWDS "Wortart" -> the parts of speech it can appear as in the glossary. */
export function posFromDwds(wortart: string): Pos[] | null {
  const w = wortart.trim()
  if (w === 'Präposition + Artikel') return ['contraction']
  if (w === 'Substantiv') return ['noun']
  if (w === 'Verb') return ['verb']
  if (w === 'Adjektiv') return ['adjective']
  if (w === 'Adverb') return ['adverb']
  if (w === 'Präposition') return ['preposition']
  if (w === 'Konjunktion') return ['conjunction']
  if (w === 'Interjektion') return ['interjection']
  if (w === 'Partikel') return ['particle', 'adverb']
  if (w === 'Eigenname') return ['name']
  if (w.endsWith('Artikel')) return ['article', 'determiner']
  if (w.endsWith('pronomen')) return ['pronoun', 'determiner']
  if (w.endsWith('zahlwort')) return ['numeral', 'adjective']
  return null // unknown kind: any part of speech matches
}

export interface LevelRow {
  level: Level
  pos: Pos[] | null
}

export interface LearnerLists {
  /** Word-bank lemmas (article removed). noun = the bank entry has an article. */
  bank: Map<string, { level: Level; noun: boolean }>
  /** DWDS rows per lemma. */
  dwds: Map<string, LevelRow[]>
}

const LEVEL_ORDER: Level[] = ['A1', 'A2', 'B1', 'B2']

function lowest(levels: Level[]): Level {
  return [...levels].sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))[0]
}

export function tierOf(e: GlossEntry, lists: LearnerLists): { tier: 0 | 1 | 2; level?: Level } {
  const b = lists.bank.get(e.lemma)
  if (b && (!b.noun || e.pos === 'noun')) return { tier: 0, level: b.level }
  const rows = (lists.dwds.get(e.lemma) ?? []).filter((r) => r.pos === null || r.pos.includes(e.pos))
  if (rows.length > 0) return { tier: 1, level: lowest(rows.map((r) => r.level)) }
  return { tier: 2 }
}

/** Keeps the entries of the best tier (in their original order), with their level, at most 3. */
export function pickRelevant(entries: GlossEntry[], lists: LearnerLists): GlossEntry[] {
  const ranked = entries.map((e) => ({ e, ...tierOf(e, lists) }))
  const best = Math.min(...ranked.map((r) => r.tier))
  return ranked
    .filter((r) => r.tier === best)
    .map((r) => (r.level ? { ...r.e, level: r.level } : r.e))
    .slice(0, 3)
}

/** Parse one of the DWDS CSVs ("Lemma","URL","Wortart",...; every field quoted). */
export function parseDwdsCsv(text: string, level: Level, source: string): { lemma: string; row: LevelRow }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const header = splitCsvLine(lines[0], source, 1)
  const iLemma = header.indexOf('Lemma')
  const iWortart = header.indexOf('Wortart')
  if (iLemma < 0 || iWortart < 0) throw new Error(`${source}: expected columns "Lemma" and "Wortart", got ${header.join(', ')}`)
  return lines.slice(1).map((line, i) => {
    const f = splitCsvLine(line, source, i + 2)
    return { lemma: f[iLemma], row: { level, pos: posFromDwds(f[iWortart]) } }
  })
}

function splitCsvLine(line: string, source: string, lineNo: number): string[] {
  const out: string[] = []
  const re = /"((?:[^"]|"")*)"(,|$)/y
  let at = 0
  while (at < line.length) {
    re.lastIndex = at
    const m = re.exec(line)
    if (!m) throw new Error(`${source} line ${lineNo}: cannot parse CSV near column ${at + 1}: ${line}`)
    out.push(m[1].replace(/""/g, '"'))
    at = re.lastIndex
    if (m[2] === '') break
  }
  return out
}
