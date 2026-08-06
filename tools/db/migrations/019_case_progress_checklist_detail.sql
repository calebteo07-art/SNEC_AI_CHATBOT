-- Migration 019: the per-step OSCE ledger
-- Run via the /db-migrate skill or the Supabase SQL editor.
--
-- `compute_station_score` and the submit handler build a full per-step comparison for every
-- station -- which steps were performed, which were skipped, which were critical -- and then
-- throw it away. Only the aggregate `checklist_coverage` (0-40, migration 017) survived, so
-- the single most teachable artefact the platform produces was destroyed at the end of every
-- attempt and no trainer could ever reconstruct a run.
--
-- Shape (one object per step, in the station's own order):
--   [{"step_number": 3, "action": "Check allergy status", "phase": "Preparation",
--     "critical": true, "performed": false, "skipped": true}]
--
-- `phase` is stamped from the same `group_by_phase` helper /station uses, so a persisted
-- ledger groups exactly as the ledger the student saw on screen.
--
-- NULL means "this attempt predates the column", NEVER "this student performed no steps".
-- Deliberately NOT backfilled: the per-step record is not recoverable from anything that was
-- stored, and inventing one would assert a record we cannot verify -- the same reasoning
-- migration 017 records for not backfilling `grade_scale`.
--
-- Additive and nullable -> db.insert_case_result writes it when present and falls back to the
-- base four columns until this migration is applied.

ALTER TABLE case_progress
  ADD COLUMN IF NOT EXISTS checklist_detail JSONB;
