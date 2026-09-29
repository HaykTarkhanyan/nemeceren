import { describe, expect, it } from 'vitest'
import type { Result, ReviewLogEntry } from '../content/schema.ts'
import {
  applySent,
  buildView,
  emptyOutbox,
  nextBatch,
  outboxSize,
  parseOutbox,
  parseState,
  removeSent,
  sameJson,
  SYNC_LIMITS,
} from './outbox.ts'
import type { Outbox, ServerState, SyncResponse } from './outbox.ts'
import { emptyState, Rating, review } from './srs.ts'

const t0 = new Date('2026-09-29T10:00:00Z')
const card = (at: Date) => review(emptyState(at), 'x', Rating.Good, at).after

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

const result = (over: Partial<Result> = {}): Result => ({
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
  ...over,
})

const server = (over: Partial<ServerState> = {}): ServerState => ({
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

const reply = (over: Partial<SyncResponse> = {}): SyncResponse => ({
  ok: true,
  serverTime: '2026-09-29T10:01:00.000Z',
  reviewEvents: { received: 0, inserted: 0, duplicates: 0 },
  cards: { received: 0, written: 0, unchanged: 0, stale: [] },
  attempts: { received: 0, inserted: 0, duplicates: 0 },
  lessons: { received: 0, written: 0, unchanged: 0, stale: [] },
  newWordExtras: { received: 0, written: 0, unchanged: 0, stale: [] },
  ...over,
})

const lesson = (updatedAt: string, lastSection = 0) => ({ startedAt: '2026-09-29T08:00:00.000Z', updatedAt, lastSection, doneAt: null })

describe('batches', () => {
  it('sends nothing for an empty outbox', () => {
    expect(nextBatch(emptyOutbox())).toBeNull()
    expect(outboxSize(emptyOutbox())).toBe(0)
  })

  it('leaves empty lists out and keeps within the API limits', () => {
    const o: Outbox = {
      ...emptyOutbox(),
      attempts: Array.from({ length: 25 }, (_, i) => ({ ...result(), id: `a${i}`, localDay: '2026-09-29' })),
      newWordExtras: { '2026-09-29': 5 },
    }
    const b = nextBatch(o)!
    expect(Object.keys(b).sort()).toEqual(['attempts', 'newWordExtras'])
    expect(b.attempts).toHaveLength(SYNC_LIMITS.attempts)
    const rest = removeSent(o, b)
    expect(rest.attempts.map((a) => a.id)).toEqual(['a20', 'a21', 'a22', 'a23', 'a24'])
    expect(nextBatch(rest)!.attempts).toHaveLength(5)
  })

  it('removes exactly what was sent, keeping cards, lessons and extras changed since', () => {
    const o: Outbox = {
      ...emptyOutbox(),
      reviewEvents: [{ ...entry(), id: 'e1', localDay: '2026-09-29' }],
      cards: { termin: card(t0), uhr: card(t0) },
      lessons: { l1: lesson('2026-09-29T10:00:00.000Z') },
      newWordExtras: { '2026-09-29': 5 },
    }
    const sent = nextBatch(o)!
    const changed: Outbox = {
      ...o,
      reviewEvents: [...o.reviewEvents, { ...entry(), id: 'e2', localDay: '2026-09-29' }],
      cards: { ...o.cards, uhr: card(new Date('2026-09-29T11:00:00Z')) },
      lessons: { l1: lesson('2026-09-29T10:05:00.000Z', 3) },
      newWordExtras: { '2026-09-29': 10 },
    }
    const left = removeSent(changed, sent)
    expect(left.reviewEvents.map((e) => e.id)).toEqual(['e2'])
    expect(Object.keys(left.cards)).toEqual(['uhr'])
    expect(left.lessons.l1.lastSection).toBe(3)
    expect(left.newWordExtras).toEqual({ '2026-09-29': 10 })
  })

  it('compares JSON ignoring key order', () => {
    expect(sameJson({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true)
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false)
  })
})

describe('the server reply', () => {
  it('adds what was sent and adopts the newer versions the server kept (stale)', () => {
    const mine = card(t0)
    const newer = card(new Date('2026-09-29T12:00:00Z'))
    const sent = {
      reviewEvents: [{ ...entry(), id: 'e1', localDay: '2026-09-29' }],
      cards: [
        { wordId: 'termin', card: mine },
        { wordId: 'uhr', card: mine },
      ],
      attempts: [{ ...result(), id: 'a1', localDay: '2026-09-29' }],
      lessons: [{ lessonId: 'l1', ...lesson('2026-09-29T10:00:00.000Z') }],
      newWordExtras: [{ localDay: '2026-09-29', extra: 5 }],
    }
    const after = applySent(
      server({ studyDays: ['2026-09-28'] }),
      sent,
      reply({
        cards: { received: 2, written: 1, unchanged: 0, stale: [{ wordId: 'uhr', card: newer }] },
        lessons: { received: 1, written: 0, unchanged: 0, stale: [{ lessonId: 'l1', progress: lesson('2026-09-29T11:00:00.000Z', 7) }] },
        newWordExtras: { received: 1, written: 0, unchanged: 0, stale: [{ localDay: '2026-09-29', extra: 8 }] },
      }),
    )
    expect(after.cards).toEqual({ termin: mine, uhr: newer })
    expect(after.lessonProgress.lessons.l1.lastSection).toBe(7)
    expect(after.newWordExtras).toEqual({ '2026-09-29': 8 })
    expect(after.reviewEvents.map((e) => e.id)).toEqual(['e1'])
    expect(after.attempts.map((a) => a.id)).toEqual(['a1'])
    expect(after.studyDays).toEqual(['2026-09-28', '2026-09-29'])
    expect(after.serverTime).toBe('2026-09-29T10:01:00.000Z')
  })

  it('does not duplicate an event or attempt the server already had', () => {
    const s = server({ reviewEvents: [{ ...entry(), id: 'e1' }], attempts: [{ ...result(), id: 'a1' }] })
    const after = applySent(s, { reviewEvents: [{ ...entry(), id: 'e1', localDay: '2026-09-29' }], attempts: [{ ...result(), id: 'a1', localDay: '2026-09-29' }] }, reply())
    expect(after.reviewEvents).toHaveLength(1)
    expect(after.attempts).toHaveLength(1)
  })
})

describe('the local view', () => {
  it('merges the server state with the outbox and derives newToday', () => {
    const older = card(t0)
    const later = card(new Date('2026-09-29T11:00:00Z'))
    const s = server({
      cards: { termin: later, uhr: older },
      reviewEvents: [
        { ...entry(), id: 'e1' },
        { ...entry({ practice: true, isNew: false }), id: 'e2' },
        { ...entry({ localDay: '2026-09-28', ts: '2026-09-28T10:00:00.000Z' }), id: 'e3' },
      ],
      attempts: [{ ...result({ submittedAt: '2026-09-29T08:00:00.000Z' }), id: 'a1' }],
      lessonProgress: { version: 1, lessons: { l1: lesson('2026-09-29T10:00:00.000Z', 2) } },
      newWordExtras: { '2026-09-29': 5 },
      studyDays: ['2026-09-28', '2026-09-29'],
    })
    const o: Outbox = {
      ...emptyOutbox(),
      reviewEvents: [{ ...entry({ ts: '2026-09-29T10:30:00.000Z', wordId: 'uhr' }), id: 'e4', localDay: '2026-09-29' }],
      cards: { termin: older, uhr: later },
      attempts: [{ ...result(), id: 'a2', localDay: '2026-09-30' }],
      lessons: { l1: lesson('2026-09-29T09:00:00.000Z', 9) },
      newWordExtras: { '2026-09-29': 3 },
    }
    const v = buildView(s, o, '2026-09-29')
    // Per word the later last review wins, whichever side it is on.
    expect(v.reviewState.cards).toEqual({ termin: later, uhr: later })
    // Today's new words: e1 and e4 (e2 is practice, e3 is yesterday); the larger extra wins.
    expect(v.reviewState.newToday).toEqual({ date: '2026-09-29', count: 2, extra: 5 })
    expect(v.reviewLog.map((e) => e.ts)).toEqual(['2026-09-28T10:00:00.000Z', '2026-09-29T10:00:00.000Z', '2026-09-29T10:00:00.000Z', '2026-09-29T10:30:00.000Z'])
    expect(v.reviewLog.every((e) => !('id' in e))).toBe(true)
    expect(v.results.map((r) => r.id)).toEqual(['a2', 'a1'])
    expect(v.pendingAttemptIds).toEqual(['a2'])
    // The lesson record with the later updatedAt wins (here the server's).
    expect(v.lessonProgress.lessons.l1.lastSection).toBe(2)
    expect(v.studyDays).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
  })

  it('leaves extra out when there is none today', () => {
    expect(buildView(server(), emptyOutbox(), '2026-09-29').reviewState.newToday).toEqual({ date: '2026-09-29', count: 0 })
  })
})

describe('parsing', () => {
  const raw = {
    serverTime: '2026-09-29T10:00:00.000Z',
    userId: 'u1',
    reviewEventsSince: '2026-08-25T10:00:00.000Z',
    cards: {},
    reviewEvents: [{ id: 'e1', ...entry() }],
    studyDays: ['2026-09-29'],
    attempts: [{ id: 'a1', ...result() }],
    lessonProgress: { version: 1, lessons: {} },
    newWordExtras: { '2026-09-29': 5 },
  }

  it('reads the server state into the app types, keeping the ids', () => {
    const s = parseState('state', raw)
    expect(s.reviewEvents[0].id).toBe('e1')
    expect(s.attempts[0]).toMatchObject({ id: 'a1', testId: 't1' })
  })

  it('names the field of anything it does not understand', () => {
    expect(() => parseState('state', { ...raw, reviewEvents: [{ id: 'e1', ...entry(), rating: 9 }] })).toThrow(/state reviewEvents line 1: rating/)
    expect(() => parseState('state', { ...raw, studyDays: ['yesterday'] })).toThrow(/state: studyDays\.0/)
  })

  it('reads a stored outbox and refuses a damaged one loudly', () => {
    const o = { ...emptyOutbox(), reviewEvents: [{ ...entry(), id: 'e1', localDay: '2026-09-29' }] }
    expect(parseOutbox('outbox', JSON.parse(JSON.stringify(o)))).toEqual(o)
    expect(() => parseOutbox('outbox', { ...o, cards: { termin: { due: 'soon' } } })).toThrow(/outbox: cards\.termin/)
    expect(() => parseOutbox('outbox', { ...o, attempts: [{ id: 'a1', ...result(), review: { gradedAt: '2026-09-29T10:00:00Z', summary: 's', items: [] } }] })).toThrow(
      /cannot have a review/,
    )
  })
})
