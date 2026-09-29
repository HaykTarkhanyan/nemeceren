// The one module that reads and writes Hayk's progress. Progress lives in Neon Postgres behind
// the API in backend/ (DECISIONS.md #21); this module talks to it:
//   - on start: GET /v1/state once (after sending anything left in the outbox);
//   - every change goes into a local outbox first (localStorage, survives reloads and offline);
//   - the outbox is sent as POST /v1/sync batches: after a test or lesson exercise, after a
//     review round, every ~5 minutes while the tab is visible and the outbox is not empty, when
//     the tab is hidden, and with "Sync now". An empty outbox never makes a request (Free plan).
// Pages read one merged view (the server state plus the outbox) through useProgress().
import { useSyncExternalStore } from 'react'
import type { LessonProgress, Result, ReviewLogEntry, StoredCard } from '../content/schema.ts'
import { ContentError } from '../content/validate.ts'
import { AuthFailure, getToken } from './auth.ts'
import { API_URL } from './config.ts'
import { localDay } from './dates.ts'
import { messageOf, reportError } from './errors.ts'
import {
  applySent,
  buildView,
  emptyOutbox,
  isOutboxEmpty,
  nextBatch,
  outboxSize,
  parseOutbox,
  parseState,
  parseSyncResponse,
  removeSent,
  sameJson,
} from './outbox.ts'
import type { Outbox, ProgressView, SavedResult, ServerState, SyncBatch } from './outbox.ts'
import type { ReviewEvent, TestItemEvent } from './stats.ts'

export type { ProgressView, SavedResult }

/** An error answer from the API: { error: { code, message, details? }, requestId }. */
export class ApiError extends Error {
  status: number
  code: string
  requestId: string | null
  details: unknown
  constructor(status: number, code: string, message: string, requestId: string | null, details: unknown) {
    super(`${message} (HTTP ${status} ${code}${requestId ? `, request ${requestId}` : ''})`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

/** The request never got an answer (offline, DNS, blocked). */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

export function isOffline(err: unknown): boolean {
  return err instanceof NetworkError || (err instanceof AuthFailure && err.network)
}

/** The sign-in is gone (expired session, blocked cookie): the app must show the sign-in page. */
export function isSignedOut(err: unknown): boolean {
  return (err instanceof ApiError && err.status === 401) || (err instanceof AuthFailure && err.status === 401)
}

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  phase: SyncPhase
  /** Changes waiting in the outbox. */
  pending: number
  /** Last successful sync (ms since epoch), this session. */
  lastSyncAt: number | null
  error: string | null
  /** Automatic syncs are paused after an error that a retry cannot fix (a bug); "Sync now" retries. */
  blocked: boolean
  /** Started offline: showing the copy of the last state that was loaded on this device. */
  fromCache: boolean
}

export interface StoreDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  getToken: (opts?: { fresh?: boolean }) => Promise<string>
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
  now: () => Date
  newId: () => string
  reportError: (message: string) => void
  /** Called when the API says the sign-in is gone, so the app can show the sign-in page. */
  onSignedOut?: () => void
}

/** Most reviews loaded with the state (the Stats page charts 30 days). */
export const STATE_DAYS = 35
/** keepalive requests (tab being hidden) must stay under 64 KB. */
const KEEPALIVE_MAX_BYTES = 60_000

const outboxKey = (userId: string) => `nemeceren.outbox.${userId}`
const cacheKey = (userId: string) => `nemeceren.state.${userId}`

export function createProgressStore(deps: StoreDeps) {
  let userId: string | null = null
  let server: ServerState | null = null
  let outbox: Outbox = emptyOutbox()
  let view: ProgressView | null = null
  let status: SyncStatus = { phase: 'idle', pending: 0, lastSyncAt: null, error: null, blocked: false, fromCache: false }
  let running: Promise<void> | null = null
  let again = false
  const listeners = new Set<() => void>()

  function emit() {
    listeners.forEach((l) => l())
  }

  function setStatus(patch: Partial<SyncStatus>) {
    status = { ...status, ...patch, pending: outboxSize(outbox) }
    emit()
  }

  function rebuild() {
    if (server) view = buildView(server, outbox, localDay(deps.now()))
    status = { ...status, pending: outboxSize(outbox) }
    emit()
  }

  function readJson(key: string): unknown {
    const raw = deps.storage.getItem(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw)
    } catch (err) {
      throw new Error(`Browser storage "${key}" is not valid JSON: ${messageOf(err)}`)
    }
  }

