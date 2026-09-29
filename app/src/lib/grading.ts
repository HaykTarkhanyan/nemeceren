// Auto-grading for every exercise type, plus helpers to build and score result files.
import { GAP_MARKER, orderWords } from '../content/schema.ts'
import type { DiffOp, GapResult, Item, ItemStatus, NearMissKind, Result, ResultItem } from '../content/schema.ts'
import { compareText, matchAny, normalizeSpaces } from './text.ts'

/**
 * What Hayk answered, by item type:
 *   mc, listen_mc:               the chosen option text, or null
 *   gap:                         one string per gap
 *   order:                       the tiles in the order Hayk placed them
 *   translate, write, dictation: the typed text
 */
export type AnswerValue = string | string[] | null

export interface Grade {
  status: ItemStatus
  nearMiss: NearMissKind[] | null
  expected: string | null
  gaps?: GapResult[]
  diff?: DiffOp[]
}

export function fillGaps(text: string, fills: string[]): string {
  let i = 0
  return text.replace(GAP_MARKER, () => fills[i++] ?? '___')
}

export function isBlank(a: AnswerValue): boolean {
  if (a === null) return true
  if (typeof a === 'string') return a.trim() === ''
  return a.length === 0 || a.every((s) => s.trim() === '')
}

function unionKinds(lists: (NearMissKind[] | null | undefined)[]): NearMissKind[] | null {
  const set = new Set<NearMissKind>()
  for (const l of lists) l?.forEach((k) => set.add(k))
  return set.size > 0 ? [...set] : null
}

