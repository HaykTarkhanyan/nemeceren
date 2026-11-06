// Mistakes replay (DECISIONS.md #81), as pure functions: every item answered wrong in a test or a
// lesson exercise (from MISTAKES_SINCE on) comes back the next day, until it was answered right on
// two different days after its last wrong answer. Redos are ordinary one-item attempts
// (content/lessons.ts redoTestId), so they sync and Claude sees them like any attempt. A right
// answer in a later attempt of the whole test counts as well. Write items count once Claude has
// graded them.
import { findSource, parseRedoTestId } from '../content/lessons.ts'
import type { MistakeSource } from '../content/lessons.ts'
import type { Item, Lesson, Result, Test } from '../content/schema.ts'
import { localDay } from './dates.ts'
import { describeItem, finalStatus } from './grading.ts'

/** Hayk chose "only mistakes from now on" (2026-11-06): older attempts are not replayed. */
export const MISTAKES_SINCE = '2026-11-06'
/** A mistake is fixed after right answers on this many different days. */
export const FIX_DAYS = 2
/** Items per Mistakes session (the daily mix takes 5). */
export const MISTAKE_SESSION_MAX = 10

export interface Mistake {
  key: string
  sourceId: string
  index: number
  item: Item
  source: MistakeSource
  /** The last wrong or right answer (ms) and its local day. */
  lastAt: number
  lastDay: string
  /** Days with a right answer since the last wrong one. */
  rightDays: number
  /** Comes back today: the last answer was on an earlier day. */
  due: boolean
  /** Claude's correction of the last wrong answer, if there is one (write items). */
  correction?: string
}

interface Event {
  at: number
  day: string
  /** pending: a rewritten write item waiting for Claude. It moves the next showing to tomorrow, but neither fixes nor reopens the mistake. */
  status: 'correct' | 'wrong' | 'pending'
  question: string
  correction?: string
}

/**
 * Attempts with generated items (the Listen page's "listening-practice") have nothing fixed to
 * replay: their items change every time, so they are not mistake sources.
 */
export const NOT_REPLAYED = new Set(['listening-practice'])

/** Every graded answer per item ("<source id>#<index>"), from attempts and redos since MISTAKES_SINCE. */
function answerEvents(results: Result[]): Map<string, Event[]> {
  const out = new Map<string, Event[]>()
  const push = (key: string, e: Event) => out.set(key, [...(out.get(key) ?? []), e])
  for (const r of results) {
    if (!r.localDay || r.localDay < MISTAKES_SINCE || NOT_REPLAYED.has(r.testId)) continue
    const at = Date.parse(r.submittedAt)
    const redo = parseRedoTestId(r.testId)
    r.items.forEach((ri, i) => {
      const status = finalStatus(r, i)
      // A first attempt still waiting for Claude is not a mistake yet; a pending redo still counts as shown today.
      if (status === 'pending' && !redo) return
      const correction = r.review?.items.find((x) => x.index === i)?.correction
      const key = redo ? `${redo.sourceId}#${redo.index}` : `${r.testId}#${i}`
      push(key, { at, day: r.localDay as string, status, question: ri.question, ...(correction ? { correction } : {}) })
    })
  }
  return out
}

export function deriveMistakes(
  results: Result[],
  tests: Test[],
  lessons: Lesson[],
  now: Date,
): { active: Mistake[]; due: Mistake[]; changed: number; fixed: number } {
  const today = localDay(now)
  const active: Mistake[] = []
  let changed = 0
  let fixed = 0
  for (const [key, events] of answerEvents(results)) {
    let open: { last: Event; wrong: Event; days: Set<string> } | null = null
    for (const e of [...events].sort((a, b) => a.at - b.at)) {
      if (e.status === 'wrong') open = { last: e, wrong: e, days: new Set() }
      else if (e.status === 'pending') {
        if (open) open.last = e
      } else if (open) {
        open.days.add(e.day)
        open.last = e
        if (open.days.size >= FIX_DAYS) {
          open = null
          fixed += 1
        }
      }
    }
    if (!open) continue
    const sep = key.lastIndexOf('#')
    const sourceId = key.slice(0, sep)
    const index = Number(key.slice(sep + 1))
    const source = findSource(sourceId, tests, lessons)
    const item = source?.items[index]
    // The item was removed or rewritten since: it cannot come back as it was asked.
    if (!source || !item || describeItem(item) !== open.wrong.question) {
      changed += 1
      continue
    }
    active.push({
      key,
      sourceId,
      index,
      item,
      source,
      lastAt: open.last.at,
      lastDay: open.last.day,
      rightDays: open.days.size,
      due: open.last.day < today,
      ...(open.wrong.correction ? { correction: open.wrong.correction } : {}),
    })
  }
  active.sort((a, b) => a.lastAt - b.lastAt || a.key.localeCompare(b.key))
  return { active, due: active.filter((m) => m.due), changed, fixed }
}
