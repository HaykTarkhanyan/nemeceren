import { describe, expect, it } from 'vitest'
import type { Result, ReviewLogEntry } from '../content/schema.ts'
import {
  acceptedLocally,
  applySent,
  buildView,
  emptyOutbox,
  lockedRejections,
  nextBatch,
  outboxSize,
  parseOutbox,
  parseState,
  removeSent,
  sameJson,
  SYNC_LIMITS,
} from './outbox.ts'
import type { CustomWordRecord, NoteRecord, Outbox, ServerNote, ServerState, StudySession, StudySessionRecord, SyncResponse } from './outbox.ts'
import type { CustomWord } from '../content/schema.ts'
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
  notes: [],
  customWords: [],
  studySessions: [],
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
  notes: { received: 0, written: 0, unchanged: 0, stale: [] },
  customWords: { received: 0, written: 0, unchanged: 0, stale: [] },
  studySessions: { received: 0, written: 0, unchanged: 0, stale: [] },
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
    notes: [],
    customWords: [],
    studySessions: [],
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

// ---------- notes ----------

const noteRec = (text: string, updatedAt: string, over: Partial<NoteRecord> = {}): NoteRecord => ({
  text,
  localDay: '2026-09-29',
  createdAt: '2026-09-29T09:00:00.000Z',
  updatedAt,
  deletedAt: null,
  ...over,
})
const feedback = { summary: 'Gut! Look at [[wohne]].', hints: ['Check the verb.'], at: '2026-09-29T12:00:00.000Z' }
const serverNote = (id: string, rec: NoteRecord, fb: ServerNote['feedback'] = null): ServerNote => ({ ...rec, id, feedback: fb })

describe('notes in the outbox', () => {
  it('batches notes within the API limit and removes exactly what was sent', () => {
    const notes = Object.fromEntries(Array.from({ length: 55 }, (_, i) => [`n${String(i).padStart(2, '0')}`, noteRec(`Text ${i}`, '2026-09-29T09:00:00.000Z')]))
    const o: Outbox = { ...emptyOutbox(), notes }
    expect(outboxSize(o)).toBe(55)
    const b = nextBatch(o)!
    expect(b.notes).toHaveLength(SYNC_LIMITS.notes)
    expect(b.notes![0]).toEqual({ id: 'n00', ...notes.n00 })
    const changed = { ...o, notes: { ...o.notes, n01: noteRec('Changed while syncing', '2026-09-29T09:05:00.000Z') } }
    const left = removeSent(changed, b)
    expect(Object.keys(left.notes)).toEqual(['n01', 'n50', 'n51', 'n52', 'n53', 'n54'])
  })

  it('reads an outbox saved before notes existed (no "notes" key) as one without notes', () => {
    const { notes: _notes, ...old } = emptyOutbox()
    expect(parseOutbox('outbox', old).notes).toEqual({})
    expect(() => parseOutbox('outbox', { ...emptyOutbox(), notes: { n1: noteRec('   ', '2026-09-29T09:00:00.000Z') } })).toThrow(/outbox: notes\.n1\.text/)
  })
})

