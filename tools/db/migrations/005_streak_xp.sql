-- Migration 005: streak rest-days + freeze, and a server-side daily-XP tally.
-- Run via Supabase SQL editor or: supabase db push
--
-- The streak now counts consecutive *weekday* check-ins (weekends are rest days)
-- and can be saved once by a banked freeze. The daily-goal ring reads xp_today
-- (a server-side tally that resets each day) so XP no longer drifts between the
-- ring and the hero readout. The application code degrades gracefully until this
-- migration is applied (treats the columns as absent / default).

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS streak_freezes  INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_streak     INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkin_history JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS xp_today        INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_today_date   DATE;
