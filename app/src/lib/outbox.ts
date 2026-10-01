// Pure logic of progress sync (no network, no storage): the outbox of changes not sent yet,
// batching within the API limits, applying the API's reply, parsing GET /v1/state, and the
// local view = the server's state plus whatever is still in the outbox.
// Merge rules are the backend's (backend/README.md, DECISIONS.md #36): per word the card with the
// later last_review wins, per lesson the later updatedAt, per day the larger extra, per note the
// later updatedAt unless the server's note has Claude's feedback (then it is locked and the
// server's version stands), per custom word the later updatedAt (an edit clears Claude's check,
// a delete keeps it), per study session the later updatedAt; events and attempts are identified
// by client-made UUIDs, so a resend is harmless.
import { z } from 'zod'
import {
  CustomWord as CustomWordSchema,
  CustomWordFields as CustomWordFieldsShape,
  IsoDate,
  IsoDateTime,
  NoteFeedback as NoteFeedbackSchema,
  NoteText,
  StoredCard as StoredCardSchema,
  StudySession as StudySessionSchema,
  StudySessionRecord as StudySessionRecordSchema,
} from '../content/schema.ts'
import type {
  CustomWord,
  LessonProgress,
  NoteFeedback,
  Result,
  ReviewLogEntry,
  ReviewState,
  StoredCard,
  StudySession,
  StudySessionRecord,
} from '../content/schema.ts'
import { ContentError, parseLessonProgress, parseResult, parseReviewLog } from '../content/validate.ts'
import { isCustomWordId, sameFields } from './customWords.ts'
import type { CustomWordFields } from './customWords.ts'
import { laterCard } from './srs.ts'

export type LessonRecord = LessonProgress['lessons'][string]
export type ReviewEventUpload = ReviewLogEntry & { id: string; localDay: string }
export type AttemptUpload = Omit<Result, 'review'> & { id: string; localDay: string }
export type ServerEvent = ReviewLogEntry & { id: string }
export type ServerAttempt = Result & { id: string }

/** A note as the app writes it (the upload, without the id). deletedAt is a soft delete. */
export interface NoteRecord {
  text: string
  localDay: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
/** A note as the server has it: with Claude's feedback, or null. */
export type ServerNote = NoteRecord & { id: string; feedback: NoteFeedback | null }

/** A custom word as the app writes it (the upload, without the id and without Claude's check). deletedAt is a soft delete. */
export type CustomWordRecord = CustomWordFields & { createdAt: string; updatedAt: string; deletedAt?: string }

/** StudySessionRecord: a study session as the app writes it (the upload, without the id); deletedAt is a soft delete. */
export type { StudySession, StudySessionRecord }

export interface Outbox {
  version: 1
  reviewEvents: ReviewEventUpload[]
  /** Latest local card per word. */
  cards: Record<string, StoredCard>
  attempts: AttemptUpload[]
  /** Latest local record per lesson. */
  lessons: Record<string, LessonRecord>
  /** Extra new words per local day. */
  newWordExtras: Record<string, number>
  /** Latest local record per note id. */
  notes: Record<string, NoteRecord>
  /** Latest local record per custom word id. */
  customWords: Record<string, CustomWordRecord>
  /** Latest local record per study session id. */
  studySessions: Record<string, StudySessionRecord>
}

export function emptyOutbox(): Outbox {
  return { version: 1, reviewEvents: [], cards: {}, attempts: [], lessons: {}, newWordExtras: {}, notes: {}, customWords: {}, studySessions: {} }
}

export function outboxSize(o: Outbox): number {
  return (
    o.reviewEvents.length +
    Object.keys(o.cards).length +
    o.attempts.length +
    Object.keys(o.lessons).length +
    Object.keys(o.newWordExtras).length +
    Object.keys(o.notes).length +
    Object.keys(o.customWords).length +
    Object.keys(o.studySessions).length
  )
}

export function isOutboxEmpty(o: Outbox): boolean {
  return outboxSize(o) === 0
}

/** Equality of two JSON values, ignoring key order. */
export function sameJson(a: unknown, b: unknown): boolean {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
          )
        : v
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b))
}

// ---------- batches (POST /v1/sync) ----------

/** The API's per-request limits (backend/src/config.ts SYNC_LIMITS). */
export const SYNC_LIMITS = { reviewEvents: 1000, cards: 2000, attempts: 20, lessons: 500, newWordExtras: 31, notes: 50, customWords: 20, studySessions: 100 } as const

