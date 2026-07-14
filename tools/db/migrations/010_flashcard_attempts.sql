-- Migration 010: flashcard_attempts — per-card grading log (deep analytics, spec §8.1)
-- Run via the /db-migrate skill or the Supabase SQL editor.
--
-- Every graded flashcard answer is appended here so the Analytics dashboard can compute
-- true per-topic accuracy, accuracy-over-time and repeatedly-failed cards — the platform's
-- highest-volume learning signal, discarded before this migration. The app degrades
-- gracefully until applied: POST /api/flashcards/complete swallows a missing table and the
-- study loop is unaffected.

CREATE TABLE IF NOT EXISTS flashcard_attempts (
  attempt_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES student_profiles(student_id) ON DELETE CASCADE,
  card_id      TEXT,                                    -- NULL for static (non-SM-2) cards
  topic_tag    TEXT NOT NULL DEFAULT 'general',
  correct      BOOLEAN NOT NULL DEFAULT false,
  score        INTEGER NOT NULL DEFAULT 0,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-student, per-topic accuracy scan (the dashboard's hot path).
CREATE INDEX IF NOT EXISTS idx_flashcard_attempts_student_topic
  ON flashcard_attempts(student_id, topic_tag);

-- Per-student chronological scan for accuracy-over-time trends.
CREATE INDEX IF NOT EXISTS idx_flashcard_attempts_student_ts
  ON flashcard_attempts(student_id, ts DESC);

-- RLS mirrors the flashcards table: students touch only their own rows. The API uses the
-- service-role key (bypasses RLS); this guards against direct / anon-key access.
ALTER TABLE flashcard_attempts ENABLE ROW LEVEL SECURITY;

-- PG-safe idempotency: DROP-then-CREATE (Postgres has no guarded policy-creation syntax, PG 42601).
DROP POLICY IF EXISTS flashcard_attempts_own_student ON flashcard_attempts;
CREATE POLICY flashcard_attempts_own_student ON flashcard_attempts
  FOR ALL
  USING (student_id::text = auth.uid()::text);