// Punctuation that is ignored at the start and end of each dictation word.
const EDGE_PUNCT = /^[.,!?;:"'()\u00AB\u00BB\u201E\u201C\u201D\u201A\u2018\u2019\u2013\u2014-]+|[.,!?;:"'()\u00AB\u00BB\u201E\u201C\u201D\u201A\u2018\u2019\u2013\u2014-]+$/g

interface Token {
  raw: string
  key: string
}

function tokens(s: string): Token[] {
  return normalizeSpaces(s)
    .split(' ')
    .map((raw) => ({ raw, key: raw.replace(EDGE_PUNCT, '') }))
    .filter((t) => t.key !== '')
}

/**
 * Word-by-word diff for dictation. Words are compared case-sensitively with surrounding
 * punctuation ignored. Unmatched words between two matches are paired up as "wrong";
 * leftovers are "missing" (expected but not typed) or "extra" (typed but not expected).
 */
export function diffWords(expected: string, typed: string): DiffOp[] {
  const exp = tokens(expected)
  const got = tokens(typed)
  const n = exp.length
  const m = got.length
  // lcs[i][j] = length of the longest common subsequence of exp[i..] and got[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = exp[i].key === got[j].key ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const ops: DiffOp[] = []
  let missing: Token[] = []
  let extra: Token[] = []
  const flush = () => {
    const pairs = Math.min(missing.length, extra.length)
    for (let k = 0; k < pairs; k++) {
      const nearMiss = compareText(extra[k].key, missing[k].key).nearMiss
      ops.push({ op: 'wrong', expected: missing[k].raw, typed: extra[k].raw, ...(nearMiss ? { nearMiss } : {}) })
    }
    for (const t of missing.slice(pairs)) ops.push({ op: 'missing', expected: t.raw })
    for (const t of extra.slice(pairs)) ops.push({ op: 'extra', typed: t.raw })
    missing = []
    extra = []
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (exp[i].key === got[j].key && lcs[i][j] === lcs[i + 1][j + 1] + 1) {
      flush()
      ops.push({ op: 'ok', expected: exp[i].raw, typed: got[j].raw })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      missing.push(exp[i++])
    } else {
      extra.push(got[j++])
    }
  }
  while (i < n) missing.push(exp[i++])
  while (j < m) extra.push(got[j++])
  flush()
  return ops
}

function stripEndPunct(s: string): string {
  return s.replace(/[.!?]+$/, '')
}

export function gradeItem(item: Item, answer: AnswerValue): Grade {
  switch (item.type) {
    case 'mc':
    case 'listen_mc': {
      const choice = typeof answer === 'string' ? answer : null
      return { status: choice === item.answer ? 'correct' : 'wrong', nearMiss: null, expected: item.answer }
    }
    case 'gap': {
      const fills = Array.isArray(answer) ? answer : []
      const caseSensitive = item.caseSensitive ?? true
      const gaps: GapResult[] = item.answers.map((accepted, i) => {
        const typed = fills[i] ?? ''
        if (typed.trim() === '') return { answer: '', correct: false, nearMiss: null }
        const m = matchAny(typed, accepted, caseSensitive)
        return { answer: normalizeSpaces(typed), correct: m.correct, nearMiss: m.nearMiss }
      })
      return {
        status: gaps.every((g) => g.correct) ? 'correct' : 'wrong',
        nearMiss: unionKinds(gaps.map((g) => g.nearMiss)),
        expected: fillGaps(item.text, item.answers.map((a) => a[0])),
        gaps,
      }
    }
    case 'order': {
      const built = Array.isArray(answer) ? answer : []
      const key = built.join(' ').toLowerCase()
      const ok = built.length > 0 && item.answers.some((a) => orderWords(a).join(' ').toLowerCase() === key)
      return { status: ok ? 'correct' : 'wrong', nearMiss: null, expected: item.answers[0] }
    }
    case 'translate': {
      const text = typeof answer === 'string' ? answer : ''
      const expected = item.references?.[0] ?? null
      if (text.trim() === '') return { status: 'wrong', nearMiss: null, expected }
      const typedKey = stripEndPunct(normalizeSpaces(text))
      const exact = (item.references ?? []).some((r) => stripEndPunct(normalizeSpaces(r)) === typedKey)
      return { status: exact ? 'correct' : 'pending', nearMiss: null, expected }
    }
    case 'write': {
      const text = typeof answer === 'string' ? answer : ''
      return { status: text.trim() === '' ? 'wrong' : 'pending', nearMiss: null, expected: null }
    }
    case 'dictation': {
      const text = typeof answer === 'string' ? answer : ''
      const diff = diffWords(item.text, text)
      const ok = text.trim() !== '' && diff.every((d) => d.op === 'ok')
      return {
        status: ok ? 'correct' : 'wrong',
        nearMiss: unionKinds(diff.map((d) => d.nearMiss)),
        expected: item.text,
        diff,
      }
    }
  }
}

/** A one-line description of what was asked, stored in the result so Claude can read it alone. */
export function describeItem(item: Item): string {
  switch (item.type) {
    case 'mc':
      return item.question
    case 'gap':
      return item.text
    case 'order':
      return item.prompt ?? `Order the words: ${item.tiles.join(' / ')}`
    case 'translate':
      return `Translate (${item.direction}): ${item.text}`
    case 'write':
      return item.prompt
    case 'dictation':
      return 'Dictation (audio only)'
    case 'listen_mc':
      return `${item.question} [audio: ${item.audio}]`
  }
}

export const DEFAULT_INSTRUCTIONS: Record<Item['type'], string> = {
  mc: 'Choose the correct answer.',
  gap: 'Fill in the gap.',
  order: 'Put the words in the right order. Tap the tiles.',
  translate: 'Translate.',
  write: 'Write in German.',
  dictation: 'Listen and type what you hear.',
  listen_mc: 'Listen, then choose the correct answer.',
}

export function instructionFor(item: Item): string {
  if (item.instruction) return item.instruction
  if (item.type === 'translate') return item.direction === 'en-de' ? 'Translate into German.' : 'Translate into English.'
  if (item.type === 'gap' && item.answers.length > 1) return 'Fill in the gaps.'
  return DEFAULT_INSTRUCTIONS[item.type]
}

export function answerForResult(a: AnswerValue): string | string[] | null {
  if (isBlank(a)) return null
  return typeof a === 'string' ? a.trim() : a
}

/** Grade every item and build the per-item records of a result file (tests and lesson exercises alike). */
export function resultItems(items: Item[], answers: AnswerValue[], timesMs: number[], hints: boolean[], plays: number[]): ResultItem[] {
  return items.map((it, i) => {
    const g = gradeItem(it, answers[i])
    const audio = it.type === 'dictation' || it.type === 'listen_mc'
    return {
      index: i,
      type: it.type,
      question: describeItem(it),
      answer: answerForResult(answers[i]),
      expected: g.expected,
      status: g.status,
      nearMiss: g.nearMiss,
      ...(g.gaps ? { gaps: g.gaps } : {}),
      ...(g.diff ? { diff: g.diff } : {}),
      timeMs: Math.round(timesMs[i]),
      hintUsed: hints[i],
      ...(audio ? { plays: plays[i] } : {}),
    }
  })
}

export function scoreOf(items: ResultItem[]): Result['score'] {
  const count = (s: ItemStatus) => items.filter((i) => i.status === s).length
  return { correct: count('correct'), wrong: count('wrong'), pending: count('pending'), total: items.length }
}

/** Status after Claude's review: a review verdict overrides the auto-grade. */
export function finalStatus(result: Result, index: number): ItemStatus {
  const r = result.review?.items.find((ri) => ri.index === index)
  if (r) return r.correct ? 'correct' : 'wrong'
  return result.items[index].status
}

export function finalScore(result: Result): Result['score'] {
  const statuses = result.items.map((_, i) => finalStatus(result, i))
  const count = (s: ItemStatus) => statuses.filter((x) => x === s).length
  return { correct: count('correct'), wrong: count('wrong'), pending: count('pending'), total: statuses.length }
}