export interface SyncBatch {
  reviewEvents?: ReviewEventUpload[]
  cards?: { wordId: string; card: StoredCard }[]
  attempts?: AttemptUpload[]
  lessons?: (LessonRecord & { lessonId: string })[]
  newWordExtras?: { localDay: string; extra: number }[]
  notes?: (NoteRecord & { id: string })[]
  customWords?: (CustomWordRecord & { id: string })[]
  studySessions?: (StudySessionRecord & { id: string })[]
}

/** The next request's worth of the outbox (empty lists left out), or null when there is nothing to send. */
export function nextBatch(o: Outbox): SyncBatch | null {
  const b: SyncBatch = {}
  const events = o.reviewEvents.slice(0, SYNC_LIMITS.reviewEvents)
  if (events.length) b.reviewEvents = events
  const cards = Object.keys(o.cards)
    .sort()
    .slice(0, SYNC_LIMITS.cards)
    .map((wordId) => ({ wordId, card: o.cards[wordId] }))
  if (cards.length) b.cards = cards
  const attempts = o.attempts.slice(0, SYNC_LIMITS.attempts)
  if (attempts.length) b.attempts = attempts
  const lessons = Object.keys(o.lessons)
    .sort()
    .slice(0, SYNC_LIMITS.lessons)
    .map((lessonId) => ({ lessonId, ...o.lessons[lessonId] }))
  if (lessons.length) b.lessons = lessons
  const extras = Object.keys(o.newWordExtras)
    .sort()
    .slice(0, SYNC_LIMITS.newWordExtras)
    .map((localDay) => ({ localDay, extra: o.newWordExtras[localDay] }))
  if (extras.length) b.newWordExtras = extras
  const notes = Object.keys(o.notes)
    .sort()
    .slice(0, SYNC_LIMITS.notes)
    .map((id) => ({ id, ...o.notes[id] }))
  if (notes.length) b.notes = notes
  const words = Object.keys(o.customWords)
    .sort()
    .slice(0, SYNC_LIMITS.customWords)
    .map((id) => ({ id, ...o.customWords[id] }))
  if (words.length) b.customWords = words
  const sessions = Object.keys(o.studySessions)
    .sort()
    .slice(0, SYNC_LIMITS.studySessions)
    .map((id) => ({ id, ...o.studySessions[id] }))
  if (sessions.length) b.studySessions = sessions
  return Object.keys(b).length > 0 ? b : null
}

/**
 * The outbox after the API accepted a batch: events and attempts that were sent are gone; a card,
 * lesson or extra is gone only if it has not changed locally since it was sent.
 */
export function removeSent(o: Outbox, sent: SyncBatch): Outbox {
  const eventIds = new Set((sent.reviewEvents ?? []).map((e) => e.id))
  const attemptIds = new Set((sent.attempts ?? []).map((a) => a.id))
  const cards = { ...o.cards }
  for (const c of sent.cards ?? []) if (sameJson(cards[c.wordId], c.card)) delete cards[c.wordId]
  const lessons = { ...o.lessons }
  for (const { lessonId, ...rec } of sent.lessons ?? []) if (sameJson(lessons[lessonId], rec)) delete lessons[lessonId]
  const extras = { ...o.newWordExtras }
  for (const x of sent.newWordExtras ?? []) if (extras[x.localDay] === x.extra) delete extras[x.localDay]
  const notes = { ...o.notes }
  for (const { id, ...rec } of sent.notes ?? []) if (sameJson(notes[id], rec)) delete notes[id]
  const customWords = { ...o.customWords }
  for (const { id, ...rec } of sent.customWords ?? []) if (sameJson(customWords[id], rec)) delete customWords[id]
  const studySessions = { ...o.studySessions }
  for (const { id, ...rec } of sent.studySessions ?? []) if (sameJson(studySessions[id], rec)) delete studySessions[id]
  return {
    version: 1,
    reviewEvents: o.reviewEvents.filter((e) => !eventIds.has(e.id)),
    cards,
    attempts: o.attempts.filter((a) => !attemptIds.has(a.id)),
    lessons,
    newWordExtras: extras,
    notes,
    customWords,
    studySessions,
  }
}

// ---------- API replies ----------

const LessonRecordSchema = z.strictObject({
  startedAt: IsoDateTime,
  updatedAt: IsoDateTime,
  lastSection: z.number().int().nonnegative(),
  doneAt: IsoDateTime.nullable(),
})

