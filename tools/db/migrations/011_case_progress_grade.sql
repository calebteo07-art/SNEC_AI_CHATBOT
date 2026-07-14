-- Migration 011: case_progress rich OSCE grade columns (deep analytics, spec §8.2)
-- Run via the /db-migrate skill or the Supabase SQL editor.
--
-- The OSCE submit path already COMPUTES a Station-100 score, safety verdict, the two
-- sub-domain scores, the missed-critical steps and the coaching block — then dropped them.
-- These additive, nullable columns capture them so the Analytics dashboard can show cohort
-- safety-failure rate, sub-domain trends and most-missed critical steps. All nullable →
-- db.insert_case_result writes them when present and falls back to the base four columns
-- until this migration is applied.

ALTER TABLE case_progress
  ADD COLUMN IF NOT EXISTS score_100         INTEGER,
  ADD COLUMN IF NOT EXISTS safe              BOOLEAN,
  ADD COLUMN IF NOT EXISTS consult_technique INTEGER,
  ADD COLUMN IF NOT EXISTS judgement_safety  INTEGER,
  ADD COLUMN IF NOT EXISTS missed_critical   JSONB,
  ADD COLUMN IF NOT EXISTS coaching          JSONB;
