-- 003_custom_words: Hayk's own words ("My words"): words he hears in daily life and adds in the
-- app, and Claude's check of each one (DECISIONS.md #58).
--
-- Same ownership pattern as 001_init and 002_notes: user_id is the Neon Auth user id (the JWT
-- "sub"), the primary key is (user_id, id), and every query filters by the verified user id (no RLS, #30).
-- id is "u-" + crypto.randomUUID() (made by the app), so it never clashes with a content word id;
-- the word's FSRS card and reviews use the same id in review_cards and review_events.
-- The app writes words through POST /v1/sync: the record with the later updated_at wins. A change
-- of the fields (de, en, plural, example, note) clears Claude's check, so Claude looks again; a
-- delete alone keeps it. Delete is soft (deleted_at), so it reaches the other devices, and the
-- word's review history stays for the statistics.
-- claude_check is written only by Claude with backend/scripts/progress.py check-word, in the shape
-- of WordCheck in app/src/content/schema.ts: { at, ok, note?, fixed?: { de?, en?, plural? } }.
-- ("check" is a reserved word in SQL, hence the column name.)
-- The length limits are the app's (CUSTOM_WORD_MAX in app/src/content/schema.ts).
-- Apply with: uv run backend/scripts/migrate.py apply   (never edit this file after it ran).

CREATE TABLE custom_words (
  user_id      text        NOT NULL,
  id           text        NOT NULL CHECK (id ~ '^u-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  de           text        NOT NULL CHECK (char_length(de) <= 100 AND de ~ '\S'),
  en           text        NOT NULL CHECK (char_length(en) <= 200 AND en ~ '\S'),
  plural       text        CHECK (plural IS NULL OR (char_length(plural) <= 100 AND plural ~ '\S')),
  example      jsonb       CHECK (example IS NULL OR (jsonb_typeof(example) = 'object' AND example ? 'de')),
  note         text        CHECK (note IS NULL OR (char_length(note) <= 500 AND note ~ '\S')),
  created_at   timestamptz NOT NULL,                  -- app time
  updated_at   timestamptz NOT NULL,                  -- app time of the last change (the merge key)
  deleted_at   timestamptz,                           -- soft delete
  claude_check jsonb       CHECK (
                 claude_check IS NULL
                 OR (jsonb_typeof(claude_check) = 'object' AND claude_check ? 'at' AND claude_check ? 'ok')
               ),
  checked_at   timestamptz,                           -- when progress.py wrote the check
  received_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CHECK (updated_at >= created_at),
  CHECK ((claude_check IS NULL) = (checked_at IS NULL))
);
CREATE INDEX custom_words_user_created ON custom_words (user_id, created_at);
CREATE INDEX custom_words_unchecked ON custom_words (user_id, created_at) WHERE claude_check IS NULL AND deleted_at IS NULL;
