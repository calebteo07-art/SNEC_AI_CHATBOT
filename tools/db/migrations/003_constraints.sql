-- Migration 003: data integrity constraints
-- Prevents out-of-range values reaching the DB regardless of application logic.
-- Run after 002_indexes.sql.

-- student_profiles: gamification field bounds
ALTER TABLE student_profiles
  ADD CONSTRAINT IF NOT EXISTS chk_hearts
    CHECK (hearts BETWEEN 0 AND 5),
  ADD CONSTRAINT IF NOT EXISTS chk_xp
    CHECK (xp >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_streak
    CHECK (streak >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_velocity
    CHECK (learning_velocity IN ('improving', 'stable', 'declining'));

-- case_progress: rubric total is 4 domains × 10 points = 0-40
ALTER TABLE case_progress
  ADD CONSTRAINT IF NOT EXISTS chk_score
    CHECK (total_score BETWEEN 0 AND 40);

-- flashcards: SM-2 field bounds
ALTER TABLE flashcards
  ADD CONSTRAINT IF NOT EXISTS chk_easiness
    CHECK (easiness >= 1.3),
  ADD CONSTRAINT IF NOT EXISTS chk_repetitions
    CHECK (repetitions >= 0),
  ADD CONSTRAINT IF NOT EXISTS chk_interval
    CHECK (interval_days >= 0);
