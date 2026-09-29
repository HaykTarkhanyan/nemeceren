// POST /v1/sync: write one batch in one transaction. Every write is idempotent, so the app can
// resend a batch after a timeout or a lost response:
//   review events, attempts  insert by client id; a resent id with the same content is counted as a
//                            duplicate, a resent id with DIFFERENT content is a 409 (an app bug)
//   cards                    upsert per word; the card with the later last_review wins (the rule of
//                            mergeStates in app/src/lib/srs.ts)
//   lessons                  upsert per lesson; the record with the later updatedAt wins
//   newWordExtras            upsert per local day; the larger value wins (it only grows in a day)
// For the last three, whatever the server already had in a newer version comes back as "stale",
// so a device that was offline can adopt it. Each table takes the whole list as one JSON
// parameter (jsonb_to_recordset): one query per table per batch.
import type { PoolClient } from 'pg'
import { withTransaction } from './db.ts'
import { HttpError } from './errors.ts'
import type { AttemptUpload, CardUpload, LessonUpload, NewWordExtraUpload, ReviewEventUpload, StoredCard, SyncBody } from './schema.ts'

interface LessonRecord {
  startedAt: string
  updatedAt: string
  lastSection: number
  doneAt: string | null
}

export interface SyncResult {
  ok: true
  serverTime: string
  reviewEvents: { received: number; inserted: number; duplicates: number }
  cards: { received: number; written: number; unchanged: number; stale: { wordId: string; card: StoredCard }[] }
  attempts: { received: number; inserted: number; duplicates: number }
  lessons: { received: number; written: number; unchanged: number; stale: { lessonId: string; progress: LessonRecord }[] }
  newWordExtras: { received: number; written: number; unchanged: number; stale: { localDay: string; extra: number }[] }
}

/** timestamptz as the app writes it (Date.prototype.toISOString): 2026-09-29T10:00:00.000Z */
const iso = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

// In the SELECT after a data-modifying CTE, the tables are seen as they were BEFORE the write, so
// the joins below compare the batch only with rows that already existed.
const INSERT_REVIEW_EVENTS = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(
    id uuid, ts timestamptz, local_day date, time_ms integer, word_id text, de text, mode text,
    rating smallint, answer text, correct boolean, near_miss text[], is_new boolean,
    state_before smallint, state_after smallint, due timestamptz, practice boolean)
),
ins AS (
  INSERT INTO review_events (user_id, id, ts, local_day, time_ms, word_id, de, mode, rating, answer,
                             correct, near_miss, is_new, state_before, state_after, due, practice)
  SELECT $1, id, ts, local_day, time_ms, word_id, de, mode, rating, answer,
         correct, near_miss, is_new, state_before, state_after, due, practice
  FROM input
  ON CONFLICT (user_id, id) DO NOTHING
  RETURNING id
)
SELECT
  (SELECT count(*)::int FROM ins) AS inserted,
  (SELECT coalesce(array_agg(i.id::text), '{}')
     FROM input i JOIN review_events e ON e.user_id = $1 AND e.id = i.id
    WHERE (e.ts, e.word_id, e.mode, e.rating, e.answer, e.is_new, e.practice)
          IS DISTINCT FROM (i.ts, i.word_id, i.mode, i.rating, i.answer, i.is_new, i.practice)) AS conflicting`

const UPSERT_CARDS = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(word_id text, card jsonb, due timestamptz, last_review timestamptz)
),
up AS (
  INSERT INTO review_cards AS rc (user_id, word_id, card, due, last_review, updated_at)
  SELECT $1, word_id, card, due, last_review, now() FROM input
  ON CONFLICT (user_id, word_id) DO UPDATE
    SET card = excluded.card, due = excluded.due, last_review = excluded.last_review, updated_at = now()
    WHERE excluded.last_review IS NOT NULL
      AND (rc.last_review IS NULL OR excluded.last_review > rc.last_review)
  RETURNING word_id
)
SELECT
  (SELECT count(*)::int FROM up) AS written,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('wordId', rc.word_id, 'card', rc.card) ORDER BY rc.word_id), '[]'::jsonb)
     FROM input i JOIN review_cards rc ON rc.user_id = $1 AND rc.word_id = i.word_id
    WHERE rc.last_review IS NOT NULL
      AND (i.last_review IS NULL OR rc.last_review > i.last_review)) AS stale`

