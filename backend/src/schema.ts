// What the app may upload. These mirror the synced types in app/src/content/schema.ts
// (ReviewLogEntry, StoredCard, Result, ResultItem, LessonProgress, ReviewState.newToday.extra)
// as of 2026-09-29 02:00, plus a client-generated id on events and attempts.
// KEEP THEM IN STEP: when the app changes one of those types, change it here and redeploy.
// Objects are strict on purpose: a key this API does not know is a 400 that names the key,
// instead of data silently dropped on the way into the database.
import { z } from 'zod'
import { SYNC_LIMITS } from './config.ts'

function isRealDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

const IsoDate = z.string().refine(isRealDay, { message: 'must be a real calendar date like 2026-09-28' })
const IsoDateTime = z.iso.datetime({ offset: true })
const Slug = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'must be lowercase letters/digits separated by single hyphens' })
const ClientId = z.uuid({ message: 'must be a UUID from crypto.randomUUID()' })
const Count = z.number().int().nonnegative()
const Level = z.enum(['A1', 'A2', 'B1', 'B2'])
const NearMissKind = z.enum(['case', 'umlaut', 'article_missing', 'article_wrong'])
const FsrsState = z.number().int().min(0).max(3)

// ---------- word reviews (one line of the old review-log.jsonl) ----------

export const ReviewEventUpload = z.strictObject({
  id: ClientId,
  ts: IsoDateTime,
  localDay: IsoDate,
  /** Optional only so that old log lines (before 2026-09-29) can be imported. */
  timeMs: Count.optional(),
  wordId: Slug,
  de: z.string().min(1).max(200),
  mode: z.enum(['recognition', 'production', 'listening']),
  rating: z.number().int().min(1).max(4),
  answer: z.string().max(500).nullable(),
  correct: z.boolean().nullable(),
  nearMiss: z.array(NearMissKind).max(4).nullable(),
  isNew: z.boolean(),
  stateBefore: FsrsState,
  stateAfter: FsrsState,
  due: IsoDateTime,
  /** Extra practice of weak words: logged, but the FSRS schedule was not changed. */
  practice: z.literal(true).optional(),
})

// ---------- FSRS card per word (ts-fsrs fields, as in review-state.json "cards") ----------

export const StoredCard = z.strictObject({
  due: IsoDateTime,
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: Count,
  lapses: Count,
  state: FsrsState,
  last_review: IsoDateTime.nullable(),
})

export const CardUpload = z.strictObject({ wordId: Slug, card: StoredCard })

// ---------- test attempts (the old results/*.json files, without Claude's review) ----------

const DiffOp = z.strictObject({
  op: z.enum(['ok', 'wrong', 'missing', 'extra']),
  expected: z.string().max(1000).optional(),
  typed: z.string().max(1000).optional(),
  nearMiss: z.array(NearMissKind).max(4).optional(),
})

const GapResult = z.strictObject({
  answer: z.string().max(1000),
  correct: z.boolean(),
  nearMiss: z.array(NearMissKind).max(4).nullable(),
})

const ResultItem = z.strictObject({
  index: z.number().int().nonnegative(),
  type: z.enum(['mc', 'gap', 'order', 'translate', 'write', 'dictation', 'listen_mc']),
  question: z.string().max(5000),
  answer: z.union([z.string().max(10000), z.array(z.string().max(1000)).max(100)]).nullable(),
  expected: z.string().max(5000).nullable(),
  status: z.enum(['correct', 'wrong', 'pending']),
  nearMiss: z.array(NearMissKind).max(4).nullable(),
  gaps: z.array(GapResult).max(100).optional(),
  diff: z.array(DiffOp).max(2000).optional(),
  timeMs: z.number().nonnegative(),
  hintUsed: z.boolean(),
  plays: Count.optional(),
})

export const AttemptUpload = z
  .strictObject({
    id: ClientId,
    version: z.literal(1),
    testId: Slug,
    testTitle: z.string().max(300),
    level: Level,
    /** Informational ("repo", "browser", ...), so any short lowercase word is accepted. */
    mode: z.string().regex(/^[a-z]{1,20}$/, { message: 'must be a short lowercase word' }),
    startedAt: IsoDateTime,
    submittedAt: IsoDateTime,
    /** Required here (optional in the app only for results saved before 2026-09-29). */
    localDay: IsoDate,
    /** Set for an exercise inside a lesson: the lesson id and the index of its section. */
    lessonId: Slug.optional(),
    section: Count.optional(),
    score: z.strictObject({ correct: Count, wrong: Count, pending: Count, total: Count }),
    items: z.array(ResultItem).max(200),
    // No "review": only Claude writes reviews (backend/scripts/progress.py). Sending one is a 400.
  })
  .superRefine((a, ctx) => {
    if (Date.parse(a.submittedAt) < Date.parse(a.startedAt)) {
      ctx.addIssue({ code: 'custom', path: ['submittedAt'], message: 'is before startedAt' })
    }
    if ((a.lessonId === undefined) !== (a.section === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['section'], message: 'lessonId and section go together: set both or neither' })
    }
  })

// ---------- lesson progress (one entry of the app's LessonProgress.lessons) ----------

export const LessonUpload = z.strictObject({
  lessonId: Slug,
  startedAt: IsoDateTime,
  updatedAt: IsoDateTime,
  lastSection: Count,
  doneAt: IsoDateTime.nullable(),
})

// ---------- extra new words asked for on a day (ReviewState.newToday.extra) ----------

export const NewWordExtraUpload = z.strictObject({ localDay: IsoDate, extra: Count.max(1000) })

// ---------- one sync batch ----------

function checkUnique<T>(list: T[], key: (x: T) => string, field: string, name: string, ctx: z.RefinementCtx): void {
  const seen = new Set<string>()
  list.forEach((x, i) => {
    const k = key(x)
    if (seen.has(k)) ctx.addIssue({ code: 'custom', path: [field, i, name], message: `duplicate ${name} "${k}" in this batch` })
    seen.add(k)
  })
}

export const SyncBody = z
  .strictObject({
    reviewEvents: z.array(ReviewEventUpload).max(SYNC_LIMITS.reviewEvents).default([]),
    cards: z.array(CardUpload).max(SYNC_LIMITS.cards).default([]),
    attempts: z.array(AttemptUpload).max(SYNC_LIMITS.attempts).default([]),
    lessons: z.array(LessonUpload).max(SYNC_LIMITS.lessons).default([]),
    newWordExtras: z.array(NewWordExtraUpload).max(SYNC_LIMITS.newWordExtras).default([]),
  })
  .superRefine((b, ctx) => {
    checkUnique(b.reviewEvents, (e) => e.id, 'reviewEvents', 'id', ctx)
    checkUnique(b.cards, (c) => c.wordId, 'cards', 'wordId', ctx)
    checkUnique(b.attempts, (a) => a.id, 'attempts', 'id', ctx)
    checkUnique(b.lessons, (l) => l.lessonId, 'lessons', 'lessonId', ctx)
    checkUnique(b.newWordExtras, (x) => x.localDay, 'newWordExtras', 'localDay', ctx)
  })

export type ReviewEventUpload = z.infer<typeof ReviewEventUpload>
export type StoredCard = z.infer<typeof StoredCard>
export type CardUpload = z.infer<typeof CardUpload>
export type AttemptUpload = z.infer<typeof AttemptUpload>
export type LessonUpload = z.infer<typeof LessonUpload>
export type NewWordExtraUpload = z.infer<typeof NewWordExtraUpload>
export type SyncBody = z.infer<typeof SyncBody>
