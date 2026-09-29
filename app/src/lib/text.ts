// Answer comparison with "near-miss" labels. A near miss is still wrong, but labelled so
// Claude and Hayk can see the kind of slip:
//   case             - only capitalization differs (German nouns are capitalized)
//   umlaut           - umlaut/ß written as ae/oe/ue/ss, or dots left off (a for ä)
//   article_missing  - noun typed without der/die/das
//   article_wrong    - noun typed with the wrong article
import type { NearMissKind } from '../content/schema.ts'

export function normalizeSpaces(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

function foldSpelled(s: string): string {
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss').replace(/ẞ/g, 'SS')
}

function foldBare(s: string): string {
  return s
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/Ä/g, 'A').replace(/Ö/g, 'O').replace(/Ü/g, 'U')
    .replace(/ß/g, 'ss').replace(/ẞ/g, 'SS')
}

function umlautEqual(a: string, b: string): boolean {
  return foldSpelled(a) === foldSpelled(b) || foldBare(a) === foldBare(b)
}

export interface Comparison {
  correct: boolean
  /** Labels for a wrong answer that was close. null when correct or not close. */
  nearMiss: NearMissKind[] | null
}

/** Compare one typed answer with one expected answer. Whitespace is trimmed and collapsed. */
export function compareText(typed: string, expected: string, caseSensitive = true): Comparison {
  const t = normalizeSpaces(typed)
  const e = normalizeSpaces(expected)
  if (t === e) return { correct: true, nearMiss: null }
  const caseEqual = t.toLowerCase() === e.toLowerCase()
  if (caseEqual) return caseSensitive ? { correct: false, nearMiss: ['case'] } : { correct: true, nearMiss: null }
  if (umlautEqual(t, e)) return { correct: false, nearMiss: ['umlaut'] }
  if (umlautEqual(t.toLowerCase(), e.toLowerCase())) {
    return { correct: false, nearMiss: caseSensitive ? ['case', 'umlaut'] : ['umlaut'] }
  }
  return { correct: false, nearMiss: null }
}

export interface Match extends Comparison {
  /** The accepted answer that matched or came closest. */
  closest: string
}

/** Compare against several accepted answers: any exact match wins, otherwise the first near miss. */
export function matchAny(typed: string, accepted: string[], caseSensitive = true): Match {
  let near: Match | null = null
  for (const a of accepted) {
    const c = compareText(typed, a, caseSensitive)
    if (c.correct) return { ...c, closest: a }
    if (c.nearMiss && !near) near = { ...c, closest: a }
  }
  return near ?? { correct: false, nearMiss: null, closest: accepted[0] }
}

const ARTICLE = /^(der|die|das)\s+(.*)$/i

/**
 * For word review: punctuation (, . ! ? ; : and quotes) becomes a space, and every apostrophe
 * a phone keyboard may type (’ ‘ ` ´) becomes '. So "Noch einmal bitte" matches "Noch einmal, bitte".
 */
export function dropPunctuation(s: string): string {
  return s.replace(/[’‘`´]/g, "'").replace(/[,.!?;:"„“”«»‚‹›]/g, ' ')
}

/**
 * Check a typed German word against a word-bank entry. Nouns must include the right article:
 * "Termin" for "der Termin" is wrong (article_missing), "die Termin" is wrong (article_wrong).
 * The article's capitalization does not matter ("Der Termin" is fine), the noun's does.
 * Punctuation is ignored (dropPunctuation); capitals and umlauts are not.
 */
export function checkWord(typedRaw: string, expectedRaw: string): Comparison {
  const typed = dropPunctuation(typedRaw)
  const expectedDe = dropPunctuation(expectedRaw)
  const exp = ARTICLE.exec(normalizeSpaces(expectedDe))
  if (!exp) return compareText(typed, expectedDe)
  const typedNorm = normalizeSpaces(typed)
  const got = ARTICLE.exec(typedNorm)
  const noun = compareText(got ? got[2] : typedNorm, exp[2])
  const nounClose = noun.correct || noun.nearMiss !== null
  if (!got) {
    return { correct: false, nearMiss: nounClose ? ['article_missing', ...(noun.nearMiss ?? [])] : null }
  }
  if (got[1].toLowerCase() !== exp[1].toLowerCase()) {
    return { correct: false, nearMiss: nounClose ? ['article_wrong', ...(noun.nearMiss ?? [])] : null }
  }
  return noun
}

export function countWords(s: string): number {
  const t = s.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}
