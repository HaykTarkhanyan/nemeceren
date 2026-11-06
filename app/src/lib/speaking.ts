// Speaking practice on the lessons' "listen and repeat" lines (DECISIONS.md #79), as pure
// functions: compare what the browser's speech recognition heard with the line, word by word.
// It never counts as a mistake: recognition mishears, especially a beginner's accent.

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn']
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig']

/** 0-100 as one German word ("21" -> "einundzwanzig"); null for anything else. */
export function numberWord(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 100) return null
  if (n === 100) return 'hundert'
  if (n < 20) return ONES[n]
  const ones = n % 10
  const tens = TENS[Math.floor(n / 10)]
  return ones === 0 ? tens : `${ones === 1 ? 'ein' : ONES[ones]}und${tens}`
}

/** Words to compare: lower case, punctuation removed, numbers 0-100 written as words. */
export function spokenWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? (numberWord(Number(w)) ?? w) : w))
}

export interface SpokenWord {
  /** The word as written in the line (punctuation kept), for display. */
  text: string
  heard: boolean
}

/**
 * Each word of the line, marked heard or not, by the longest common subsequence of the line's
 * words and the heard words, so one missed word does not shift the rest. `score` is the share of
 * the line's words that were heard.
 */
export function compareSpoken(line: string, heard: string): { words: SpokenWord[]; score: number } {
  const display = line.split(/\s+/).filter(Boolean)
  // One compare key per displayed word (a word like "14:30" may give more than one; use them joined).
  const keys = display.map((d) => spokenWords(d).join(' '))
  const got = spokenWords(heard)
  const want = keys.flatMap((k, i) => (k === '' ? [] : k.split(' ').map((w) => ({ w, i }))))
  const n = want.length
  const m = got.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let a = n - 1; a >= 0; a--) {
    for (let b = m - 1; b >= 0; b--) {
      dp[a][b] = want[a].w === got[b] ? dp[a + 1][b + 1] + 1 : Math.max(dp[a + 1][b], dp[a][b + 1])
    }
  }
  const matched = new Set<number>()
  let a = 0
  let b = 0
  while (a < n && b < m) {
    if (want[a].w === got[b]) {
      matched.add(a)
      a++
      b++
    } else if (dp[a + 1][b] >= dp[a][b + 1]) a++
    else b++
  }
  // A displayed word counts as heard when all of its compare words were matched.
  const parts = new Map<number, { total: number; ok: number }>()
  want.forEach((x, idx) => {
    const p = parts.get(x.i) ?? { total: 0, ok: 0 }
    p.total += 1
    if (matched.has(idx)) p.ok += 1
    parts.set(x.i, p)
  })
  const words = display.map((text, i) => {
    const p = parts.get(i)
    return { text, heard: p === undefined ? true : p.ok === p.total }
  })
  const counted = display.filter((_, i) => parts.has(i)).length
  const ok = words.filter((w, i) => parts.has(i) && w.heard).length
  return { words, score: counted === 0 ? 1 : ok / counted }
}

/** Of several recognition alternatives, the one closest to the line (recognizers often rank a near miss first). */
export function bestAlternative(line: string, alternatives: string[]): string {
  if (alternatives.length === 0) throw new Error('No recognition alternatives to choose from')
  let best = alternatives[0]
  let bestScore = -1
  for (const alt of alternatives) {
    const s = compareSpoken(line, alt).score
    if (s > bestScore) {
      best = alt
      bestScore = s
    }
  }
  return best
}