const NoteRecordSchema = z.strictObject({
  text: NoteText,
  localDay: IsoDate,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable(),
})

const ServerNoteSchema = NoteRecordSchema.extend({ id: z.string().min(1), feedback: NoteFeedbackSchema.nullable() })

/** A custom word in the outbox: the upload, so no check. */
const CustomWordRecordSchema = z.strictObject({ ...CustomWordFieldsShape, createdAt: IsoDateTime, updatedAt: IsoDateTime, deletedAt: IsoDateTime.optional() })

const Inserts = z.object({ received: z.number(), inserted: z.number(), duplicates: z.number() })
const upserts = <T extends z.ZodType>(stale: T) =>
  z.object({ received: z.number(), written: z.number(), unchanged: z.number(), stale: z.array(stale) })

export const SyncResponse = z.object({
  ok: z.literal(true),
  serverTime: IsoDateTime,
  reviewEvents: Inserts,
  cards: upserts(z.object({ wordId: z.string(), card: StoredCardSchema })),
  attempts: Inserts,
  lessons: upserts(z.object({ lessonId: z.string(), progress: LessonRecordSchema })),
  newWordExtras: upserts(z.object({ localDay: IsoDate, extra: z.number().int().nonnegative() })),
  notes: upserts(ServerNoteSchema),
  customWords: upserts(CustomWordSchema),
  studySessions: upserts(StudySessionSchema),
})
export type SyncResponse = z.infer<typeof SyncResponse>

function describeIssues(what: string, error: z.ZodError): string {
  return error.issues.map((i) => `${what}: ${i.path.join('.') || '(top level)'}: ${i.message}`).join('\n')
}

export function parseSyncResponse(data: unknown): SyncResponse {
  const r = SyncResponse.safeParse(data)
  if (!r.success) throw new ContentError([describeIssues('sync reply', r.error)])
  return r.data
}

/** What GET /v1/state returns (backend/README.md), parsed into the app's own types. */
export interface ServerState {
  serverTime: string
  userId: string
  reviewEventsSince: string
  cards: Record<string, StoredCard>
  reviewEvents: ServerEvent[]
  studyDays: string[]
  attempts: ServerAttempt[]
  lessonProgress: LessonProgress
  newWordExtras: Record<string, number>
  /** In the API's shape, so the offline copy parses like a reply. GET /v1/state leaves deleted notes out; after a sync a deleted one may be here with deletedAt. */
  notes: ServerNote[]
  /** The same for custom words: GET /v1/state leaves deleted ones out, a sync may add one with deletedAt. */
  customWords: CustomWord[]
  /** Study sessions that started in the window (as reviewEvents); a deleted one only after a sync. */
  studySessions: StudySession[]
}

const StateEnvelope = z.object({
  serverTime: IsoDateTime,
  userId: z.string().min(1),
  reviewEventsSince: IsoDateTime,
  cards: z.record(z.string(), StoredCardSchema),
  reviewEvents: z.array(z.object({ id: z.string().min(1) }).loose()),
  studyDays: z.array(IsoDate),
  attempts: z.array(z.object({ id: z.string().min(1) }).loose()),
  lessonProgress: z.unknown(),
  newWordExtras: z.record(z.string(), z.number().int().nonnegative()),
  notes: z.array(ServerNoteSchema),
  customWords: z.array(CustomWordSchema),
  studySessions: z.array(StudySessionSchema),
})

/** Validates the server state (or the offline copy of it); every problem names its field. */
export function parseState(what: string, data: unknown): ServerState {
  const env = StateEnvelope.safeParse(data)
  if (!env.success) throw new ContentError([describeIssues(what, env.error)])
  const s = env.data
  const logs = parseReviewLog(
    `${what} reviewEvents`,
    s.reviewEvents.map(({ id: _id, ...rest }) => rest),
  )
  const reviewEvents = logs.map((e, i) => ({ ...e, id: s.reviewEvents[i].id }))
  const attempts = s.attempts.map(({ id, ...rest }, i) => ({ ...parseResult(`${what} attempts[${i}]`, rest), id }))
  return {
    serverTime: s.serverTime,
    userId: s.userId,
    reviewEventsSince: s.reviewEventsSince,
    cards: s.cards,
    reviewEvents,
    studyDays: s.studyDays,
    attempts,
    lessonProgress: parseLessonProgress(`${what} lessonProgress`, s.lessonProgress),
    newWordExtras: s.newWordExtras,
    notes: s.notes,
    customWords: s.customWords,
    studySessions: s.studySessions,
  }
}