  /** Writes the outbox; failing here would lose a change, so it throws for the caller to show. */
  function persistOutbox() {
    if (!userId) throw new Error('Not signed in: cannot save progress')
    try {
      deps.storage.setItem(outboxKey(userId), JSON.stringify(outbox))
    } catch (err) {
      throw new Error(`Could not save your progress on this device (browser storage): ${messageOf(err)}`)
    }
  }

  /** The offline copy of the server state. Losing it loses nothing, but it is reported. */
  function persistCache() {
    if (!userId || !server) return
    try {
      deps.storage.setItem(cacheKey(userId), JSON.stringify(server))
    } catch (err) {
      deps.reportError(`Could not keep an offline copy of your progress on this device: ${messageOf(err)}`)
    }
  }

  async function request(method: 'GET' | 'POST', path: string, body?: unknown, keepalive = false): Promise<unknown> {
    let token = await deps.getToken()
    for (let attempt = 0; ; attempt++) {
      const json = body === undefined ? undefined : JSON.stringify(body)
      let res: Response
      try {
        res = await deps.fetch(`${API_URL}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
          body: json,
          keepalive: keepalive && json !== undefined && json.length < KEEPALIVE_MAX_BYTES,
        })
      } catch (err) {
        throw new NetworkError(`Cannot reach the progress server (${method} ${path}): ${messageOf(err)}`)
      }
      const text = await res.text()
      let data: unknown = null
      if (text !== '') {
        try {
          data = JSON.parse(text)
        } catch {
          throw new ApiError(res.status, 'bad_response', `The progress server answered ${method} ${path} with something that is not JSON: ${text.slice(0, 200)}`, null, null)
        }
      }
      if (res.ok) return data
      const e = (data as { error?: { code?: string; message?: string; details?: unknown }; requestId?: string } | null) ?? {}
      const code = e.error?.code ?? 'unknown'
      if (res.status === 401 && code === 'token_expired' && attempt === 0) {
        token = await deps.getToken({ fresh: true })
        continue
      }
      throw new ApiError(res.status, code, e.error?.message ?? res.statusText, e.requestId ?? res.headers.get('x-request-id'), e.error?.details)
    }
  }

  function describe(err: unknown): string {
    if (err instanceof ApiError && err.status === 409) {
      const ids = (err.details as { ids?: unknown } | undefined)?.ids
      return `Sync conflict: the server already has different data under the same id${Array.isArray(ids) ? ` (${ids.join(', ')})` : ''}. Nothing was lost: the changes stay on this device. This is an app bug; tell Claude. ${err.message}`
    }
    if (err instanceof ApiError && err.code === 'not_allowed') return 'This account is not activated yet. Ask Claude to activate it (allowlist).'
    if (err instanceof ContentError) return `The progress server sent data the app does not understand: ${err.message}`
    return messageOf(err)
  }

  function handleSyncError(err: unknown) {
    if (isOffline(err)) {
      setStatus({ phase: 'offline', error: null })
      return
    }
    if (isSignedOut(err)) {
      setStatus({ phase: 'error', error: 'Signed out. Sign in again to sync; your changes stay on this device.' })
      deps.onSignedOut?.()
      return
    }
    const message = `Sync failed: ${describe(err)}`
    // 5xx and "auth keys unavailable" may pass; anything else is a bug that a retry repeats.
    const retryable = err instanceof ApiError && (err.status >= 500 || err.code === 'auth_unavailable')
    setStatus({ phase: 'error', error: message, blocked: !retryable })
    deps.reportError(message)
  }

  /** Sends the outbox, in as many batches as the limits need. Never sends an empty batch. */
  function flush(opts: { keepalive?: boolean; manual?: boolean } = {}): Promise<void> {
    if (!userId) return Promise.resolve()
    if (running) {
      again = true
      return running
    }
    if (status.blocked && !opts.manual) return Promise.resolve()
    if (isOutboxEmpty(outbox)) return Promise.resolve()
    const run = (async () => {
      setStatus({ phase: 'syncing', error: null, blocked: false })
      let ok = false
      try {
        for (let batch: SyncBatch | null = nextBatch(outbox); batch; batch = nextBatch(outbox)) {
          const reply = parseSyncResponse(await request('POST', '/v1/sync', batch, opts.keepalive))
          outbox = removeSent(outbox, batch)
          persistOutbox()
          if (server) {
            server = applySent(server, batch, reply)
            persistCache()
          }
          rebuild()
        }
        ok = true
        setStatus({ phase: 'idle', lastSyncAt: deps.now().getTime(), error: null })
      } catch (err) {
        handleSyncError(err)
      } finally {
        running = null
        if (again) {
          again = false
          if (ok) void flush()
        }
      }
    })()
    running = run
    return run
  }

  /** Loads the user's outbox and state. Throws ApiError (e.g. 403 not_allowed), AuthFailure or NetworkError. */
  async function start(user: { id: string }): Promise<void> {
    userId = user.id
    server = null
    view = null
    status = { phase: 'idle', pending: 0, lastSyncAt: null, error: null, blocked: false, fromCache: false }
    const stored = readJson(outboxKey(user.id))
    outbox = stored === null ? emptyOutbox() : parseOutbox(`the unsynced changes on this device ("${outboxKey(user.id)}")`, stored)
    rebuild()
    if (!isOutboxEmpty(outbox)) await flush()
    try {
      const state = parseState('progress from the server', await request('GET', `/v1/state?days=${STATE_DAYS}`))
      if (state.userId !== user.id) throw new Error(`The server sent progress for another user (${state.userId}, signed in as ${user.id})`)
      server = state
      persistCache()
      status = { ...status, fromCache: false }
    } catch (err) {
      if (!isOffline(err)) throw err
      const cached = readJson(cacheKey(user.id))
      if (cached === null) {
        throw new NetworkError(`${messageOf(err)}. There is no copy of your progress on this device yet, so the app needs the internet once.`)
      }
      server = parseState('the offline copy of your progress', cached)
      status = { ...status, phase: 'offline', fromCache: true }
    }
    rebuild()
  }

  /** Forgets the user in memory (the outbox stays on the device and syncs after the next sign-in). */
  function stop() {
    userId = null
    server = null
    view = null
    outbox = emptyOutbox()
    status = { phase: 'idle', pending: 0, lastSyncAt: null, error: null, blocked: false, fromCache: false }
    emit()
  }

  function current(): ProgressView {
    if (!view) throw new Error('Progress is not loaded yet')
    return view
  }

  function change(mutate: (o: Outbox) => Outbox) {
    current()
    const before = outbox
    outbox = mutate(outbox)
    try {
      persistOutbox()
    } catch (err) {
      outbox = before
      throw err
    }
    rebuild()
  }

  const today = () => localDay(deps.now())

  return {
    start,
    stop,
    flush,
    getView: current,
    hasView: () => view !== null,
    getStatus: () => status,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },

    /** A scheduled word review: the log entry and the word's new FSRS card. */
    recordReview(entry: ReviewLogEntry, card: StoredCard) {
      if (entry.practice) throw new Error('recordReview is for scheduled reviews; use recordPractice')
      if (!entry.localDay) throw new Error('A review needs its localDay')
      const localDayOfEntry = entry.localDay
      change((o) => ({
        ...o,
        reviewEvents: [...o.reviewEvents, { ...entry, localDay: localDayOfEntry, id: deps.newId() }],
        cards: { ...o.cards, [entry.wordId]: card },
      }))
    },

    /** Practice of a weak word: logged only, the schedule does not change (DECISIONS.md #25). */
    recordPractice(entry: ReviewLogEntry) {
      if (!entry.practice) throw new Error('recordPractice needs practice: true')
      if (!entry.localDay) throw new Error('A review needs its localDay')
      const localDayOfEntry = entry.localDay
      change((o) => ({ ...o, reviewEvents: [...o.reviewEvents, { ...entry, localDay: localDayOfEntry, id: deps.newId() }] }))
    },

    /** "Learn more new words today": raises today's limit by n. */
    addExtraNewWords(n: number) {
      const day = today()
      const now = current().reviewState.newToday
      const base = now.date === day ? (now.extra ?? 0) : 0
      change((o) => ({ ...o, newWordExtras: { ...o.newWordExtras, [day]: base + n } }))
    },

    /** Saves a submitted test or lesson exercise and starts a sync. Returns the attempt id. */
    saveResult(result: Result): string {
      if (result.review) throw new Error('A new attempt cannot carry a review')
      if (!result.localDay) throw new Error('An attempt needs its localDay')
      const id = deps.newId()
      const localDayOfResult = result.localDay
      change((o) => ({ ...o, attempts: [...o.attempts, { ...result, localDay: localDayOfResult, id }] }))
      void flush()
      return id
    },

    /** Saves every lesson record that changed. */
    saveLessonProgress(p: LessonProgress) {
      const known = current().lessonProgress.lessons
      const changed = Object.entries(p.lessons).filter(([id, rec]) => !sameJson(known[id], rec))
      if (changed.length === 0) return
      change((o) => ({ ...o, lessons: { ...o.lessons, ...Object.fromEntries(changed) } }))
    },
  }
}

export type ProgressStore = ReturnType<typeof createProgressStore>

// ---------- the app's store ----------

let store: ProgressStore | null = null
let signedOutListener: (() => void) | null = null

/** The app's store, created on first use (tests make their own with createProgressStore). */
export function progressStore(): ProgressStore {
  if (store === null) {
    store = createProgressStore({
      fetch: (url, init) => window.fetch(url, init),
      getToken,
      storage: window.localStorage,
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
      reportError,
      onSignedOut: () => signedOutListener?.(),
    })
  }
  return store
}

export function onSignedOut(listener: (() => void) | null): void {
  signedOutListener = listener
}

export function useProgress(): ProgressView {
  const s = progressStore()
  return useSyncExternalStore(s.subscribe, s.getView)
}

export function useSyncStatus(): SyncStatus {
  const s = progressStore()
  return useSyncExternalStore(s.subscribe, s.getStatus)
}

export const recordReview = (entry: ReviewLogEntry, card: StoredCard) => progressStore().recordReview(entry, card)
export const recordPractice = (entry: ReviewLogEntry) => progressStore().recordPractice(entry)
export const addExtraNewWords = (n: number) => progressStore().addExtraNewWords(n)
export const saveResult = (result: Result) => progressStore().saveResult(result)
export const saveLessonProgress = (p: LessonProgress) => progressStore().saveLessonProgress(p)

/** Starts a sync unless the outbox is empty (e.g. after a review round). */
export function requestFlush(): void {
  void progressStore().flush()
}

export function syncNow(): Promise<void> {
  return progressStore().flush({ manual: true })
}

const FLUSH_EVERY_MS = 5 * 60_000

/**
 * Background syncs while signed in: about every 5 minutes while the tab is visible and the
 * outbox has something, when the tab is hidden (keepalive), and when the device comes back
 * online. None of them makes a request when the outbox is empty. Returns a stop function.
 */
export function startAutoSync(): () => void {
  const s = progressStore()
  const tick = window.setInterval(() => {
    if (document.visibilityState === 'visible' && s.getStatus().pending > 0) void s.flush()
  }, FLUSH_EVERY_MS)
  const onHide = () => {
    if (document.visibilityState === 'hidden') void s.flush({ keepalive: true })
  }
  const onOnline = () => void s.flush()
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('online', onOnline)
  return () => {
    window.clearInterval(tick)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('online', onOnline)
  }
}

/** Study activity as plain events for the statistics (lib/stats.ts). */
export function activityOf(p: ProgressView): { reviews: ReviewEvent[]; testItems: TestItemEvent[]; studyDays: string[] } {
  const reviews = p.reviewLog.map((e) => ({
    at: Date.parse(e.ts),
    localDay: e.localDay,
    timeMs: e.timeMs,
    rating: e.rating,
    isNew: e.isNew,
    practice: e.practice === true,
  }))
  const testItems = p.results.flatMap(({ id, result }) =>
    result.items.map((it) => ({
      attemptId: id,
      startedAt: Date.parse(result.startedAt),
      submittedAt: Date.parse(result.submittedAt),
      localDay: result.localDay,
      timeMs: it.timeMs,
      answered: it.answer !== null,
    })),
  )
  return { reviews, testItems, studyDays: p.studyDays }
}