const INSERT_ATTEMPTS = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(
    id uuid, test_id text, test_title text, level text, mode text, started_at timestamptz,
    submitted_at timestamptz, local_day date, lesson_id text, section integer, score jsonb, items jsonb,
    answered_items integer)
),
ins AS (
  INSERT INTO test_attempts (user_id, id, test_id, test_title, level, mode, started_at, submitted_at,
                             local_day, lesson_id, section, score, items, answered_items)
  SELECT $1, id, test_id, test_title, level, mode, started_at, submitted_at,
         local_day, lesson_id, section, score, items, answered_items
  FROM input
  ON CONFLICT (user_id, id) DO NOTHING
  RETURNING id
)
SELECT
  (SELECT count(*)::int FROM ins) AS inserted,
  (SELECT coalesce(array_agg(i.id::text), '{}')
     FROM input i JOIN test_attempts a ON a.user_id = $1 AND a.id = i.id
    WHERE (a.test_id, a.submitted_at, a.lesson_id, a.section, a.items)
          IS DISTINCT FROM (i.test_id, i.submitted_at, i.lesson_id, i.section, i.items)) AS conflicting`

const UPSERT_LESSONS = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(
    lesson_id text, started_at timestamptz, updated_at timestamptz, last_section integer, done_at timestamptz)
),
up AS (
  INSERT INTO lesson_progress AS lp (user_id, lesson_id, started_at, updated_at, last_section, done_at)
  SELECT $1, lesson_id, started_at, updated_at, last_section, done_at FROM input
  ON CONFLICT (user_id, lesson_id) DO UPDATE
    SET started_at = excluded.started_at, updated_at = excluded.updated_at,
        last_section = excluded.last_section, done_at = excluded.done_at, received_at = now()
    WHERE excluded.updated_at > lp.updated_at
  RETURNING lesson_id
)
SELECT
  (SELECT count(*)::int FROM up) AS written,
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'lessonId', lp.lesson_id,
            'progress', jsonb_build_object(
              'startedAt', ${iso('lp.started_at')}, 'updatedAt', ${iso('lp.updated_at')},
              'lastSection', lp.last_section,
              'doneAt', CASE WHEN lp.done_at IS NULL THEN NULL ELSE ${iso('lp.done_at')} END))
          ORDER BY lp.lesson_id), '[]'::jsonb)
     FROM input i JOIN lesson_progress lp ON lp.user_id = $1 AND lp.lesson_id = i.lesson_id
    WHERE lp.updated_at > i.updated_at) AS stale`

