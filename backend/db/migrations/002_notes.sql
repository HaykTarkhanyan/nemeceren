-- 002_notes: Hayk's notes (free writing practice, mostly in German, or a question) and Claude's
-- feedback on each one.
--
-- Same ownership pattern as 001_init: user_id is the Neon Auth user id (the JWT "sub"), the
-- primary key is (user_id, id), and every query filters by the verified user id (no RLS, #30).
-- The app writes notes through POST /v1/sync (the record with the later updated_at wins).
-- feedback is written only by Claude with backend/scripts/progress.py (note-feedback), in the
-- shape of NoteFeedback in app/src/content/schema.ts. Once a note has feedback it is locked:
-- the sync refuses to change its text or delete it, so the feedback always matches the text.
-- Delete is soft (deleted_at), so a delete made offline on one device reaches the others.
-- Apply with: uv run backend/scripts/migrate.py apply   (never edit this file after it ran).

CREATE TABLE notes (
  user_id     text        NOT NULL,
  id          uuid        NOT NULL,                  -- made by the app (crypto.randomUUID())
  text        text        NOT NULL CHECK (char_length(text) <= 5000 AND text ~ '\S'),
  local_day   date        NOT NULL,                  -- Hayk's local calendar day when the note was written
  created_at  timestamptz NOT NULL,                  -- app time
  updated_at  timestamptz NOT NULL,                  -- app time of the last change (the merge key)
  deleted_at  timestamptz,                           -- soft delete
  feedback    jsonb       CHECK (
                feedback IS NULL
                OR (jsonb_typeof(feedback) = 'object' AND feedback ? 'summary' AND feedback ? 'at')
              ),
  feedback_at timestamptz,                           -- when progress.py wrote the feedback
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CHECK (updated_at >= created_at),
  CHECK ((feedback IS NULL) = (feedback_at IS NULL)),
  -- A note with feedback cannot be deleted, and a deleted note gets no feedback.
  CHECK (deleted_at IS NULL OR feedback IS NULL)
);
CREATE INDEX notes_user_created ON notes (user_id, created_at DESC);
CREATE INDEX notes_waiting ON notes (user_id, created_at) WHERE feedback IS NULL AND deleted_at IS NULL;
