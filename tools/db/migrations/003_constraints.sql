-- Migration 003: add missing gamification columns + data integrity constraints
-- Safe to re-run: ADD COLUMN IF NOT EXISTS and DO/EXCEPTION blocks are idempotent.

-- ── Step 1: add columns that may not exist yet ───────────────────────────────

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS xp               INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hearts           INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS hearts_reset_date DATE;

-- ── Step 2: constraints on student_profiles ──────────────────────────────────

DO $$ BEGIN
  ALTER TABLE student_profiles ADD CONSTRAINT chk_hearts CHECK (hearts BETWEEN 0 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE student_profiles ADD CONSTRAINT chk_xp CHECK (xp >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE student_profiles ADD CONSTRAINT chk_streak CHECK (streak >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE student_profiles ADD CONSTRAINT chk_velocity
    CHECK (learning_velocity IN ('improving', 'stable', 'declining'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Step 3: case_progress ────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE case_progress ADD CONSTRAINT chk_score CHECK (total_score BETWEEN 0 AND 40);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Step 4: flashcards (created by 001_flashcards.sql) ───────────────────────

DO $$ BEGIN
  ALTER TABLE flashcards ADD CONSTRAINT chk_easiness CHECK (easiness >= 1.3);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE flashcards ADD CONSTRAINT chk_repetitions CHECK (repetitions >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE flashcards ADD CONSTRAINT chk_interval CHECK (interval_days >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
