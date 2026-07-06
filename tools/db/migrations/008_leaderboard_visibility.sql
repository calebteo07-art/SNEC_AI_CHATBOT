-- Migration 008: D7 leaderboard visibility — opt-out + optional display name
-- Run via the /db-migrate skill or the Supabase SQL editor.
--
-- RICOE v2 D7 flips the leaderboard to "everyone by default": a student is ranked
-- by XP unless they hide themselves. `display_name` is an optional public alias
-- (else we show first-name + last-initial). The app degrades gracefully until this
-- is applied — GET /api/leaderboard returns an empty board when the column is absent,
-- and POST /api/leaderboard/prefs returns 503. The v1 `leaderboard_opt_in` column
-- (migration 004) is now unused and left in place.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS leaderboard_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_name       TEXT;