describe('notes: the lock rule', () => {
  const t1 = '2026-09-29T10:00:00.000Z'
  const t2 = '2026-09-29T11:00:00.000Z'

  it('shows the later version, but a note with feedback always as the server has it', () => {
    const s = server({
      notes: [
        serverNote('a', noteRec('Server a', t1)),
        serverNote('b', noteRec('Server b', t2)),
        serverNote('c', noteRec('Server c', t1), feedback),
        serverNote('d', noteRec('Server d', t1)),
      ],
    })
    const o: Outbox = {
      ...emptyOutbox(),
      notes: {
        a: noteRec('Local a', t2),
        b: noteRec('Local b', t1),
        c: noteRec('Local c', t2),
        d: noteRec('Server d', t2, { deletedAt: t2 }),
        e: noteRec('Local e', t1, { createdAt: '2026-09-29T09:30:00.000Z' }),
      },
    }
    const v = buildView(s, o, '2026-09-29')
    const byId = Object.fromEntries(v.notes.map((n) => [n.id, n]))
    expect(byId.a.text).toBe('Local a')
    expect(byId.b.text).toBe('Server b')
    expect(byId.c).toMatchObject({ text: 'Server c', feedback, pending: true })
    expect(byId.d).toBeUndefined() // deleted locally
    expect(byId.e).toMatchObject({ text: 'Local e', feedback: null, pending: true })
    // Newest first by creation time.
    expect(v.notes.map((n) => n.id)).toEqual(['e', 'a', 'b', 'c'])
  })

  it('keeps a locked note when a sync of a change comes back, and adopts the server version with its feedback', () => {
    const locked = serverNote('c', noteRec('Server c', t1), feedback)
    const sent = { notes: [{ id: 'c', ...noteRec('Edited c', t2) }, { id: 'x', ...noteRec('New x', t1) }] }
    const r = reply({ notes: { received: 2, written: 1, unchanged: 0, stale: [locked] } })
    // The device did not know about the feedback yet: the stale reply brings it.
    const after = applySent(server({ notes: [serverNote('c', noteRec('Server c', t1))] }), sent, r)
    expect(after.notes).toEqual([locked, serverNote('x', noteRec('New x', t1))])
    // The device knew: its locked note is not overwritten by what it sent.
    expect(applySent(server({ notes: [locked] }), { notes: [{ id: 'c', ...noteRec('Server c', t2) }] }, reply()).notes).toEqual([locked])
  })

  it('reports a refused change so the edited text is not lost silently', () => {
    const locked = serverNote('c', noteRec('Server c', t1), feedback)
    const r = reply({ notes: { received: 2, written: 0, unchanged: 0, stale: [locked, serverNote('d', noteRec('Server d', t2))] } })
    const sent = {
      notes: [
        { id: 'c', ...noteRec('Edited c', t2) },
        { id: 'd', ...noteRec('Older d', t1) },
      ],
    }
    expect(lockedRejections(sent, r)).toEqual([
      "Your note from 2026-09-29 already has Claude's feedback, so it is locked: your change was not saved. Your changed text was: Edited c",
    ])
    const deleted = { notes: [{ id: 'c', ...noteRec('Server c', t2, { deletedAt: t2 }) }] }
    expect(lockedRejections(deleted, reply({ notes: { received: 1, written: 0, unchanged: 0, stale: [locked] } }))).toEqual([
      "Your note from 2026-09-29 already has Claude's feedback, so it is locked: it was not deleted.",
    ])
  })

  it('reads notes and their feedback from the server state, and refuses bad feedback loudly', () => {
    const raw = {
      serverTime: t1,
      userId: 'u1',
      reviewEventsSince: t1,
      cards: {},
      reviewEvents: [],
      studyDays: [],
      attempts: [],
      lessonProgress: { version: 1, lessons: {} },
      newWordExtras: {},
      notes: [serverNote('c', noteRec('Server c', t1), feedback)],
      customWords: [],
      studySessions: [],
    }
    expect(parseState('state', raw).notes[0].feedback).toEqual(feedback)
    // The offline copy is the state as JSON; it must parse back the same.
    expect(parseState('copy', JSON.parse(JSON.stringify(parseState('state', raw))))).toEqual(parseState('state', raw))
    const broken = { ...raw, notes: [serverNote('c', noteRec('Server c', t1), { ...feedback, summary: 'an **open bold' })] }
    expect(() => parseState('state', broken)).toThrow(/state: notes\.0\.feedback\.summary/)
    const { notes: _n, ...noNotes } = raw
    expect(() => parseState('state', noNotes)).toThrow(/state: notes/)
  })

  it('accepts a guest change as it is (nothing stale)', () => {
    const after = applySent(server(), { notes: [{ id: 'x', ...noteRec('x', t1) }] }, acceptedLocally(t1))
    expect(after.notes.map((n) => n.text)).toEqual(['x'])
    expect(after.serverTime).toBe(t1)
  })
})

// ---------- custom words (Hayk's own words) ----------

