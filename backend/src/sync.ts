// POST /v1/sync: write one batch in one transaction. Every write is idempotent, so the app can
// resend a batch after a timeout or a lost response:
//   review events, attempts  insert by client id; a resent id with the same content is counted as a
//                            duplicate, a resent id with DIFFERENT content is a 409 (an app bug)
//   cards                    upsert per word; the card with the later last_review wins (the rule of
//                            mergeStates in app/src/lib/srs.ts)
//   lessons                  upsert per lesson; the record with the later updatedAt wins
//   newWordExtras            upsert per local day; the larger value wins (it only grows in a day)
//   notes                    upsert per note; the record with the later updatedAt wins, except that
//                            a note with Claude's feedback is locked and never changed or deleted
//   customWords              upsert per word; the record with the later updatedAt wins; a change of
//                            its fields clears Claude's check (a delete alone keeps it)
//   studySessions            upsert per session; the record with the later updatedAt wins
// For the last six, whatever the server already had in a newer version comes back as "stale",
// so a device that was offline can adopt it. A locked note comes back as stale whenever the
// upload differs from it, with its feedback. Each table takes the whole list as one JSON
// parameter (jsonb_to_recordset): one query per table per batch.
import type { PoolClient } from 'pg'
import { withTransaction } from './db.ts'
import { HttpError } from './errors.ts'
import type {
  AttemptUpload,
  CardUpload,
  CustomWordUpload,
  LessonUpload,
  NewWordExtraUpload,
  NoteUpload,
  ReviewEventUpload,
  StoredCard,
  StudySessionUpload,
  SyncBody,
} from './schema.ts'

interface LessonRecord {
  startedAt: string
  updatedAt: string
  lastSection: number
  doneAt: string | null
}

/** A note as the server has it (also the shape of GET /v1/state notes). feedback is Claude's, or null. */
export interface NoteRecord {
  id: string
  text: string
  localDay: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  feedback: unknown
}

export interface SyncResult {
  ok: true
  serverTime: string
  reviewEvents: { received: number; inserted: number; duplicates: number }
  cards: { received: number; written: number; unchanged: number; stale: { wordId: string; card: StoredCard }[] }
  attempts: { received: number; inserted: number; duplicates: number }
  lessons: { received: number; written: number; unchanged: number; stale: { lessonId: string; progress: LessonRecord }[] }
  newWordExtras: { received: number; written: number; unchanged: number; stale: { localDay: string; extra: number }[] }
  notes: { received: number; written: number; unchanged: number; stale: NoteRecord[] }
  customWords: { received: number; written: number; unchanged: number; stale: CustomWordRecord[] }
  studySessions: { received: number; written: number; unchanged: number; stale: StudySessionRecord[] }
}

/**
 * A custom word as the server has it (also the shape of GET /v1/state customWords): the app's
 * CustomWord. Optional keys are left out when empty; check is Claude's (WordCheck), when there is one.
 */
export type CustomWordRecord = Record<string, unknown> & { id: string; updatedAt: string }

/**
 * A study session as the server has it (also the shape of GET /v1/state studySessions): the app's
 * StudySession. Optional keys (label, manual, deletedAt) are left out when empty.
 */
export type StudySessionRecord = Record<string, unknown> & { id: string; updatedAt: string }

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

/** One note as JSON in the app's field names; the same shape as GET /v1/state notes. */
export const NOTE_JSON = (n: string) => `jsonb_build_object(
  'id', ${n}.id::text, 'text', ${n}.text, 'localDay', ${n}.local_day::text,
  'createdAt', ${iso(`${n}.created_at`)}, 'updatedAt', ${iso(`${n}.updated_at`)},
  'deletedAt', CASE WHEN ${n}.deleted_at IS NULL THEN NULL ELSE ${iso(`${n}.deleted_at`)} END,
  'feedback', ${n}.feedback)`

