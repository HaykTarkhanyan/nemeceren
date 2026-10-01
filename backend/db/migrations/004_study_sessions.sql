-- 004_study_sessions: Hayk's study timer. One row per session he timed in the app (start, pause,
-- resume, stop) or added by hand on the Stats page (DECISIONS.md #62).
--
-- Same ownership pattern as 001_init, 002_notes and 003_custom_words: user_id is the Neon Auth user
-- id (the JWT "sub"), the primary key is (user_id, id), and every query filters by the verified user
-- id (no RLS, #30). id is made by the app (crypto.randomUUID()).
-- The app writes sessions through POST /v1/sync: the record with the later updated_at wins (Hayk
-- can edit the minutes and the label). Delete is soft (deleted_at), so it reaches the other devices.
-- active_ms is the time the timer ran, without pauses; it fits between started_at and ended_at and
-- is at most 16 hours. local_day is Hayk's local calendar day of started_at, as the app records it.
-- manual marks a session added by hand (its start is noon of the chosen day).
-- The label limit is the app's (STUDY_LABEL_MAX in app/src/content/schema.ts).
-- Apply with: uv run backend/scripts/migrate.py apply   (never edit this file after it ran).

CREATE TABLE study_sessions (
  user_id     text        NOT NULL,
  id          uuid        NOT NULL,                  -- made by the app (crypto.randomUUID())
  started_at  timestamptz NOT NULL,                  -- Start pressed (manual: noon of the chosen day)
  ended_at    timestamptz NOT NULL,                  -- Stop pressed, or the pause it was stopped in
  active_ms   integer     NOT NULL,                  -- running time without pauses
  local_day   date        NOT NULL,                  -- Hayk's local calendar day of started_at
  label       text        CHECK (label IS NULL OR (char_length(label) <= 100 AND label ~ '\S')),
  manual      boolean     NOT NULL DEFAULT false,    -- added by hand, not timed
  created_at  timestamptz NOT NULL,                  -- app time
  updated_at  timestamptz NOT NULL,                  -- app time of the last change (the merge key)
  deleted_at  timestamptz,                           -- soft delete
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CHECK (ended_at >= started_at),
  CHECK (active_ms >= 0 AND active_ms <= 16 * 60 * 60 * 1000),
  CHECK (active_ms <= extract(epoch FROM (ended_at - started_at)) * 1000),
  CHECK (updated_at >= created_at)
);
CREATE INDEX study_sessions_user_started ON study_sessions (user_id, started_at);
CREATE INDEX study_sessions_user_day ON study_sessions (user_id, local_day) WHERE deleted_at IS NULL;