function answeredDay(a: AttemptUpload | Result): string | null {
  return a.items.some((i) => i.answer !== null) && a.localDay ? a.localDay : null
}

/** The server state after it accepted a batch: what was sent, except where the server kept a newer version (stale). */
export function applySent(s: ServerState, sent: SyncBatch, reply: SyncResponse): ServerState {
  const eventIds = new Set(s.reviewEvents.map((e) => e.id))
  const reviewEvents = [...s.reviewEvents]
  for (const { id, ...e } of sent.reviewEvents ?? []) if (!eventIds.has(id)) reviewEvents.push({ ...e, id })
  reviewEvents.sort((a, b) => a.ts.localeCompare(b.ts))

  const attemptIds = new Set(s.attempts.map((a) => a.id))
  const attempts = [...s.attempts]
  for (const a of sent.attempts ?? []) if (!attemptIds.has(a.id)) attempts.push(a)
  attempts.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))

  const cards = { ...s.cards }
  for (const c of sent.cards ?? []) cards[c.wordId] = c.card
  for (const c of reply.cards.stale) cards[c.wordId] = c.card

  const lessons = { ...s.lessonProgress.lessons }
  for (const { lessonId, ...rec } of sent.lessons ?? []) lessons[lessonId] = rec
  for (const l of reply.lessons.stale) lessons[l.lessonId] = l.progress

  const extras = { ...s.newWordExtras }
  for (const x of sent.newWordExtras ?? []) extras[x.localDay] = x.extra
  for (const x of reply.newWordExtras.stale) extras[x.localDay] = x.extra

  const notes = new Map(s.notes.map((n) => [n.id, n]))
  for (const { id, ...rec } of sent.notes ?? []) {
    // Locked by Claude's feedback: the server kept its version (and sends it as stale if it differs).
    if (notes.get(id)?.feedback) continue
    notes.set(id, { ...rec, id, feedback: null })
  }
  for (const n of reply.notes.stale) notes.set(n.id, n)

  const words = new Map(s.customWords.map((w) => [w.id, w]))
  for (const { id, ...rec } of sent.customWords ?? []) words.set(id, mergeCustomWord(words.get(id), id, rec))
  for (const w of reply.customWords.stale) words.set(w.id, w)

  const sessions = new Map(s.studySessions.map((x) => [x.id, x]))
  for (const { id, ...rec } of sent.studySessions ?? []) sessions.set(id, { id, ...rec })
  for (const x of reply.studySessions.stale) sessions.set(x.id, x)

  const days = new Set(s.studyDays)
  for (const e of sent.reviewEvents ?? []) days.add(e.localDay)
  for (const a of sent.attempts ?? []) {
    const d = answeredDay(a)
    if (d) days.add(d)
  }
  for (const { id } of sent.studySessions ?? []) {
    const x = sessions.get(id)
    if (x && x.deletedAt === undefined) days.add(x.localDay)
  }

  return {
    ...s,
    serverTime: reply.serverTime,
    cards,
    reviewEvents,
    attempts,
    lessonProgress: { version: 1, lessons },
    newWordExtras: extras,
    notes: [...notes.values()],
    customWords: [...words.values()],
    studySessions: [...sessions.values()],
    studyDays: [...days].sort(),
  }
}

/**
 * Changes the server refused because the note has Claude's feedback (it came back as stale with
 * feedback, and differs from what was sent), as messages for the error banner. The device then
 * adopts the server's version, so an edited text would be gone without this: the message keeps it.
 */
export function lockedRejections(sent: SyncBatch, reply: SyncResponse): string[] {
  const stale = new Map(reply.notes.stale.map((n) => [n.id, n]))
  const out: string[] = []
  for (const n of sent.notes ?? []) {
    const server = stale.get(n.id)
    if (!server?.feedback) continue
    const what = `Your note from ${server.localDay} already has Claude's feedback, so it is locked`
    if (n.deletedAt !== null && server.deletedAt === null) out.push(`${what}: it was not deleted.`)
    else if (n.text !== server.text) out.push(`${what}: your change was not saved. Your changed text was: ${n.text}`)
  }
  return out
}

