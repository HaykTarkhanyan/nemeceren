// GET /v1/state: everything the app needs on start, read from one consistent snapshot.
//   cards           every FSRS card (the review state)
//   reviewEvents    raw word reviews from the last `days` days, oldest first (Stats charts,
//                   weak words, newToday)
//   studyDays       every local day with any activity, ever (streaks need the whole history)
//   attempts        every test attempt with its items and Claude's review, newest first
//   lessonProgress  the app's LessonProgress, exactly
//   newWordExtras   extra new words asked for, per local day, for the days in the window
//   notes           every note that is not deleted, with Claude's feedback (or null), newest first
//   customWords     every custom word (Hayk's own words) that is not deleted, with Claude's check, oldest first
// The field names match the app's types (app/src/content/schema.ts), plus an `id` on events and
// attempts. Keys the app models as optional (not nullable) are left out when empty.
import { withTransaction } from './db.ts'
import type { StoredCard } from './schema.ts'
import { CUSTOM_WORD_JSON, NOTE_JSON } from './sync.ts'
import type { CustomWordRecord, NoteRecord } from './sync.ts'

interface LessonRecord {
  startedAt: string
  updatedAt: string
  lastSection: number
  doneAt: string | null
}

export interface StateResponse {
  serverTime: string
  userId: string
  reviewEventsSince: string
  cards: Record<string, StoredCard>
  reviewEvents: Record<string, unknown>[]
  studyDays: string[]
  attempts: Record<string, unknown>[]
  lessonProgress: { version: 1; lessons: Record<string, LessonRecord> }
  newWordExtras: Record<string, number>
  notes: NoteRecord[]
  customWords: CustomWordRecord[]
}

interface EventRow {
  id: string
  ts: Date
  local_day: string
  time_ms: number | null
  word_id: string
  de: string
  mode: string
  rating: number
  answer: string | null
  correct: boolean | null
  near_miss: string[] | null
  is_new: boolean
  state_before: number
  state_after: number
  due: Date
  practice: boolean
}

interface AttemptRow {
  id: string
  test_id: string
  test_title: string
  level: string
  mode: string
  started_at: Date
  submitted_at: Date
  local_day: string
  lesson_id: string | null
  section: number | null
  score: unknown
  items: unknown
  review: unknown
}

interface LessonRow {
  lesson_id: string
  started_at: Date
  updated_at: Date
  last_section: number
  done_at: Date | null
}

export async function loadState(userId: string, days: number): Promise<StateResponse> {
  return withTransaction('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', async (client) => {
    const { rows: [clock] } = await client.query<{ now: Date; since: Date }>(
      'SELECT now() AS now, now() - make_interval(days => $1::int) AS since',
      [days],
    )

    const cardRows = await client.query<{ word_id: string; card: StoredCard }>(
      'SELECT word_id, card FROM review_cards WHERE user_id = $1 ORDER BY word_id',
      [userId],
    )
    const cards: Record<string, StoredCard> = {}
    for (const r of cardRows.rows) cards[r.word_id] = r.card

    const eventRows = await client.query<EventRow>(
      `SELECT id::text, ts, local_day, time_ms, word_id, de, mode, rating, answer, correct, near_miss,
              is_new, state_before, state_after, due, practice
         FROM review_events
        WHERE user_id = $1 AND ts >= $2
        ORDER BY ts, id`,
      [userId, clock.since],
    )
    const reviewEvents = eventRows.rows.map((e) => ({
      id: e.id,
      ts: e.ts.toISOString(),
      localDay: e.local_day,
      ...(e.time_ms === null ? {} : { timeMs: e.time_ms }),
      wordId: e.word_id,
      de: e.de,
      mode: e.mode,
      rating: e.rating,
      answer: e.answer,
      correct: e.correct,
      nearMiss: e.near_miss,
      isNew: e.is_new,
      stateBefore: e.state_before,
      stateAfter: e.state_after,
      due: e.due.toISOString(),
      ...(e.practice ? { practice: true } : {}),
    }))

    // A test attempt makes a study day only if at least one item was answered (as in app/src/lib/stats.ts).
    // Practice reviews count (they are review_events rows too).
    const dayRows = await client.query<{ day: string }>(
      `SELECT local_day AS day FROM review_events WHERE user_id = $1
       UNION
       SELECT local_day FROM test_attempts WHERE user_id = $1 AND answered_items > 0
       ORDER BY 1`,
      [userId],
    )

    const attemptRows = await client.query<AttemptRow>(
      `SELECT id::text, test_id, test_title, level, mode, started_at, submitted_at, local_day, lesson_id, section,
              score, items, review
         FROM test_attempts
        WHERE user_id = $1
        ORDER BY submitted_at DESC, id`,
      [userId],
    )
    const attempts = attemptRows.rows.map((a) => ({
      id: a.id,
      version: 1,
      testId: a.test_id,
      testTitle: a.test_title,
      level: a.level,
      mode: a.mode,
      startedAt: a.started_at.toISOString(),
      submittedAt: a.submitted_at.toISOString(),
      localDay: a.local_day,
      ...(a.lesson_id === null ? {} : { lessonId: a.lesson_id, section: a.section }),
      score: a.score,
      items: a.items,
      ...(a.review === null ? {} : { review: a.review }),
    }))

    const lessonRows = await client.query<LessonRow>(
      'SELECT lesson_id, started_at, updated_at, last_section, done_at FROM lesson_progress WHERE user_id = $1 ORDER BY lesson_id',
      [userId],
    )
    const lessons: Record<string, LessonRecord> = {}
    for (const l of lessonRows.rows) {
      lessons[l.lesson_id] = {
        startedAt: l.started_at.toISOString(),
        updatedAt: l.updated_at.toISOString(),
        lastSection: l.last_section,
        doneAt: l.done_at === null ? null : l.done_at.toISOString(),
      }
    }

    const extraRows = await client.query<{ local_day: string; extra: number }>(
      'SELECT local_day, extra FROM new_word_extras WHERE user_id = $1 AND local_day >= $2::date ORDER BY local_day',
      [userId, clock.since.toISOString().slice(0, 10)],
    )
    const newWordExtras: Record<string, number> = {}
    for (const x of extraRows.rows) newWordExtras[x.local_day] = x.extra

    const noteRows = await client.query<{ note: NoteRecord }>(
      `SELECT ${NOTE_JSON('n')} AS note FROM notes n
        WHERE n.user_id = $1 AND n.deleted_at IS NULL
        ORDER BY n.created_at DESC, n.id`,
      [userId],
    )

    const wordRows = await client.query<{ word: CustomWordRecord }>(
      `SELECT ${CUSTOM_WORD_JSON('cw')} AS word FROM custom_words cw
        WHERE cw.user_id = $1 AND cw.deleted_at IS NULL
        ORDER BY cw.created_at, cw.id`,
      [userId],
    )

    return {
      serverTime: clock.now.toISOString(),
      userId,
      reviewEventsSince: clock.since.toISOString(),
      cards,
      reviewEvents,
      studyDays: dayRows.rows.map((r) => r.day),
      attempts,
      lessonProgress: { version: 1 as const, lessons },
      newWordExtras,
      notes: noteRows.rows.map((r) => r.note),
      customWords: wordRows.rows.map((r) => r.word),
    }
  })
}