// A note with feedback is locked: it is never written, and whenever the upload differs from it in
// any way the server's version (with the feedback) comes back as stale, so the device adopts it.
const UPSERT_NOTES = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(
    id uuid, text text, local_day date, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz)
),
up AS (
  INSERT INTO notes AS n (user_id, id, text, local_day, created_at, updated_at, deleted_at)
  SELECT $1, id, text, local_day, created_at, updated_at, deleted_at FROM input
  ON CONFLICT (user_id, id) DO UPDATE
    SET text = excluded.text, local_day = excluded.local_day, created_at = excluded.created_at,
        updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, received_at = now()
    WHERE n.feedback IS NULL AND excluded.updated_at > n.updated_at
  RETURNING id
)
SELECT
  (SELECT count(*)::int FROM up) AS written,
  (SELECT coalesce(jsonb_agg(${NOTE_JSON('n')} ORDER BY n.id), '[]'::jsonb)
     FROM input i JOIN notes n ON n.user_id = $1 AND n.id = i.id
    WHERE (n.feedback IS NULL AND n.updated_at > i.updated_at)
       OR (n.feedback IS NOT NULL
           AND (n.text, n.local_day, n.created_at, n.updated_at, n.deleted_at)
               IS DISTINCT FROM (i.text, i.local_day, i.created_at, i.updated_at, i.deleted_at))) AS stale`

/** One custom word as JSON in the app's field names, empty keys left out; the same shape as GET /v1/state customWords. */
export const CUSTOM_WORD_JSON = (w: string) => `jsonb_strip_nulls(jsonb_build_object(
  'id', ${w}.id, 'de', ${w}.de, 'en', ${w}.en, 'plural', ${w}.plural, 'example', ${w}.example, 'note', ${w}.note,
  'createdAt', ${iso(`${w}.created_at`)}, 'updatedAt', ${iso(`${w}.updated_at`)},
  'deletedAt', CASE WHEN ${w}.deleted_at IS NULL THEN NULL ELSE ${iso(`${w}.deleted_at`)} END,
  'check', ${w}.claude_check))`

// The later updated_at wins. A newer version whose fields differ from the stored ones clears
// Claude's check (he checked the old text); the same fields with a later time (a delete) keep it.
const UPSERT_CUSTOM_WORDS = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(
    id text, de text, en text, plural text, example jsonb, note text,
    created_at timestamptz, updated_at timestamptz, deleted_at timestamptz)
),
up AS (
  INSERT INTO custom_words AS cw (user_id, id, de, en, plural, example, note, created_at, updated_at, deleted_at)
  SELECT $1, id, de, en, plural, example, note, created_at, updated_at, deleted_at FROM input
  ON CONFLICT (user_id, id) DO UPDATE
    SET de = excluded.de, en = excluded.en, plural = excluded.plural, example = excluded.example, note = excluded.note,
        created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
        claude_check = CASE WHEN (cw.de, cw.en, cw.plural, cw.example, cw.note)
                                 IS DISTINCT FROM (excluded.de, excluded.en, excluded.plural, excluded.example, excluded.note)
                            THEN NULL ELSE cw.claude_check END,
        checked_at = CASE WHEN (cw.de, cw.en, cw.plural, cw.example, cw.note)
                               IS DISTINCT FROM (excluded.de, excluded.en, excluded.plural, excluded.example, excluded.note)
                          THEN NULL ELSE cw.checked_at END,
        received_at = now()
    WHERE excluded.updated_at > cw.updated_at
  RETURNING id
)
SELECT
  (SELECT count(*)::int FROM up) AS written,
  (SELECT coalesce(jsonb_agg(${CUSTOM_WORD_JSON('cw')} ORDER BY cw.id), '[]'::jsonb)
     FROM input i JOIN custom_words cw ON cw.user_id = $1 AND cw.id = i.id
    WHERE cw.updated_at > i.updated_at) AS stale`

/** One study session as JSON in the app's field names, empty keys left out; the same shape as GET /v1/state studySessions. */
export const STUDY_SESSION_JSON = (x: string) => `jsonb_strip_nulls(jsonb_build_object(
  'id', ${x}.id::text, 'startedAt', ${iso(`${x}.started_at`)}, 'endedAt', ${iso(`${x}.ended_at`)},
  'activeMs', ${x}.active_ms, 'localDay', ${x}.local_day::text, 'label', ${x}.label,
  'manual', CASE WHEN ${x}.manual THEN true ELSE NULL END,
  'createdAt', ${iso(`${x}.created_at`)}, 'updatedAt', ${iso(`${x}.updated_at`)},
  'deletedAt', CASE WHEN ${x}.deleted_at IS NULL THEN NULL ELSE ${iso(`${x}.deleted_at`)} END))`

