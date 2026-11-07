-- 006_path_events_review_round: a third kind of path event, 'review-round': a scheduled word review
-- round on the Words page that ended with 10 or more cards graded. It counts for the daily goal like a
-- daily mix (DECISIONS.md #86, OK'd by Hayk 2026-11-07, Q26). Like a daily mix it has no lesson and
-- no section range. Only the two CHECKs that name the kinds change; no row changes.
-- Constraint names as Postgres made them for 005 (read from pg_constraint on 2026-11-07).
-- Apply with: uv run backend/scripts/migrate.py apply   (never edit this file after it ran).

ALTER TABLE path_events DROP CONSTRAINT path_events_kind_check;
ALTER TABLE path_events ADD CONSTRAINT path_events_kind_check CHECK (kind IN ('station', 'daily-mix', 'review-round'));

ALTER TABLE path_events DROP CONSTRAINT path_events_check;
ALTER TABLE path_events ADD CONSTRAINT path_events_check CHECK (
  (kind = 'station' AND lesson_id IS NOT NULL AND section_from >= 0 AND section_to > section_from)
  OR (kind IN ('daily-mix', 'review-round') AND lesson_id IS NULL AND section_from IS NULL AND section_to IS NULL)
);
