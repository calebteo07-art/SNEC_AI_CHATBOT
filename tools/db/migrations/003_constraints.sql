-- Migration 003: data integrity constraints
-- Prevents out-of-range values reaching the DB regardless of application logic.
-- Run after 002_indexes.sql.
-- Uses DO blocks so re-running is safe (duplicate_object is silently ignored).

-- student_profiles: gamification field bounds
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

-- case_progress: rubric total is 4 domains × 10 points = 0-40
DO $$ BEGIN
  ALTER TABLE case_progress ADD CONSTRAINT chk_score CHECK (total_score BETWEEN 0 AND 40);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- flashcards: SM-2 field bounds
DO $$ BEGIN
  ALTER TABLE flashcards ADD CONSTRAINT chk_easiness CHECK (easiness >= 1.3);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE flashcards ADD CONSTRAINT chk_repetitions CHECK (repetitions >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE flashcards ADD CONSTRAINT chk_interval CHECK (interval_days >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