/** The reply of a sync that nobody sent: everything accepted as it is (guest mode keeps changes in memory only). */
export function acceptedLocally(serverTime: string): SyncResponse {
  const upserts = { received: 0, written: 0, unchanged: 0, stale: [] }
  const inserts = { received: 0, inserted: 0, duplicates: 0 }
  return {
    ok: true,
    serverTime,
    reviewEvents: inserts,
    cards: upserts,
    attempts: inserts,
    lessons: upserts,
    newWordExtras: upserts,
    notes: upserts,
    customWords: upserts,
    studySessions: upserts,
  }
}

// ---------- the local view ----------

export interface SavedResult {
  /** Attempt id (a UUID); also the Results page route. */
  id: string
  result: Result
}

export interface ProgressView {
  userId: string
  /** When the server state was read (or the offline copy was made). */
  serverTime: string
  reviewState: ReviewState
  /** Word reviews of the last weeks (server window) plus unsynced ones, oldest first. */
  reviewLog: ReviewLogEntry[]
  /** Newest first. */
  results: SavedResult[]
  lessonProgress: LessonProgress
  /** Every local day with activity, all time. */
  studyDays: string[]
  /** Attempt ids still waiting in the outbox. */
  pendingAttemptIds: string[]
  /** Notes that are not deleted, newest first. */
  notes: NoteView[]
  /** Hayk's own words that are not deleted, oldest first. */
  customWords: CustomWordView[]
  /** Study sessions that are not deleted (the state's window plus unsynced ones), newest first. */
  studySessions: StudySessionView[]
}

export interface NoteView extends ServerNote {
  /** A change of this note is still waiting in the outbox. */
  pending: boolean
}

export type CustomWordView = CustomWord & {
  /** A change of this word is still waiting in the outbox. */
  pending: boolean
}

export type StudySessionView = StudySession & {
  /** A change of this session is still waiting in the outbox. */
  pending: boolean
}

/** Later updatedAt wins; on a tie the local (second) record. */
function laterLesson(a: LessonRecord | undefined, b: LessonRecord): LessonRecord {
  return a && a.updatedAt > b.updatedAt ? a : b
}

/** The server's note, or the local change when it is not older; a note with feedback is locked, so the server's stands. */
function mergeNote(server: ServerNote | undefined, id: string, local: NoteRecord): ServerNote {
  if (server && (server.feedback !== null || server.updatedAt > local.updatedAt)) return server
  return { ...local, id, feedback: null }
}

/**
 * The server's custom word, or the local change when it is not older (the server applies the
 * same rule). Claude's check stays only while the fields are the ones he checked: an edit clears
 * it, a delete keeps it.
 */
export function mergeCustomWord(server: CustomWord | undefined, id: string, local: CustomWordRecord): CustomWord {
  if (server && server.updatedAt > local.updatedAt) return server
  const check = server?.check !== undefined && sameFields(server, local) ? server.check : undefined
  return { id, ...local, ...(check ? { check } : {}) }
}

/** The server's session, or the local change when it is not older (the server applies the same rule). */
function mergeSession(server: StudySession | undefined, id: string, local: StudySessionRecord): StudySession {
  if (server && server.updatedAt > local.updatedAt) return server
  return { id, ...local }
}