const UPSERT_NEW_WORD_EXTRAS = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(local_day date, extra integer)
),
up AS (
  INSERT INTO new_word_extras AS nx (user_id, local_day, extra, updated_at)
  SELECT $1, local_day, extra, now() FROM input
  ON CONFLICT (user_id, local_day) DO UPDATE
    SET extra = excluded.extra, updated_at = now()
    WHERE excluded.extra > nx.extra
  RETURNING local_day
)
SELECT
  (SELECT count(*)::int FROM up) AS written,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('localDay', nx.local_day::text, 'extra', nx.extra) ORDER BY nx.local_day), '[]'::jsonb)
     FROM input i JOIN new_word_extras nx ON nx.user_id = $1 AND nx.local_day = i.local_day
    WHERE nx.extra > i.extra) AS stale`

function conflictError(kind: string, ids: string[]): HttpError {
  return new HttpError(
    409,
    'conflict',
    `${ids.length} ${kind} id(s) already exist with different content. Ids must be unique per record ` +
      '(crypto.randomUUID()); the whole batch was rolled back.',
    { kind, ids: ids.slice(0, 50) },
  )
}

async function insertReviewEvents(client: PoolClient, userId: string, events: ReviewEventUpload[]): Promise<SyncResult['reviewEvents']> {
  const rows = events.map((e) => ({
    id: e.id,
    ts: e.ts,
    local_day: e.localDay,
    time_ms: e.timeMs ?? null,
    word_id: e.wordId,
    de: e.de,
    mode: e.mode,
    rating: e.rating,
    answer: e.answer,
    correct: e.correct,
    near_miss: e.nearMiss,
    is_new: e.isNew,
    state_before: e.stateBefore,
    state_after: e.stateAfter,
    due: e.due,
    practice: e.practice === true,
  }))
  const { rows: [r] } = await client.query<{ inserted: number; conflicting: string[] }>(INSERT_REVIEW_EVENTS, [userId, JSON.stringify(rows)])
  if (r.conflicting.length > 0) throw conflictError('review event', r.conflicting)
  return { received: events.length, inserted: r.inserted, duplicates: events.length - r.inserted }
}

async function upsertCards(client: PoolClient, userId: string, cards: CardUpload[]): Promise<SyncResult['cards']> {
  const rows = cards.map((c) => ({ word_id: c.wordId, card: c.card, due: c.card.due, last_review: c.card.last_review }))
  const { rows: [r] } = await client.query<{ written: number; stale: SyncResult['cards']['stale'] }>(UPSERT_CARDS, [userId, JSON.stringify(rows)])
  return { received: cards.length, written: r.written, unchanged: cards.length - r.written - r.stale.length, stale: r.stale }
}

async function insertAttempts(client: PoolClient, userId: string, attempts: AttemptUpload[]): Promise<SyncResult['attempts']> {
  const rows = attempts.map((a) => ({
    id: a.id,
    test_id: a.testId,
    test_title: a.testTitle,
    level: a.level,
    mode: a.mode,
    started_at: a.startedAt,
    submitted_at: a.submittedAt,
    local_day: a.localDay,
    lesson_id: a.lessonId ?? null,
    section: a.section ?? null,
    score: a.score,
    items: a.items,
    // Same rule as the Stats page (app/src/lib/storage.ts): an item counts as answered unless its answer is null.
    answered_items: a.items.filter((it) => it.answer !== null).length,
  }))
  const { rows: [r] } = await client.query<{ inserted: number; conflicting: string[] }>(INSERT_ATTEMPTS, [userId, JSON.stringify(rows)])
  if (r.conflicting.length > 0) throw conflictError('test attempt', r.conflicting)
  return { received: attempts.length, inserted: r.inserted, duplicates: attempts.length - r.inserted }
}

async function upsertLessons(client: PoolClient, userId: string, lessons: LessonUpload[]): Promise<SyncResult['lessons']> {
  const rows = lessons.map((l) => ({
    lesson_id: l.lessonId,
    started_at: l.startedAt,
    updated_at: l.updatedAt,
    last_section: l.lastSection,
    done_at: l.doneAt,
  }))
  const { rows: [r] } = await client.query<{ written: number; stale: SyncResult['lessons']['stale'] }>(UPSERT_LESSONS, [userId, JSON.stringify(rows)])
  return { received: lessons.length, written: r.written, unchanged: lessons.length - r.written - r.stale.length, stale: r.stale }
}

async function upsertNewWordExtras(client: PoolClient, userId: string, extras: NewWordExtraUpload[]): Promise<SyncResult['newWordExtras']> {
  const rows = extras.map((x) => ({ local_day: x.localDay, extra: x.extra }))
  const { rows: [r] } = await client.query<{ written: number; stale: SyncResult['newWordExtras']['stale'] }>(UPSERT_NEW_WORD_EXTRAS, [
    userId,
    JSON.stringify(rows),
  ])
  return { received: extras.length, written: r.written, unchanged: extras.length - r.written - r.stale.length, stale: r.stale }
}

export async function applySync(userId: string, body: SyncBody): Promise<SyncResult> {
  const total = body.reviewEvents.length + body.cards.length + body.attempts.length + body.lessons.length + body.newWordExtras.length
  if (total === 0) {
    // Enforces the free-plan rule: the app only syncs when its outbox has something in it.
    throw new HttpError(400, 'empty_batch', 'Nothing to sync: send at least one item, and skip the request otherwise.')
  }
  return withTransaction('BEGIN', async (client) => {
    const inserts = { received: 0, inserted: 0, duplicates: 0 }
    const upserts = { received: 0, written: 0, unchanged: 0, stale: [] }
    return {
      ok: true as const,
      serverTime: new Date().toISOString(),
      reviewEvents: body.reviewEvents.length > 0 ? await insertReviewEvents(client, userId, body.reviewEvents) : inserts,
      cards: body.cards.length > 0 ? await upsertCards(client, userId, body.cards) : upserts,
      attempts: body.attempts.length > 0 ? await insertAttempts(client, userId, body.attempts) : inserts,
      lessons: body.lessons.length > 0 ? await upsertLessons(client, userId, body.lessons) : upserts,
      newWordExtras: body.newWordExtras.length > 0 ? await upsertNewWordExtras(client, userId, body.newWordExtras) : upserts,
    }
  })
}
