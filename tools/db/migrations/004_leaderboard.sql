-- Migration 004: opt-in, supervisor-gated cohort leaderboard
-- Run via Supabase SQL editor or: supabase db push
--
-- The leaderboard is OFF by default and nobody appears on it unless they choose
-- to: a supervisor must enable it for the cohort AND each student must opt in.
-- The application code degrades gracefully until this migration is applied
-- (treats the column/table as absent => leaderboard simply stays disabled).

-- Per-student opt-in (default off — a student only appears if they choose to).
ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS leaderboard_opt_in BOOLEAN NOT NULL DEFAULT false;

-- Per-cohort enable flag, controlled by a supervisor (default off).
CREATE TABLE IF NOT EXISTS leaderboard_settings (
  cohort      TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
