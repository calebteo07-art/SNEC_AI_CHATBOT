-- Migration 015: flashcard_deck_progress — which difficulty decks a student has cleared
-- Run via the /db-migrate skill or the Supabase SQL editor.
--
-- Each flashcard topic is a ladder of 5 decks x 10 cards, easiest deck first
-- (tools/flashcards/card_levels.py). This table records which rungs a student has
-- cleared, so the API can serve the next deck and stop paying Lumens once all 5 are
-- done (the topic stays playable as free practice).
--
-- The composite PRIMARY KEY makes a replayed deck idempotent — re-clearing a level can
-- never double-count progress — and it indexes the (student_id, topic_key) read the
-- topic picker does on every load, so no separate index is needed.
--
-- Progress deliberately does NOT derive from flashcard_attempts: a Mixed deck writes
-- attempts against up to 10 DIFFERENT topics, which would inflate every one of them and
-- silently retire topics the student never studied.
--
-- The app degrades gracefully until applied: a missing table reads as "no decks cleared",
-- so every student sees deck 1 and keeps earning. It fails toward earning, never toward
-- locking a student out.

CREATE TABLE IF NOT EXISTS flashcard_deck_progress (
  student_id   UUID NOT NULL REFERENCES student_profiles(student_id) ON DELETE CASCADE,
  topic_key    TEXT NOT NULL,
  level        SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, topic_key, level)
);

-- RLS mirrors flashcards / flashcard_attempts: students touch only their own rows. The
-- API uses the service-role key (bypasses RLS); this guards direct / anon-key access.
ALTER TABLE flashcard_deck_progress ENABLE ROW LEVEL SECURITY;

-- PG-safe idempotency: DROP-then-CREATE (Postgres has no guarded policy-creation syntax, PG 42601).
DROP POLICY IF EXISTS flashcard_deck_progress_own_student ON flashcard_deck_progress;
CREATE POLICY flashcard_deck_progress_own_student ON flashcard_deck_progress
  FOR ALL
  USING (student_id::text = auth.uid()::text);