// The later updated_at wins (Hayk edits minutes and label, or deletes the session).
const UPSERT_STUDY_SESSIONS = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(
    id uuid, started_at timestamptz, ended_at timestamptz, active_ms integer, local_day date, label text,
    manual boolean, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz)
),
up AS (
  INSERT INTO study_sessions AS ss (user_id, id, started_at, ended_at, active_ms, local_day, label, manual,
                                    created_at, updated_at, deleted_at)
  SELECT $1, id, started_at, ended_at, active_ms, local_day, label, manual, created_at, updated_at, deleted_at FROM input
  ON CONFLICT (user_id, id) DO UPDATE
    SET started_at = excluded.started_at, ended_at = excluded.ended_at, active_ms = excluded.active_ms,
        local_day = excluded.local_day, label = excluded.label, manual = excluded.manual,
        created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
        received_at = now()
    WHERE excluded.updated_at > ss.updated_at
  RETURNING id
)
SELECT
  (SELECT count(*)::int FROM up) AS written,
  (SELECT coalesce(jsonb_agg(${STUDY_SESSION_JSON('ss')} ORDER BY ss.id), '[]'::jsonb)
     FROM input i JOIN study_sessions ss ON ss.user_id = $1 AND ss.id = i.id
    WHERE ss.updated_at > i.updated_at) AS stale`

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

async function upsertNotes(client: PoolClient, userId: string, notes: NoteUpload[]): Promise<SyncResult['notes']> {
  const rows = notes.map((n) => ({
    id: n.id,
    text: n.text,
    local_day: n.localDay,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
    deleted_at: n.deletedAt,
  }))
  const { rows: [r] } = await client.query<{ written: number; stale: NoteRecord[] }>(UPSERT_NOTES, [userId, JSON.stringify(rows)])
  return { received: notes.length, written: r.written, unchanged: notes.length - r.written - r.stale.length, stale: r.stale }
}

async function upsertCustomWords(client: PoolClient, userId: string, words: CustomWordUpload[]): Promise<SyncResult['customWords']> {
  const rows = words.map((w) => ({
    id: w.id,
    de: w.de,
    en: w.en,
    plural: w.plural ?? null,
    example: w.example ?? null,
    note: w.note ?? null,
    created_at: w.createdAt,
    updated_at: w.updatedAt,
    deleted_at: w.deletedAt ?? null,
  }))
  const { rows: [r] } = await client.query<{ written: number; stale: CustomWordRecord[] }>(UPSERT_CUSTOM_WORDS, [userId, JSON.stringify(rows)])
  return { received: words.length, written: r.written, unchanged: words.length - r.written - r.stale.length, stale: r.stale }
}

async function upsertStudySessions(client: PoolClient, userId: string, sessions: StudySessionUpload[]): Promise<SyncResult['studySessions']> {
  const rows = sessions.map((x) => ({
    id: x.id,
    started_at: x.startedAt,
    ended_at: x.endedAt,
    active_ms: x.activeMs,
    local_day: x.localDay,
    label: x.label ?? null,
    manual: x.manual === true,
    created_at: x.createdAt,
    updated_at: x.updatedAt,
    deleted_at: x.deletedAt ?? null,
  }))
  const { rows: [r] } = await client.query<{ written: number; stale: StudySessionRecord[] }>(UPSERT_STUDY_SESSIONS, [userId, JSON.stringify(rows)])
  return { received: sessions.length, written: r.written, unchanged: sessions.length - r.written - r.stale.length, stale: r.stale }
}

export async function applySync(userId: string, body: SyncBody): Promise<SyncResult> {
  const total =
    body.reviewEvents.length +
    body.cards.length +
    body.attempts.length +
    body.lessons.length +
    body.newWordExtras.length +
    body.notes.length +
    body.customWords.length +
    body.studySessions.length
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
      notes: body.notes.length > 0 ? await upsertNotes(client, userId, body.notes) : upserts,
      customWords: body.customWords.length > 0 ? await upsertCustomWords(client, userId, body.customWords) : upserts,
      studySessions: body.studySessions.length > 0 ? await upsertStudySessions(client, userId, body.studySessions) : upserts,
    }
  })
}
