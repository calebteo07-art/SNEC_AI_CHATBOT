-- Migration 001: flashcards table
-- Run via Supabase SQL editor or: supabase db push
-- Replaces Google Sheets snec_flashcards tab for all future card storage.

CREATE TABLE IF NOT EXISTS flashcards (
  card_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES student_profiles(student_id) ON DELETE CASCADE,
  topic_tag        TEXT NOT NULL DEFAULT 'general',
  front            TEXT NOT NULL,
  back             TEXT NOT NULL,
  repetitions      INT  NOT NULL DEFAULT 0,
  easiness         FLOAT NOT NULL DEFAULT 2.5,
  interval_days    INT  NOT NULL DEFAULT 0,
  next_due         DATE NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed    TIMESTAMPTZ,
  source           TEXT NOT NULL DEFAULT 'session',  -- 'session' | 'rag'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for due-card queries (student + date range) — primary hot path
CREATE INDEX IF NOT EXISTS idx_flashcards_student_due
  ON flashcards(student_id, next_due);

-- Index for topic-scoped weak-area queries
CREATE INDEX IF NOT EXISTS idx_flashcards_student_topic
  ON flashcards(student_id, topic_tag);

-- Row-level security: students can only read/write their own cards.
-- Note: the API uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS;
-- this policy protects against direct DB / anon-key access.
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY flashcards_own_student ON flashcards
  FOR ALL
  USING (student_id::text = auth.uid()::text);
