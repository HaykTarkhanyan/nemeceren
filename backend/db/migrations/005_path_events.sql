-- 005_path_events: the Home path and the daily goal (DECISIONS.md #84). One row per finished station
-- (a section range of a lesson, kind 'station') or per daily mix run to its end (kind 'daily-mix').
-- The app derives the stations done, the daily goal days and the streak with its freezes from these
-- rows plus the test attempts; nothing else is stored for them.
--
-- Same ownership pattern as 001_init to 004_study_sessions: user_id is the Neon Auth user id (the JWT
-- "sub"), the primary key is (user_id, id), and every query filters by the verified user id (no RLS,
-- #30). id is made by the app (crypto.randomUUID()).
-- The app writes events through POST /v1/sync: the record with the later updated_at wins. Undo is a
-- soft delete (deleted_at), so it reaches the other devices. GET /v1/state returns every event that is
-- not deleted, all time (the streak needs the whole history since the launch day).
-- local_day is the learner's local calendar day when the station or mix was finished, as the app records it.
-- section_from / section_to are a half-open range of the lesson's sections: [from, to).
-- Apply with: uv run backend/scripts/migrate.py apply   (never edit this file after it ran).

CREATE TABLE path_events (
  user_id      text        NOT NULL,
  id           uuid        NOT NULL,                  -- made by the app (crypto.randomUUID())
  kind         text        NOT NULL CHECK (kind IN ('station', 'daily-mix')),
  lesson_id    text,                                  -- station only: course or theme lesson id
  section_from integer,                               -- station only
  section_to   integer,                               -- station only
  local_day    date        NOT NULL,                  -- the learner's local day when it was finished
  at           timestamptz NOT NULL,                  -- app time when it was finished
  created_at   timestamptz NOT NULL,                  -- app time
  updated_at   timestamptz NOT NULL,                  -- app time of the last change (the merge key)
  deleted_at   timestamptz,                           -- soft delete (undo)
  received_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CHECK (
    (kind = 'station' AND lesson_id IS NOT NULL AND section_from >= 0 AND section_to > section_from)
    OR (kind = 'daily-mix' AND lesson_id IS NULL AND section_from IS NULL AND section_to IS NULL)
  ),
  CHECK (updated_at >= created_at)
);
CREATE INDEX path_events_user_day ON path_events (user_id, local_day) WHERE deleted_at IS NULL;
