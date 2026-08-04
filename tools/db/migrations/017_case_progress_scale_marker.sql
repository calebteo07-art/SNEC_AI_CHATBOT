-- Migration 017: case_progress checklist bucket + the scoring-scheme stamp
-- Run via the /db-migrate skill or the Supabase SQL editor.
--
-- `consult_technique` and `judgement_safety` (migration 011) persist as bare INTEGERs, and
-- on 2026-08-04 the OSCE grade moved from two AI schemes ×50 to three buckets 40/30/30.
-- Rows written before that hold /50 values, rows after hold /30 values, and nothing stored
-- distinguishes them — so the staff Sub-scores column showed "40·38" then "22·26" and a
-- trainer read a rescale as a performance collapse. `grade_scale` is that missing marker:
-- 2 = the 40/30/30 buckets, NULL = the ×50 era that predates the stamp. It is deliberately
-- NOT backfilled — a NULL means "written before the stamp existed", which is exactly the
-- legacy scale, and inventing a value would assert a scale we cannot actually verify.
--
-- `checklist_coverage` is the third bucket. compute_station_score has always returned it,
-- but nothing persisted it, so the largest single component of the grade (40 of the 100)
-- and the most teachable one — which steps the student actually performed — was invisible
-- to staff. NULL here likewise means a pre-017 row, never a student who scored zero.
--
-- Both columns are additive and nullable → db.insert_case_result writes them when present
-- and falls back to the base four columns until this migration is applied.

ALTER TABLE case_progress
  ADD COLUMN IF NOT EXISTS checklist_coverage INTEGER,
  ADD COLUMN IF NOT EXISTS grade_scale        SMALLINT;
