import { afterEach, describe, expect, it } from 'vitest'
import type { Result, ReviewLogEntry } from '../content/schema.ts'
import { API_URL } from './config.ts'
import { emptyState, Rating, review } from './srs.ts'
import { ApiError, createProgressStore, NetworkError } from './storage.ts'

// ---------- a fake API ----------

interface Call {
  method: string
  path: string
  body: Record<string, unknown> | null
  auth: string | null
  keepalive: boolean
}

type Handler = (call: Call) => Response | Promise<Response> | 'network-error'

// The store turns any failing fetch into "offline", so a request no test expected would pass
// silently. Collect them here and fail the test instead.
let unexpected: string[] = []
afterEach(() => {
  expect(unexpected).toEqual([])
  unexpected = []
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const apiError = (status: number, code: string, details?: unknown) => json(status, { error: { code, message: `${code} happened`, details }, requestId: 'req-1' })

const emptyStateReply = (over: Record<string, unknown> = {}) => ({
  serverTime: '2026-09-29T10:00:00.000Z',
  userId: 'u1',
  reviewEventsSince: '2026-08-25T10:00:00.000Z',
  cards: {},
  reviewEvents: [],
  studyDays: [],
  attempts: [],
  lessonProgress: { version: 1, lessons: {} },
  newWordExtras: {},
  ...over,
})

/** A sync reply like the real API's: everything inserted or written, nothing stale. */
function okSync(body: Record<string, unknown>, over: Record<string, unknown> = {}) {
  const n = (k: string) => ((body[k] as unknown[] | undefined) ?? []).length
  return json(200, {
    ok: true,
    serverTime: '2026-09-29T10:05:00.000Z',
    reviewEvents: { received: n('reviewEvents'), inserted: n('reviewEvents'), duplicates: 0 },
    cards: { received: n('cards'), written: n('cards'), unchanged: 0, stale: [] },
    attempts: { received: n('attempts'), inserted: n('attempts'), duplicates: 0 },
    lessons: { received: n('lessons'), written: n('lessons'), unchanged: 0, stale: [] },
    newWordExtras: { received: n('newWordExtras'), written: n('newWordExtras'), unchanged: 0, stale: [] },
    ...over,
  })
}

function setup(handlers: Handler[], opts: { storage?: Map<string, string> } = {}) {
  const calls: Call[] = []
  const errors: string[] = []
  const storage = opts.storage ?? new Map<string, string>()
  let tokens = 0
  let ids = 0
  let signedOut = 0
  const store = createProgressStore({
    async fetch(url, init) {
      const u = new URL(url)
      expect(`${u.origin}`).toBe(new URL(API_URL).origin)
      const call: Call = {
        method: init.method ?? 'GET',
        path: u.pathname + u.search,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
        auth: new Headers(init.headers).get('authorization'),
        keepalive: init.keepalive === true,
      }
      calls.push(call)
      const h = handlers.shift()
      if (!h) {
        unexpected.push(`${call.method} ${call.path}`)
        throw new Error(`unexpected request ${call.method} ${call.path}`)
      }
      const r = await h(call)
      if (r === 'network-error') throw new TypeError('Failed to fetch')
      return r
    },
    async getToken(o) {
      tokens += 1
      return o?.fresh ? 'fresh-token' : 'token'
    },
    storage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => void storage.set(k, v),
      removeItem: (k) => void storage.delete(k),
    },
    now: () => new Date('2026-09-29T10:00:00.000Z'),
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    reportError: (m) => void errors.push(m),
    onSignedOut: () => void signedOut++,
  })
  return { store, calls, errors, storage, tokens: () => tokens, signedOut: () => signedOut, handlers }
}

const entry = (over: Partial<ReviewLogEntry> = {}): ReviewLogEntry => ({
  ts: '2026-09-29T10:00:00.000Z',
  localDay: '2026-09-29',
  timeMs: 1000,
  wordId: 'termin',
  de: 'der Termin',
  mode: 'recognition',
  rating: 3,
  answer: null,
  correct: null,
  nearMiss: null,
  isNew: true,
  stateBefore: 0,
  stateAfter: 1,
  due: '2026-09-29T10:10:00.000Z',
  ...over,
})

const t0 = new Date('2026-09-29T10:00:00.000Z')
const card = (at: Date = t0) => review(emptyState(at), 'termin', Rating.Good, at).after

const result = (): Result => ({
  version: 1,
  testId: 't1',
  testTitle: 'T1',
  level: 'A1',
  mode: 'web',
  startedAt: '2026-09-29T09:00:00.000Z',
  submittedAt: '2026-09-29T09:05:00.000Z',
  localDay: '2026-09-29',
  score: { correct: 1, wrong: 0, pending: 0, total: 1 },
  items: [{ index: 0, type: 'dictation', question: 'q', answer: 'Hallo', expected: 'Hallo', status: 'correct', nearMiss: null, timeMs: 5, hintUsed: false }],
})

const started = async (handlers: Handler[] = [], opts: { storage?: Map<string, string> } = {}) => {
  const env = setup([() => json(200, emptyStateReply()), ...handlers], opts)
  await env.store.start({ id: 'u1' })
  return env
}

describe('start', () => {
  it('loads the state once with a bearer token, and sends nothing when the outbox is empty', async () => {
    const env = await started()
    expect(env.calls).toEqual([{ method: 'GET', path: '/v1/state?days=35', body: null, auth: 'Bearer token', keepalive: false }])
    expect(env.store.getView().reviewState.newToday).toEqual({ date: '2026-09-29', count: 0 })
    await env.store.flush()
    expect(env.calls).toHaveLength(1)
  })

  it('sends a leftover outbox first, then loads the state', async () => {
    const storage = new Map<string, string>()
    const first = await started([], { storage })
    first.store.recordReview(entry(), card())
    const env = setup([(c) => okSync(c.body!), () => json(200, emptyStateReply())], { storage })
    await env.store.start({ id: 'u1' })
    expect(env.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /v1/sync', 'GET /v1/state?days=35'])
    expect(env.store.getStatus().pending).toBe(0)
  })

  it('reports a user that is not on the allowlist as ApiError not_allowed', async () => {
    const env = setup([() => apiError(403, 'not_allowed')])
    const err = await env.store.start({ id: 'u1' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('not_allowed')
  })

  it('starts from the offline copy when the server cannot be reached', async () => {
    const storage = new Map<string, string>()
    await started([], { storage })
    const env = setup([() => 'network-error'], { storage })
    await env.store.start({ id: 'u1' })
    expect(env.store.getStatus()).toMatchObject({ phase: 'offline', fromCache: true })
  })

  it('fails loudly offline when there is no copy on this device yet', async () => {
    const env = setup([() => 'network-error'])
    await expect(env.store.start({ id: 'u1' })).rejects.toThrow(NetworkError)
  })
})

describe('flush', () => {
  it('sends the outbox as one batch and empties it; the next flush makes no request', async () => {
    const env = await started([(c) => okSync(c.body!)])
    env.store.recordReview(entry(), card())
    env.store.addExtraNewWords(5)
    expect(env.store.getStatus().pending).toBe(3)
    await env.store.flush()
    const sent = env.calls[1].body!
    expect(Object.keys(sent).sort()).toEqual(['cards', 'newWordExtras', 'reviewEvents'])
    expect((sent.reviewEvents as { id: string }[])[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(sent.newWordExtras).toEqual([{ localDay: '2026-09-29', extra: 5 }])
    expect(env.store.getStatus()).toMatchObject({ phase: 'idle', pending: 0, error: null })
    expect(env.store.getStatus().lastSyncAt).not.toBeNull()
    await env.store.flush()
    expect(env.calls).toHaveLength(2)
  })

  it('starts a sync by itself after a test result is saved', async () => {
    const env = await started([(c) => okSync(c.body!)])
    const id = env.store.saveResult(result())
    expect(env.store.getView().pendingAttemptIds).toEqual([id])
    await env.store.flush()
    expect(env.calls.map((c) => c.path)).toEqual(['/v1/state?days=35', '/v1/sync'])
    expect(env.store.getView().pendingAttemptIds).toEqual([])
    expect(env.store.getView().results.map((r) => r.id)).toEqual([id])
  })

  it('adopts the newer versions the server kept (stale)', async () => {
    const newer = card(new Date('2026-09-29T12:00:00.000Z'))
    const lesson = { startedAt: '2026-09-29T08:00:00.000Z', updatedAt: '2026-09-29T11:00:00.000Z', lastSection: 7, doneAt: null }
    const env = await started([
      (c) =>
        okSync(c.body!, {
          cards: { received: 1, written: 0, unchanged: 0, stale: [{ wordId: 'termin', card: newer }] },
          lessons: { received: 1, written: 0, unchanged: 0, stale: [{ lessonId: 'l1', progress: lesson }] },
          newWordExtras: { received: 1, written: 0, unchanged: 0, stale: [{ localDay: '2026-09-29', extra: 8 }] },
        }),
    ])
    env.store.recordReview(entry(), card())
    env.store.saveLessonProgress({ version: 1, lessons: { l1: { ...lesson, updatedAt: '2026-09-29T10:00:00.000Z', lastSection: 1 } } })
    env.store.addExtraNewWords(5)
    await env.store.flush()
    const v = env.store.getView()
    expect(v.reviewState.cards.termin).toEqual(newer)
    expect(v.lessonProgress.lessons.l1.lastSection).toBe(7)
    expect(v.reviewState.newToday.extra).toBe(8)
    expect(env.store.getStatus().pending).toBe(0)
  })

  it('keeps a card that changed while its sync was on the way', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const env = await started([
      async (c) => {
        await gate
        return okSync(c.body!)
      },
      (c) => okSync(c.body!),
    ])
    env.store.recordReview(entry(), card())
    const flushing = env.store.flush()
    const later = card(new Date('2026-09-29T10:30:00.000Z'))
    env.store.recordReview(entry({ ts: '2026-09-29T10:30:00.000Z', isNew: false }), later)
    release()
    await flushing
    // The newer card and the second review went out in a follow-up batch.
    await env.store.flush()
    expect(env.calls.map((c) => c.path)).toEqual(['/v1/state?days=35', '/v1/sync', '/v1/sync'])
    expect((env.calls[2].body!.cards as { card: unknown }[])[0].card).toEqual(later)
    expect(env.store.getStatus().pending).toBe(0)
  })

  it('makes a 409 conflict a loud error, keeps the outbox, and pauses automatic syncs', async () => {
    const env = await started([() => apiError(409, 'conflict', { ids: ['x'] }), (c) => okSync(c.body!)])
    env.store.recordReview(entry(), card())
    await env.store.flush()
    expect(env.store.getStatus()).toMatchObject({ phase: 'error', pending: 2, blocked: true })
    expect(env.errors).toHaveLength(1)
    expect(env.errors[0]).toMatch(/Sync conflict.*\(x\).*stay on this device/)
    await env.store.flush()
    expect(env.calls).toHaveLength(2)
    await env.store.flush({ manual: true })
    expect(env.calls).toHaveLength(3)
    expect(env.store.getStatus()).toMatchObject({ phase: 'idle', pending: 0, blocked: false })
  })

  it('refreshes an expired token once and retries', async () => {
    const env = await started([() => apiError(401, 'token_expired'), (c) => okSync(c.body!)])
    env.store.recordReview(entry(), card())
    await env.store.flush()
    expect(env.calls.slice(1).map((c) => c.auth)).toEqual(['Bearer token', 'Bearer fresh-token'])
    expect(env.store.getStatus()).toMatchObject({ phase: 'idle', pending: 0 })
  })

  it('treats any other 401 as signed out, keeping the outbox', async () => {
    const env = await started([() => apiError(401, 'unauthorized')])
    env.store.recordReview(entry(), card())
    await env.store.flush()
    expect(env.signedOut()).toBe(1)
    expect(env.store.getStatus()).toMatchObject({ phase: 'error', pending: 2 })
  })

  it('goes offline without an error banner and sends the same ids again later (no duplicates)', async () => {
    const env = await started([
      () => 'network-error',
      (c) =>
        okSync(c.body!, {
          reviewEvents: { received: 1, inserted: 0, duplicates: 1 },
        }),
    ])
    env.store.recordReview(entry(), card())
    await env.store.flush()
    expect(env.store.getStatus()).toMatchObject({ phase: 'offline', pending: 2 })
    expect(env.errors).toEqual([])
    await env.store.flush()
    expect(env.calls[2].body).toEqual(env.calls[1].body)
    expect(env.store.getStatus()).toMatchObject({ phase: 'idle', pending: 0 })
    expect(env.store.getView().reviewLog).toHaveLength(1)
  })

  it('uses keepalive when the tab is hidden and the batch is small', async () => {
    const env = await started([(c) => okSync(c.body!)])
    env.store.recordReview(entry(), card())
    await env.store.flush({ keepalive: true })
    expect(env.calls[1].keepalive).toBe(true)
  })

  it('shows a server error loudly and retries it at the next flush', async () => {
    const env = await started([() => apiError(500, 'internal'), (c) => okSync(c.body!)])
    env.store.recordReview(entry(), card())
    await env.store.flush()
    expect(env.store.getStatus()).toMatchObject({ phase: 'error', blocked: false })
    expect(env.errors[0]).toMatch(/Sync failed: internal happened \(HTTP 500 internal, request req-1\)/)
    await env.store.flush()
    expect(env.store.getStatus()).toMatchObject({ phase: 'idle', pending: 0 })
  })

  it('refuses to send a practice review as a scheduled one, and the other way round', async () => {
    const env = await started()
    expect(() => env.store.recordReview(entry({ practice: true }), card())).toThrow(/recordPractice/)
    expect(() => env.store.recordPractice(entry())).toThrow(/practice: true/)
  })
})
