-- Migration 002: performance indexes for supervisor and analytics queries
-- Run after 001_flashcards.sql.

-- Supervisor cohort view: at-risk scan ordered by last_active
CREATE INDEX IF NOT EXISTS idx_profiles_last_active
  ON student_profiles(last_active DESC);

-- JSONB weak_topics GIN index for topic-filter queries
CREATE INDEX IF NOT EXISTS idx_profiles_weak_topics
  ON student_profiles USING gin(weak_topics);

-- Session history: per-student chronological queries
CREATE INDEX IF NOT EXISTS idx_sessions_student_created
  ON chat_sessions(student_id, created_at DESC);

-- Case history: per-student completion timeline
CREATE INDEX IF NOT EXISTS idx_case_progress_student_time
  ON case_progress(student_id, completed_at DESC);

-- Approved students lookup by student_id (admin role-assignment flow)
CREATE INDEX IF NOT EXISTS idx_approved_student_id
  ON approved_students(student_id);
