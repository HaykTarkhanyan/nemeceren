// The one module that reads and writes Hayk's progress. Nothing else touches storage.
//   repo mode (npm run dev):   JSON files under progress/ through the dev server API.
//   browser mode (GitHub Pages): localStorage in this browser only, not synced.
// Every failure throws with a clear message; callers show it in the UI.
import snapshot from 'virtual:review-snapshot'
import type { LessonProgress, Result, ReviewLogEntry, ReviewState } from '../content/schema.ts'
import { parseLessonProgress, parseResult, parseReviewLog, parseReviewState } from '../content/validate.ts'
import { emptyLessonProgress } from './plan.ts'
import { emptyState, mergeStates } from './srs.ts'
import type { ReviewEvent, TestItemEvent } from './stats.ts'

export type SaveMode = 'repo' | 'browser'
export const SAVE_MODE: SaveMode = import.meta.env.DEV ? 'repo' : 'browser'


export interface SavedResult {
  /** Path relative to progress/, e.g. results/a1-01__2026-09-28T19-30-05-123Z.json */
  file: string
  result: Result
}

// ---------- repo mode: dev server API ----------

async function api(method: 'GET' | 'PUT' | 'POST', query: string, body?: unknown): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`/api/progress?${query}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    throw new Error(`Could not reach the local progress API (${method} ${query}). Is "npm run dev" still running? ${(err as Error).message}`)
  }
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Progress API ${method} ${query} returned ${res.status} with a non-JSON body: ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? res.statusText
    const err = new Error(`Progress API ${method} ${query} failed with ${res.status}: ${msg}`)
    ;(err as Error & { status: number }).status = res.status
    throw err
  }
  return data
}

function q(key: string, value: string): string {
  return `${key}=${encodeURIComponent(value)}`
}

// ---------- browser mode: localStorage ----------

const LS = {
  results: 'nemeceren.results',
  reviewState: 'nemeceren.reviewState',
  reviewLog: 'nemeceren.reviewLog',
  lessons: 'nemeceren.lessons',
}

function readLs(key: string): unknown {
  const raw = localStorage.getItem(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`Browser storage "${key}" is not valid JSON: ${(err as Error).message}`)
  }
}

function writeLs(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    throw new Error(`Could not save to browser storage "${key}": ${(err as Error).message}`)
  }
}

function readLsArray(key: string): unknown[] {
  const v = readLs(key)
  if (v === null) return []
  if (!Array.isArray(v)) throw new Error(`Browser storage "${key}" should be a list but is not`)
  return v
}

// ---------- public API ----------

export function resultFileName(result: Result): string {
  return `results/${result.testId}__${result.submittedAt.replace(/[:.]/g, '-')}.json`
}

/** Save a new result. Returns the file path relative to progress/. */
export async function saveResult(result: Result): Promise<string> {
  const file = resultFileName(result)
  if (SAVE_MODE === 'repo') {
    await api('PUT', q('path', file), result)
  } else {
    const list = readLsArray(LS.results)
    writeLs(LS.results, [...list, { file, result }])
  }
  return file
}

/** All saved results, newest first. Invalid files (e.g. a malformed review) throw. */
export async function listResults(): Promise<SavedResult[]> {
  let out: SavedResult[]
  if (SAVE_MODE === 'repo') {
    const data = (await api('GET', q('dir', 'results'))) as { files: { name: string; data: unknown }[] }
    out = data.files.map((f) => ({ file: `results/${f.name}`, result: parseResult(`progress/results/${f.name}`, f.data) }))
  } else {
    out = readLsArray(LS.results).map((entry, i) => {
      const e = entry as { file?: unknown; result?: unknown }
      if (typeof e.file !== 'string') throw new Error(`Browser storage "${LS.results}" entry ${i} has no file name`)
      return { file: e.file, result: parseResult(`browser result ${e.file}`, e.result) }
    })
  }
  return out.sort((a, b) => b.result.submittedAt.localeCompare(a.result.submittedAt))
}

export async function loadReviewState(): Promise<ReviewState> {
  const now = new Date()
  if (SAVE_MODE === 'repo') {
    try {
      const data = await api('GET', q('path', 'review-state.json'))
      return parseReviewState('progress/review-state.json', data)
    } catch (err) {
      // No file yet just means no word has been reviewed yet.
      if ((err as { status?: number }).status === 404) return emptyState(now)
      throw err
    }
  }
  const local = readLs(LS.reviewState)
  const mine = local === null ? null : parseReviewState(`browser storage "${LS.reviewState}"`, local)
  const snap = snapshot === null ? null : parseReviewState('build snapshot of progress/review-state.json', snapshot)
  if (mine && snap) return mergeStates(snap, mine)
  return mine ?? snap ?? emptyState(now)
}

export async function saveReviewState(state: ReviewState): Promise<void> {
  if (SAVE_MODE === 'repo') await api('PUT', q('path', 'review-state.json'), state)
  else writeLs(LS.reviewState, state)
}

export async function appendReviewLog(entry: ReviewLogEntry): Promise<void> {
  if (SAVE_MODE === 'repo') await api('POST', q('path', 'review-log.jsonl'), entry)
  else writeLs(LS.reviewLog, [...readLsArray(LS.reviewLog), entry])
}

/** Every word review so far, oldest first. */
export async function loadReviewLog(): Promise<ReviewLogEntry[]> {
  if (SAVE_MODE === 'repo') {
    try {
      const data = (await api('GET', q('path', 'review-log.jsonl'))) as { lines: unknown[] }
      return parseReviewLog('progress/review-log.jsonl', data.lines)
    } catch (err) {
      // No file yet just means no word has been reviewed yet.
      if ((err as { status?: number }).status === 404) return []
      throw err
    }
  }
  return parseReviewLog(`browser storage "${LS.reviewLog}"`, readLsArray(LS.reviewLog))
}

/**
 * Study activity as plain events for the statistics (lib/stats.ts), independent of how it is
 * stored: one event per word review, one per test item of every submitted attempt.
 */
export async function loadActivity(): Promise<{ reviews: ReviewEvent[]; testItems: TestItemEvent[] }> {
  const [log, results] = await Promise.all([loadReviewLog(), listResults()])
  const reviews = log.map((e) => ({
    at: Date.parse(e.ts),
    localDay: e.localDay,
    timeMs: e.timeMs,
    rating: e.rating,
    isNew: e.isNew,
    practice: e.practice === true,
  }))
  const testItems = results.flatMap(({ file, result }) =>
    result.items.map((it) => ({
      attemptId: file,
      startedAt: Date.parse(result.startedAt),
      submittedAt: Date.parse(result.submittedAt),
      localDay: result.localDay,
      timeMs: it.timeMs,
      answered: it.answer !== null,
    })),
  )
  return { reviews, testItems }
}

/** Which lessons were started and done, and where Hayk was in each. */
export async function loadLessonProgress(): Promise<LessonProgress> {
  if (SAVE_MODE === 'repo') {
    try {
      const data = await api('GET', q('path', 'lessons.json'))
      return parseLessonProgress('progress/lessons.json', data)
    } catch (err) {
      // No file yet just means no lesson has been opened yet.
      if ((err as { status?: number }).status === 404) return emptyLessonProgress()
      throw err
    }
  }
  const local = readLs(LS.lessons)
  return local === null ? emptyLessonProgress() : parseLessonProgress(`browser storage "${LS.lessons}"`, local)
}

export async function saveLessonProgress(p: LessonProgress): Promise<void> {
  if (SAVE_MODE === 'repo') await api('PUT', q('path', 'lessons.json'), p)
  else writeLs(LS.lessons, p)
}