export function buildView(s: ServerState, o: Outbox, today: string): ProgressView {
  const cards = { ...s.cards }
  for (const [wordId, card] of Object.entries(o.cards)) cards[wordId] = cards[wordId] ? laterCard(cards[wordId], card) : card

  const seen = new Set(s.reviewEvents.map((e) => e.id))
  const events = [...s.reviewEvents, ...o.reviewEvents.filter((e) => !seen.has(e.id))].sort((a, b) => a.ts.localeCompare(b.ts))
  const reviewLog = events.map(({ id: _id, ...e }) => e)

  const attemptIds = new Set(s.attempts.map((a) => a.id))
  const results: SavedResult[] = [...s.attempts, ...o.attempts.filter((a) => !attemptIds.has(a.id))]
    .map(({ id, ...result }) => ({ id, result }))
    .sort((a, b) => b.result.submittedAt.localeCompare(a.result.submittedAt))

  const lessons = { ...s.lessonProgress.lessons }
  for (const [id, rec] of Object.entries(o.lessons)) lessons[id] = laterLesson(lessons[id], rec)

  const extra = Math.max(s.newWordExtras[today] ?? 0, o.newWordExtras[today] ?? 0)
  // Custom words are introduced outside the daily limit, so they do not count (DECISIONS.md #58).
  const count = reviewLog.filter((e) => e.localDay === today && e.isNew && !e.practice && !isCustomWordId(e.wordId)).length

  const days = new Set(s.studyDays)
  for (const e of o.reviewEvents) days.add(e.localDay)
  for (const a of o.attempts) {
    const d = answeredDay(a)
    if (d) days.add(d)
  }

  const notes = new Map(s.notes.map((n) => [n.id, n]))
  for (const [id, rec] of Object.entries(o.notes)) notes.set(id, mergeNote(notes.get(id), id, rec))

  const words = new Map(s.customWords.map((w) => [w.id, w]))
  for (const [id, rec] of Object.entries(o.customWords)) words.set(id, mergeCustomWord(words.get(id), id, rec))

  // A day with a study session is a study day (DECISIONS.md #62). A session deleted on this device
  // cannot take back a day the server listed; that day goes at the next load if nothing else is on it.
  const sessions = new Map(s.studySessions.map((x) => [x.id, x]))
  for (const [id, rec] of Object.entries(o.studySessions)) {
    const x = mergeSession(sessions.get(id), id, rec)
    sessions.set(id, x)
    if (x.deletedAt === undefined) days.add(x.localDay)
  }

  return {
    userId: s.userId,
    serverTime: s.serverTime,
    reviewState: {
      version: 1,
      scheduler: 'fsrs',
      updatedAt: s.serverTime,
      newToday: extra > 0 ? { date: today, count, extra } : { date: today, count },
      cards,
    },
    reviewLog,
    results,
    lessonProgress: { version: 1, lessons },
    studyDays: [...days].sort(),
    pendingAttemptIds: o.attempts.map((a) => a.id),
    notes: [...notes.values()]
      .filter((n) => n.deletedAt === null)
      .map((n) => ({ ...n, pending: n.id in o.notes }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)),
    customWords: [...words.values()]
      .filter((w) => w.deletedAt === undefined)
      .map((w) => ({ ...w, pending: w.id in o.customWords }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    studySessions: [...sessions.values()]
      .filter((x) => x.deletedAt === undefined)
      .map((x) => ({ ...x, pending: x.id in o.studySessions }))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id)),
  }
}

// ---------- the outbox in local storage ----------

const OutboxEnvelope = z.strictObject({
  version: z.literal(1),
  reviewEvents: z.array(z.object({ id: z.string().min(1), localDay: IsoDate }).loose()),
  cards: z.record(z.string(), StoredCardSchema),
  attempts: z.array(z.object({ id: z.string().min(1), localDay: IsoDate }).loose()),
  lessons: z.record(z.string(), LessonRecordSchema),
  newWordExtras: z.record(z.string(), z.number().int().nonnegative()),
  // Optional only because outboxes saved before notes existed (2026-09-30) have no "notes" key.
  notes: z.record(z.string(), NoteRecordSchema).optional(),
  // The same for custom words (added 2026-09-30, after notes).
  customWords: z.record(z.string(), CustomWordRecordSchema).optional(),
  // The same for study sessions (added 2026-10-02).
  studySessions: z.record(z.string(), StudySessionRecordSchema).optional(),
})

/** Parses a stored outbox; a damaged one is a loud error (its changes would otherwise be lost). */
export function parseOutbox(what: string, data: unknown): Outbox {
  const env = OutboxEnvelope.safeParse(data)
  if (!env.success) throw new ContentError([describeIssues(what, env.error)])
  const o = env.data
  const logs = parseReviewLog(
    `${what} reviewEvents`,
    o.reviewEvents.map(({ id: _id, ...rest }) => rest),
  )
  return {
    version: 1,
    reviewEvents: logs.map((e, i) => ({ ...e, id: o.reviewEvents[i].id, localDay: o.reviewEvents[i].localDay })),
    cards: o.cards,
    attempts: o.attempts.map(({ id, ...rest }, i) => {
      const r = parseResult(`${what} attempts[${i}]`, rest)
      if (r.review) throw new ContentError([`${what} attempts[${i}]: an unsynced attempt cannot have a review`])
      return { ...r, id, localDay: o.attempts[i].localDay }
    }),
    lessons: o.lessons,
    newWordExtras: o.newWordExtras,
    notes: o.notes ?? {},
    customWords: o.customWords ?? {},
    studySessions: o.studySessions ?? {},
  }
}
