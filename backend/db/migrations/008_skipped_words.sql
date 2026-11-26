-- 008_skipped_words: words a learner chose not to study ("Skip word", DECISIONS.md #123). A skipped word
-- stays out of reviews, new words, the daily mix, quick tasks, Speak and the games; its card and review
-- history stay, so unskipping brings it back where it was.
--
-- Same ownership pattern as 001_init to 005_path_events: user_id is the Neon Auth user id (the JWT "sub"),
-- and every query filters by the verified user id (no RLS, #30). One row per word ever skipped, keyed by
-- (user_id, word_id); word_id is a content word id (content/words.json) or a custom word id ("u-<uuid>"),
-- as in review_cards. Unskipping writes skipped = false instead of deleting the row, so the change reaches
-- the other devices.
-- The app writes through POST /v1/sync: the record with the later updated_at wins. GET /v1/state returns
-- every row (at most one per word, so a few KB).
-- Apply with: uv run backend/scripts/migrate.py apply   (never edit this file after it ran).

CREATE TABLE skipped_words (
  user_id     text        NOT NULL,
  word_id     text        NOT NULL CHECK (char_length(word_id) BETWEEN 1 AND 100),
  skipped     boolean     NOT NULL,
  updated_at  timestamptz NOT NULL,                  -- app time of the last change (the merge key)
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, word_id)
);
