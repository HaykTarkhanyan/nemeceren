// A typed answer lined up letter by letter with the expected one, so a typo shows at a glance: the two
// lines are stacked and every column is the same letter, or a marked difference (Hayk, 2026-11-09,
// DECISIONS.md #103). Pure functions.

export interface CharCell {
  typed: string | null
  expected: string | null
  /** same letter; changed = a wrong letter; extra = typed but not expected; missing = expected but not typed. */
  op: 'same' | 'changed' | 'extra' | 'missing'
}

/** The alignment with the most letters in common (longest common subsequence); case counts, as in German. */
export function alignChars(typed: string, expected: string): CharCell[] {
  const a = [...typed]
  const b = [...expected]
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  }
  const raw: CharCell[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      raw.push({ typed: a[i], expected: b[j], op: 'same' })
      i++
      j++
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      raw.push({ typed: null, expected: b[j], op: 'missing' })
      j++
    } else {
      raw.push({ typed: a[i], expected: null, op: 'extra' })
      i++
    }
  }
  // One letter too many next to one too few is one wrong letter: show it in one column.
  const out: CharCell[] = []
  for (const c of raw) {
    const prev = out[out.length - 1]
    if (prev && ((prev.op === 'extra' && c.op === 'missing') || (prev.op === 'missing' && c.op === 'extra'))) {
      out[out.length - 1] = { typed: prev.typed ?? c.typed, expected: prev.expected ?? c.expected, op: 'changed' }
    } else {
      out.push(c)
    }
  }
  return out
}

/** Share of columns with the same letter: 1 = identical. Below about 0.5 they are different answers, and marking letters would be noise. */
export function similarity(cells: CharCell[]): number {
  if (cells.length === 0) return 1
  return cells.filter((c) => c.op === 'same').length / cells.length
}

/** At or above this similarity the letters are marked; below it the two answers are only stacked. */
export const MARK_LETTERS_FROM = 0.5

/** Of several accepted answers, the one closest to what was typed: the one to line it up with. */
export function closestAnswer(typed: string, accepted: string[]): string {
  if (accepted.length === 0) throw new Error('closestAnswer needs at least one accepted answer')
  return accepted.reduce((best, a) => (similarity(alignChars(typed, a)) > similarity(alignChars(typed, best)) ? a : best))
}
