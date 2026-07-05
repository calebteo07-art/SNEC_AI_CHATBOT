-- Migration 006: per-student Selena avatar config (RICOE v2 Foundation 2)
--
-- Stores each student's layered-vector avatar as a small JSON config. The app
-- degrades gracefully until this is applied: GET /api/avatar returns the default
-- look when the column/value is absent; PUT /api/avatar needs the column.
-- Apply via the /db-migrate skill or the Supabase SQL editor.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS avatar_config JSONB;
