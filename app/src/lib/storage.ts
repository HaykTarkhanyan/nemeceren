// The one module that reads and writes Hayk's progress. Progress lives in Neon Postgres behind
// the API in backend/ (DECISIONS.md #21); this module talks to it:
//   - on start: GET /v1/state once (after sending anything left in the outbox);
//   - every change goes into a local outbox first (localStorage, survives reloads and offline);
//   - the outbox is sent as POST /v1/sync batches: after a test or lesson exercise, after a
//     review round, every ~5 minutes while the tab is visible and the outbox is not empty, when
//     the tab is hidden, and with "Sync now". An empty outbox never makes a request (Free plan).
// Pages read one merged view (the server state plus the outbox) through useProgress().
// Guest mode (startGuest, DECISIONS.md #55): the same store with an empty state in memory; changes
// go straight into it, nothing is written to browser storage and no request is ever made.
import { useSyncExternalStore } from 'react'
import type { LessonProgress, Result, ReviewLogEntry, StoredCard } from '../content/schema.ts'
import { ContentError } from '../content/validate.ts'
import { AuthFailure, getToken } from './auth.ts'
import { API_URL } from './config.ts'
import { customWordId, customWordProblem, draftOf, fieldsOf, sameFields } from './customWords.ts'
import type { CustomWordDraft } from './customWords.ts'
import { localDay } from './dates.ts'
import { messageOf, reportError } from './errors.ts'
import { noteTextProblem } from './notes.ts'
import {
  acceptedLocally,
  applySent,
  buildView,
  emptyOutbox,
  isOutboxEmpty,
  lockedRejections,
  nextBatch,
  outboxSize,
  parseOutbox,
  parseState,
  parseSyncResponse,
  removeSent,
  sameJson,
} from './outbox.ts'
import type { CustomWordRecord, CustomWordView, NoteRecord, NoteView, Outbox, ProgressView, SavedResult, ServerState, SyncBatch } from './outbox.ts'
import { introducedCard } from './srs.ts'
import type { ReviewEvent, TestItemEvent } from './stats.ts'

export type { CustomWordView, NoteView, ProgressView, SavedResult }

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

/** The state of a guest: nothing yet. */
function emptyServerState(now: Date): ServerState {
  const t = now.toISOString()
  return {
    serverTime: t,
    userId: 'guest',
    reviewEventsSince: t,
    cards: {},
    reviewEvents: [],
    studyDays: [],
    attempts: [],
    lessonProgress: { version: 1, lessons: {} },
    newWordExtras: {},
    notes: [],
    customWords: [],
  }
}

