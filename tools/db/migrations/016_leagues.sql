-- Migration 016: promotion-only weekly leagues.
-- Run via the Supabase SQL editor (see the /db-migrate command). Never paste a file path.
--
-- The leaderboard becomes a weekly league: a student sits in a division, the top slice of
-- their division promotes every SGT Monday, and nobody is ever demoted. The rollover runs
-- lazily on the first board read of a new week rather than on a cron — league_seal makes
-- that once-per-period work idempotent under concurrent requests, since its primary key
-- rejects the second writer.
--
-- The application degrades gracefully until this is applied: an absent `division` reads as
-- Bronze, absent rank_prev means no movement arrows, and the rollover is skipped entirely.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS division                SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rank_prev               SMALLINT,
  ADD COLUMN IF NOT EXISTS rank_prev_day           DATE,
  ADD COLUMN IF NOT EXISTS league_result_seen_week DATE;

-- One row per student per closed week: the history that powers the Monday result screen.
-- xp_final is written by whichever path gets there first (see tools/profile/update_profile.py);
-- rank_final + outcome are filled when the week is closed.
CREATE TABLE IF NOT EXISTS league_week (
  student_id  TEXT     NOT NULL,
  week_start  DATE     NOT NULL,
  division    SMALLINT NOT NULL DEFAULT 1,
  xp_final    INT      NOT NULL DEFAULT 0,
  rank_final  SMALLINT,
  outcome     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, week_start)
);

CREATE INDEX IF NOT EXISTS league_week_week_idx ON league_week (week_start);

-- The idempotency guard. `key` is 'week:YYYY-MM-DD' for a rollover or 'day:YYYY-MM-DD' for
-- the daily rank snapshot. First writer wins and does the work; everyone else gets a
-- duplicate-key error and skips.
CREATE TABLE IF NOT EXISTS league_seal (
  key       TEXT PRIMARY KEY,
  sealed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
