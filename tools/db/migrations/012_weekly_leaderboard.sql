-- Migration 012: weekly leaderboard tally.
-- Run via Supabase SQL editor or: supabase db push
--
-- The cohort leaderboard now ranks by XP earned in the *current week* (it refreshes
-- every Monday, SGT). xp_week is a server-side tally that accumulates within a week and
-- resets on the first earn of a new week; xp_week_start stamps the Monday it belongs to
-- (a stale/NULL stamp reads as 0 this week, so inactive students drop off with no reset
-- job). This is the weekly twin of the xp_today daily tally from migration 005. The
-- application degrades gracefully until this migration is applied: the leaderboard falls
-- back to lifetime-XP ranking while these columns are absent, and the tally write is a
-- guarded no-op.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS xp_week       INT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_week_start DATE;