export function createProgressStore(deps: StoreDeps) {
  let userId: string | null = null
  /** Guest mode: no account, no storage, no network; progress lives in memory until a reload. */
  let guest = false
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
    if (guest || !userId) return Promise.resolve()
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
          for (const message of lockedRejections(batch, reply)) deps.reportError(message)
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
    guest = false
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
      // Offline copies saved before notes and custom words existed (2026-09-30) have no such key: that copy had none.
      const copy =
        cached !== null && typeof cached === 'object'
          ? { ...('notes' in cached ? {} : { notes: [] }), ...('customWords' in cached ? {} : { customWords: [] }), ...cached }
          : cached
      server = parseState('the offline copy of your progress', copy)
      status = { ...status, phase: 'offline', fromCache: true }
    }
    rebuild()
  }

  /** Guest mode: an empty state in memory. Never reads or writes browser storage and never calls the API or the auth server. */
  function startGuest() {
    guest = true
    userId = null
    server = emptyServerState(deps.now())
    outbox = emptyOutbox()
    status = { phase: 'idle', pending: 0, lastSyncAt: null, error: null, blocked: false, fromCache: false }
    rebuild()
  }

  /**
   * "Check for feedback": loads GET /v1/state once more (one request; the outbox is not sent), so
   * Claude's new feedback and reviews show. Throws on failure, for the page to show.
   */
  async function refresh(): Promise<void> {
    if (guest) throw new Error('Guest mode has no account to check.')
    if (!userId) throw new Error('Not signed in: nothing to check')
    const user = userId
    let state: ServerState
    try {
      state = parseState('progress from the server', await request('GET', `/v1/state?days=${STATE_DAYS}`))
    } catch (err) {
      if (isSignedOut(err)) deps.onSignedOut?.()
      if (err instanceof ApiError || err instanceof ContentError) throw new Error(describe(err))
      throw err
    }
    if (state.userId !== user) throw new Error(`The server sent progress for another user (${state.userId}, signed in as ${user})`)
    if (userId !== user) return // signed out while the request was on its way
    server = state
    persistCache()
    status = { ...status, fromCache: false }
    rebuild()
  }

  /** Forgets the user in memory (the outbox stays on the device and syncs after the next sign-in). */
  function stop() {
    guest = false
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
    if (guest) {
      // Straight into the in-memory state, as if a sync had accepted it; nothing is stored or sent.
      for (let batch = nextBatch(outbox); batch; batch = nextBatch(outbox)) {
        server = applySent(server!, batch, acceptedLocally(deps.now().toISOString()))
        outbox = removeSent(outbox, batch)
      }
      rebuild()
      return
    }
    try {
      persistOutbox()
    } catch (err) {
      outbox = before
      throw err
    }
    rebuild()
  }

  const today = () => localDay(deps.now())

  /** The note to change: it must exist, and a note with Claude's feedback is locked. */
  function changeableNote(id: string): NoteView {
    const note = current().notes.find((n) => n.id === id)
    if (!note) throw new Error(`There is no note ${id} (was it deleted on another device?)`)
    if (note.feedback) throw new Error("This note has Claude's feedback, so it is locked: it cannot be changed or deleted any more.")
    return note
  }

  /** The custom word to change: it must exist (not deleted). */
  function customWord(id: string): CustomWordView {
    const word = current().customWords.find((w) => w.id === id)
    if (!word) throw new Error(`There is no word ${id} in your words (was it deleted on another device?)`)
    return word
  }

  /** Always later than the version it replaces (the merge needs a later updatedAt), even if the clock went back. */
  function changedAt(before: string): string {
    return new Date(Math.max(deps.now().getTime(), Date.parse(before) + 1)).toISOString()
  }

  return {
    start,
    startGuest,
    stop,
    flush,
    refresh,
    isGuest: () => guest,
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

    /**
     * Saves a new note (no id) or a changed one, and starts a sync, like a submitted test. The text
     * is trimmed. Throws with a message for Hayk if it is empty or too long, or the note is locked.
     * Returns the note id.
     */
    saveNote(text: string, id?: string): string {
      if (guest) throw new Error("Sign in to write notes: a guest's notes could not be kept, and Claude could not read them.")
      const problem = noteTextProblem(text)
      if (problem) throw new Error(problem)
      const trimmed = text.trim()
      let noteId: string
      let record: NoteRecord
      if (id === undefined) {
        noteId = deps.newId()
        const now = deps.now().toISOString()
        record = { text: trimmed, localDay: today(), createdAt: now, updatedAt: now, deletedAt: null }
      } else {
        const note = changeableNote(id)
        if (note.text === trimmed) return id
        noteId = id
        record = { text: trimmed, localDay: note.localDay, createdAt: note.createdAt, updatedAt: changedAt(note.updatedAt), deletedAt: null }
      }
      change((o) => ({ ...o, notes: { ...o.notes, [noteId]: record } }))
      void flush()
      return noteId
    },

    /**
     * Saves a new custom word (no id) or a change of one; it goes into the outbox and syncs with
     * the next batch. A new word is practised right away (lib/srs.ts). Editing clears Claude's
     * check. Throws with a message for Hayk if a field is missing or too long. Returns the word id.
     * Guests may add words too; they live in memory like the rest of a guest's progress.
     */
    saveCustomWord(draft: CustomWordDraft, id?: string): string {
      const problem = customWordProblem(draft)
      if (problem) throw new Error(problem)
      const fields = fieldsOf(draft)
      let wordId: string
      let record: CustomWordRecord
      if (id === undefined) {
        wordId = customWordId(deps.newId())
        const now = deps.now().toISOString()
        record = { ...fields, createdAt: now, updatedAt: now }
      } else {
        const word = customWord(id)
        if (sameFields(fieldsOf(draftOf(word)), fields)) return id
        wordId = id
        record = { ...fields, createdAt: word.createdAt, updatedAt: changedAt(word.updatedAt) }
      }
      change((o) => ({ ...o, customWords: { ...o.customWords, [wordId]: record } }))
      return wordId
    },

    /** Deletes a custom word (soft: it leaves practice, its review history stays for the stats). */
    deleteCustomWord(id: string) {
      const word = customWord(id)
      const at = changedAt(word.updatedAt)
      const record: CustomWordRecord = { ...fieldsOf(draftOf(word)), createdAt: word.createdAt, updatedAt: at, deletedAt: at }
      change((o) => ({ ...o, customWords: { ...o.customWords, [id]: record } }))
    },

    /**
     * Introduces a content word now ("Already in lesson 1.3: add that card"): a card that was never
     * reviewed, due at once, so the word is unlocked as if its lesson had been opened, without a
     * duplicate custom word. The server never lets such a card replace a reviewed one.
     */
    addContentCard(wordId: string) {
      if (current().reviewState.cards[wordId]) throw new Error(`"${wordId}" is already in your practice`)
      const card = introducedCard(deps.now())
      change((o) => ({ ...o, cards: { ...o.cards, [wordId]: card } }))
    },

    /** Deletes a note without feedback (a soft delete, so the other devices learn it too) and starts a sync. */
    deleteNote(id: string) {
      if (guest) throw new Error('Guest mode has no notes.')
      const note = changeableNote(id)
      const at = changedAt(note.updatedAt)
      const record: NoteRecord = { text: note.text, localDay: note.localDay, createdAt: note.createdAt, updatedAt: at, deletedAt: at }
      change((o) => ({ ...o, notes: { ...o.notes, [id]: record } }))
      void flush()
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
export const saveNote = (text: string, id?: string) => progressStore().saveNote(text, id)
export const deleteNote = (id: string) => progressStore().deleteNote(id)
export const saveCustomWord = (draft: CustomWordDraft, id?: string) => progressStore().saveCustomWord(draft, id)
export const deleteCustomWord = (id: string) => progressStore().deleteCustomWord(id)
export const addContentCard = (wordId: string) => progressStore().addContentCard(wordId)
export const refreshState = () => progressStore().refresh()

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