const uid = (n: number) => `u-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const wordRec = (de: string, updatedAt: string, over: Partial<CustomWordRecord> = {}): CustomWordRecord => ({
  de,
  en: 'traffic jam',
  createdAt: '2026-09-29T09:00:00.000Z',
  updatedAt,
  ...over,
})
const okCheck = { at: '2026-09-29T12:00:00.000Z', ok: true }
const fixCheck = { at: '2026-09-29T12:00:00.000Z', ok: false, note: 'Nouns take der/die/das.', fixed: { de: 'der Stau' } }

describe('custom words in the outbox', () => {
  it('batches custom words within the API limit and removes exactly what was sent', () => {
    const customWords = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [uid(i), wordRec(`Wort ${i}`, '2026-09-29T09:00:00.000Z')]))
    const o: Outbox = { ...emptyOutbox(), customWords }
    expect(outboxSize(o)).toBe(25)
    const b = nextBatch(o)!
    expect(b.customWords).toHaveLength(SYNC_LIMITS.customWords)
    expect(b.customWords![0]).toEqual({ id: uid(0), ...customWords[uid(0)] })
    const changed = { ...o, customWords: { ...o.customWords, [uid(1)]: wordRec('Changed while syncing', '2026-09-29T09:05:00.000Z') } }
    const left = removeSent(changed, b)
    expect(Object.keys(left.customWords)).toEqual([uid(1), ...[20, 21, 22, 23, 24].map(uid)])
  })

  it('reads an outbox saved before custom words existed as one without them, and refuses a bad one loudly', () => {
    const { customWords: _w, ...old } = emptyOutbox()
    expect(parseOutbox('outbox', old).customWords).toEqual({})
    expect(() => parseOutbox('outbox', { ...emptyOutbox(), customWords: { [uid(1)]: wordRec('  ', '2026-09-29T09:00:00.000Z') } })).toThrow(
      /outbox: customWords\.u-.*\.de/,
    )
    // Claude's check is never part of an upload.
    expect(() => parseOutbox('outbox', { ...emptyOutbox(), customWords: { [uid(1)]: { ...wordRec('Stau', '2026-09-29T09:00:00.000Z'), check: okCheck } } })).toThrow(
      /check/,
    )
  })
})

describe('custom words: merge and Claude\'s check', () => {
  const t1 = '2026-09-29T10:00:00.000Z'
  const t2 = '2026-09-29T11:00:00.000Z'
  const serverWord = (n: number, rec: CustomWordRecord, check?: CustomWord['check']): CustomWord => ({ id: uid(n), ...rec, ...(check ? { check } : {}) })

  it('shows the later version; an edit clears the check, a delete keeps it, and deleted words are hidden', () => {
    const s = server({
      customWords: [
        serverWord(1, wordRec('Stau', t1), fixCheck),
        serverWord(2, wordRec('Server newer', t2)),
        serverWord(3, wordRec('Termin', t1), okCheck),
        serverWord(4, wordRec('Weg', t1), okCheck),
      ],
    })
    const o: Outbox = {
      ...emptyOutbox(),
      customWords: {
        [uid(1)]: wordRec('der Stau', t2),
        [uid(2)]: wordRec('Local older', t1),
        [uid(3)]: wordRec('Termin', t2, { deletedAt: t2 }),
        [uid(4)]: wordRec('Weg', t2),
      },
    }
    const v = buildView(s, o, '2026-09-29')
    expect(v.customWords.map((w) => [w.id, w.de, w.check ?? null, w.pending])).toEqual([
      // Edited: the check no longer matches, so it is gone and Claude looks again.
      [uid(1), 'der Stau', null, true],
      // The server's newer version wins.
      [uid(2), 'Server newer', null, true],
      // uid(3) is deleted. uid(4) was saved again unchanged (a later time only): the check stays.
      [uid(4), 'Weg', okCheck, true],
    ])
  })

  it('applies a sync reply: what was sent, the server\'s newer versions (stale), and keeps a check the upload did not touch', () => {
    const s = server({ customWords: [serverWord(1, wordRec('Stau', t1), okCheck)] })
    const newer = serverWord(2, wordRec('Server version', t2), fixCheck)
    const after = applySent(
      s,
      { customWords: [{ id: uid(1), ...wordRec('Stau', t2, { deletedAt: t2 }) }, { id: uid(2), ...wordRec('Mine', t1) }, { id: uid(3), ...wordRec('Neu', t1) }] },
      reply({ customWords: { received: 3, written: 2, unchanged: 0, stale: [newer] } }),
    )
    expect(after.customWords).toEqual([
      { id: uid(1), ...wordRec('Stau', t2, { deletedAt: t2 }), check: okCheck },
      newer,
      { id: uid(3), ...wordRec('Neu', t1) },
    ])
  })

  it('reads custom words and their checks from the server state, and refuses a bad check loudly', () => {
    const raw = { ...server(), customWords: [serverWord(1, wordRec('Stau', t1), fixCheck)] }
    expect(parseState('state', JSON.parse(JSON.stringify(raw))).customWords[0].check).toEqual(fixCheck)
    const bad = { ...raw, customWords: [serverWord(1, wordRec('Stau', t1), { at: t1, ok: false })] }
    expect(() => parseState('state', bad)).toThrow(/customWords\.0\.check\.fixed/)
    const okWithFix = { ...raw, customWords: [serverWord(1, wordRec('Stau', t1), { at: t1, ok: true, fixed: { de: 'der Stau' } })] }
    expect(() => parseState('state', okWithFix)).toThrow(/a check that is ok has no corrections/)
    const badId = { ...raw, customWords: [{ ...serverWord(1, wordRec('Stau', t1)), id: 'stau' }] }
    expect(() => parseState('state', badId)).toThrow(/customWords\.0\.id/)
  })

  it('does not count custom words against today\'s new-word limit', () => {
    const s = server({
      reviewEvents: [
        { ...entry(), id: 'e1' },
        { ...entry({ wordId: uid(1), de: 'der Stau' }), id: 'e2' },
      ],
    })
    expect(buildView(s, emptyOutbox(), '2026-09-29').reviewState.newToday).toEqual({ date: '2026-09-29', count: 1 })
  })
})

// ---------- study sessions ----------

const sid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sessionRec = (localDay: string, updatedAt: string, over: Partial<StudySessionRecord> = {}): StudySessionRecord => ({
  startedAt: `${localDay}T08:00:00.000Z`,
  endedAt: `${localDay}T09:00:00.000Z`,
  activeMs: 45 * 60_000,
  localDay,
  createdAt: `${localDay}T09:00:00.000Z`,
  updatedAt,
  ...over,
})
const serverSession = (n: number, rec: StudySessionRecord): StudySession => ({ id: sid(n), ...rec })

describe('study sessions in the outbox', () => {
  it('batches sessions within the API limit and removes exactly what was sent', () => {
    const studySessions = Object.fromEntries(
      Array.from({ length: 105 }, (_, i) => [sid(i), sessionRec('2026-09-29', '2026-09-29T09:00:00.000Z')]),
    )
    const o: Outbox = { ...emptyOutbox(), studySessions }
    expect(outboxSize(o)).toBe(105)
    const b = nextBatch(o)!
    expect(Object.keys(b)).toEqual(['studySessions'])
    expect(b.studySessions).toHaveLength(SYNC_LIMITS.studySessions)
    expect(b.studySessions![0]).toEqual({ id: sid(0), ...studySessions[sid(0)] })
    // Edited while the batch was on its way: it stays for the next sync.
    const changed = { ...o, studySessions: { ...o.studySessions, [sid(1)]: sessionRec('2026-09-29', '2026-09-29T10:00:00.000Z', { label: 'later' }) } }
    const left = removeSent(changed, b)
    expect(Object.keys(left.studySessions)).toEqual([sid(1), ...[100, 101, 102, 103, 104].map(sid)])
  })

  it('reads an outbox saved before study sessions existed as one without them, and refuses a bad one loudly', () => {
    const { studySessions: _x, ...old } = emptyOutbox()
    expect(parseOutbox('outbox', old).studySessions).toEqual({})
    const tooLong = sessionRec('2026-09-29', '2026-09-29T09:00:00.000Z', { activeMs: 61 * 60_000 })
    expect(() => parseOutbox('outbox', { ...emptyOutbox(), studySessions: { [sid(1)]: tooLong } })).toThrow(
      /outbox: studySessions\..*\.activeMs: is longer than the time from startedAt to endedAt/,
    )
    const blank = sessionRec('2026-09-29', '2026-09-29T09:00:00.000Z', { label: '  ' })
    expect(() => parseOutbox('outbox', { ...emptyOutbox(), studySessions: { [sid(1)]: blank } })).toThrow(/label/)
  })
})

describe('study sessions: merge, view and study days', () => {
  const t1 = '2026-09-29T09:00:00.000Z'
  const t2 = '2026-09-29T11:00:00.000Z'

  it('shows the later version of each session, hides deleted ones, and lists them newest first', () => {
    const s = server({
      studySessions: [
        serverSession(1, sessionRec('2026-09-27', t1, { label: 'server' })),
        serverSession(2, sessionRec('2026-09-28', t2, { label: 'server newer' })),
        serverSession(3, sessionRec('2026-09-26', t1)),
      ],
    })
    const o: Outbox = {
      ...emptyOutbox(),
      studySessions: {
        [sid(1)]: sessionRec('2026-09-27', t2, { label: 'edited here', activeMs: 30 * 60_000 }),
        [sid(2)]: sessionRec('2026-09-28', t1, { label: 'local older' }),
        [sid(3)]: sessionRec('2026-09-26', t2, { deletedAt: t2 }),
        [sid(4)]: sessionRec('2026-09-29', t1, { manual: true }),
      },
    }
    const v = buildView(s, o, '2026-09-29')
    expect(v.studySessions.map((x) => [x.id, x.localDay, x.label ?? null, x.activeMs / 60_000, x.pending])).toEqual([
      [sid(4), '2026-09-29', null, 45, true],
      [sid(2), '2026-09-28', 'server newer', 45, true],
      [sid(1), '2026-09-27', 'edited here', 30, true],
    ])
  })

  it('makes a day with a session a study day, but not one whose only session is deleted', () => {
    const s = server({ studyDays: ['2026-09-20'] })
    const o: Outbox = {
      ...emptyOutbox(),
      studySessions: {
        [sid(1)]: sessionRec('2026-09-28', t1, { manual: true }),
        [sid(2)]: sessionRec('2026-09-27', t2, { deletedAt: t2 }),
      },
    }
    expect(buildView(s, o, '2026-09-29').studyDays).toEqual(['2026-09-20', '2026-09-28'])
  })

  it("applies a sync reply: what was sent and the server's newer versions (stale), and adds the study days", () => {
    const s = server({ studySessions: [serverSession(1, sessionRec('2026-09-27', t1))] })
    const newer = serverSession(2, sessionRec('2026-09-28', t2, { label: 'from the phone' }))
    const after = applySent(
      s,
      {
        studySessions: [
          { id: sid(1), ...sessionRec('2026-09-27', t2, { deletedAt: t2 }) },
          { id: sid(2), ...sessionRec('2026-09-28', t1) },
          { id: sid(3), ...sessionRec('2026-09-29', t1, { label: 'lesson 0.3' }) },
        ],
      },
      reply({ studySessions: { received: 3, written: 2, unchanged: 0, stale: [newer] } }),
    )
    expect(after.studySessions).toEqual([
      { id: sid(1), ...sessionRec('2026-09-27', t2, { deletedAt: t2 }) },
      newer,
      { id: sid(3), ...sessionRec('2026-09-29', t1, { label: 'lesson 0.3' }) },
    ])
    expect(after.studyDays).toEqual(['2026-09-28', '2026-09-29'])
    expect(buildView(after, emptyOutbox(), '2026-09-29').studySessions.map((x) => x.id)).toEqual([sid(3), sid(2)])
  })

  it('reads sessions from the server state, and refuses a bad one loudly', () => {
    const raw = { ...server(), studySessions: [serverSession(1, sessionRec('2026-09-29', t1, { manual: true, label: 'Schritte' }))] }
    expect(parseState('state', JSON.parse(JSON.stringify(raw))).studySessions).toEqual(raw.studySessions)
    const bad = { ...raw, studySessions: [{ ...raw.studySessions[0], endedAt: '2026-09-29T07:00:00.000Z' }] }
    expect(() => parseState('state', bad)).toThrow(/studySessions\.0\.endedAt: is before startedAt/)
    const manualFalse = { ...raw, studySessions: [{ ...raw.studySessions[0], manual: false }] }
    expect(() => parseState('state', manualFalse)).toThrow(/studySessions\.0\.manual/)
  })
})
