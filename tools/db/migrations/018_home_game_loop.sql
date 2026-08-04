-- Migration 018: the Home game loop — daily quests, the daily chest, timed boosts.
-- Run via the Supabase SQL editor (see the /db-migrate command). Never paste a file path.
--
-- Three nullable columns, mirroring the existing xp_today / xp_today_date pattern: a
-- daily blob plus the SGT day it belongs to, so a stale stamp reads as empty and no reset
-- job is ever needed. `boosts` is durable and deliberately outlives the day.
--
-- The application degrades gracefully until this is applied: daily_state reads as empty,
-- so quests show zero progress, the chest is unclaimable and the boost multiplier is 1.0.
-- The app is fully functional; the mechanics are simply dark. Same as how 016 shipped.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS daily_state      JSONB,
  ADD COLUMN IF NOT EXISTS daily_state_date DATE,
  ADD COLUMN IF NOT EXISTS boosts           JSONB;
