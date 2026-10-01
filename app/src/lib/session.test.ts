// Guest mode through the app's real wiring (session.ts + the app's progress store and study timer):
// no call to the auth module, no fetch, no browser storage. The auth module is replaced by spies
// that fail loudly.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Result } from '../content/schema.ts'

const auth = vi.hoisted(() => {
  const refuse = (what: string) => async () => {
    throw new Error(`guest code called ${what}`)
  }
  return {
    currentUser: vi.fn(refuse('currentUser')),
    signIn: vi.fn(refuse('signIn')),
    signOut: vi.fn(refuse('signOut')),
    signUp: vi.fn(refuse('signUp')),
    getToken: vi.fn(refuse('getToken')),
  }
})
vi.mock('./auth.ts', () => ({ ...auth, AuthFailure: class AuthFailure extends Error {} }))

import { continueAsGuest, leaveGuest } from './session.ts'
import { emptyState, Rating, review } from './srs.ts'
import { progressStore } from './storage.ts'
import { planStop, timerStore } from './timer.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const result: Result = {
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
}

describe('guest mode in the app', () => {
  it('makes no auth or API request and stores nothing in the browser', async () => {
    const fetchSpy = vi.fn()
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0 }
    vi.stubGlobal('window', { fetch: fetchSpy, localStorage: storage })
    vi.stubGlobal('localStorage', storage)

    continueAsGuest()
    const store = progressStore()
    expect(store.isGuest()).toBe(true)
    const at = new Date()
    store.recordReview(
      {
        ts: at.toISOString(),
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
        due: at.toISOString(),
      },
      review(emptyState(at), 'termin', Rating.Good, at).after,
    )
    store.saveResult(result)
    await store.flush({ manual: true })
    expect(store.getView().results).toHaveLength(1)

    // The study timer runs in memory: start, pause, resume, stop and save a session.
    const timer = timerStore()
    expect(timer.getSnapshot()).toEqual({ attached: true, state: null })
    timer.start()
    timer.pause()
    timer.resume()
    const running = timer.getSnapshot().state!
    const plan = planStop(running, running.startedAt + 25 * 60_000)
    store.saveStudySession({ startedAt: new Date(plan.startedAt).toISOString(), endedAt: new Date(plan.endedAt).toISOString(), activeMs: plan.activeMs, label: 'guest' })
    timer.clear()
    store.addManualStudySession('2026-09-29', 10, '')
    expect(store.getView().studySessions).toHaveLength(2)
    timer.start()

    leaveGuest()
    expect(store.isGuest()).toBe(false)
    expect(store.hasView()).toBe(false)
    // Leaving guest mode drops the running guest timer too.
    expect(timer.getSnapshot()).toEqual({ attached: false, state: null })

    expect(fetchSpy).not.toHaveBeenCalled()
    for (const fn of Object.values(auth)) expect(fn).not.toHaveBeenCalled()
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })
})
