-- Migration 000: the base schema — the 12 tables, the extension, the two functions,
-- the hand-made indexes and the storage buckets that were created by hand in the
-- Supabase dashboard and never written down.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- READ THIS BEFORE YOU TRUST IT
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Migrations 001-019 were written by hand as the product grew; the tables they
-- ALTER were created by clicking around the Supabase dashboard in 2026, so no
-- CREATE TABLE for them existed anywhere. This file fills that hole so the database
-- can be rebuilt from source.
--
-- It began on 2026-08-28 as a RECONSTRUCTION from the PostgREST snapshot in
-- tools/db/SCHEMA-REFERENCE.md. On 2026-10-02 it was checked against a real
-- schema-only pg_dump of production (Postgres 17.6, taken with the Supabase CLI's
-- pg_dump pipeline) and corrected, so that this file plus 001-019 now produces
-- production's tables, columns, types, NOT NULLs, defaults, primary / unique /
-- foreign keys with their ON DELETE rules, CHECK constraints, indexes, functions,
-- RLS state and policies. The dump is kept offline, not in this repository, because
-- the repository is public. tools/db/REBUILD.md lists what the dump corrected.
--
-- STILL NOT VERIFIED:
--   • the storage buckets at the bottom. The dump leaves out the `storage` schema.
--   • EXECUTION. No statement here has been run against a Postgres server. The file
--     parses clean, and its parsed shape plus 001-019 diffs clean against the dump;
--     only running it proves every statement succeeds.
--
-- NOT REPRODUCED, on purpose: Supabase sets these up on every project.
--   • GRANTs to anon / authenticated / service_role. Production's come from the
--     `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public` entries in the
--     dump, which also apply to everything this file creates.
--   • the pg_stat_statements, supabase_vault and uuid-ossp extensions. Nothing in
--     the application uses them.
--
-- RUN ORDER: this file first, then 001 through 019 in numeric order.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── Extensions ────────────────────────────────────────────────────────────────
-- pgvector, for chunks.embedding. Production has it in `public` (the dump reads
-- `WITH SCHEMA "public"`). That is not the Supabase default — the dashboard's
-- "enable extension" button installs into the `extensions` schema — so the schema is
-- named here rather than left to the search_path.
--
-- ⚠ `IF NOT EXISTS` matches by extension NAME across every schema, so if you are
-- running this against a project where pgvector was already enabled through the
-- dashboard, this line is a silent no-op and the unqualified `vector(1536)` below
-- binds to `extensions.vector` instead. That database works, but it does not match
-- production. Only `ALTER EXTENSION vector SET SCHEMA public` relocates it.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- gen_random_uuid() — in core Postgres since 13. Supabase already has pgcrypto (in
-- the `extensions` schema), so on Supabase this is a no-op. Named here so a rebuild
-- on a plain Postgres 12 or earlier does not fail obscurely.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ── student_profiles ──────────────────────────────────────────────────────────
-- The central per-student row. Every gamification column added after this point
-- (xp, hearts, streak_freezes, division, boosts, …) arrives via migrations
-- 003, 004, 005, 006, 008, 009, 012, 016 and 018 — they are deliberately NOT here,
-- so that this file plus those migrations reproduces the live column set exactly
-- once, rather than twice.
--
-- The '' and jsonb defaults are production's, read from the dump. The PostgREST
-- snapshot could not show them: it renders an empty-string default and a jsonb
-- default as a blank, the same as no default at all.
CREATE TABLE IF NOT EXISTS student_profiles (
  student_id         UUID        PRIMARY KEY,
  role               TEXT        NOT NULL DEFAULT '',
  weak_topics        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  missed_findings    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  retention_scores   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  session_count      INTEGER     NOT NULL DEFAULT 0,
  streak             INTEGER     NOT NULL DEFAULT 0,
  last_active        DATE,
  learning_velocity  TEXT        NOT NULL DEFAULT 'stable',
  checkin_done_today BOOLEAN     NOT NULL DEFAULT false,
  supervisor_note    TEXT        NOT NULL DEFAULT '',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── student_auth ──────────────────────────────────────────────────────────────
-- Login credentials. `password_hash` is a bcrypt hash written by
-- tools/shared/auth.py; nothing anywhere stores a plaintext password.
-- `must_change` starts true so a provisioned account must set its own password
-- at first login.
--
-- ⚠ This table holds credentials for real people. If you are restoring into a new
-- project, restore the SCHEMA and let students re-enrol rather than copying rows.
CREATE TABLE IF NOT EXISTS student_auth (
  email         TEXT        PRIMARY KEY,
  password_hash TEXT        NOT NULL,
  must_change   BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── student_consent ───────────────────────────────────────────────────────────
-- PDPA consent record, and the identity of record: `student_name` is the name the
-- whole platform displays. student_id is the join key every other table uses.
CREATE TABLE IF NOT EXISTS student_consent (
  student_id     UUID        PRIMARY KEY,
  student_name   TEXT        NOT NULL DEFAULT '',
  email          TEXT        NOT NULL,
  consent_date   TIMESTAMPTZ,
  pdpa_version   TEXT        NOT NULL DEFAULT '',
  withdrawn_date TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Load-bearing. Without it, two concurrent first-logins by the same person create
-- two consent rows, so that person gets two student_ids and their profile, streak
-- and avatar strand behind whichever row a later read happens to pick
-- (tools/shared/db.py get_consent_by_email documents the race in full).
--
-- On plain `email`, NOT lower(email): that is what production has. It still works
-- as a case-insensitive guard today only because every path that writes this column
-- lower-cases the address first — login, /api/onboard, and the admin single and
-- bulk add, all through tools/shared/identity.py. The code enforces that, not the
-- database: a new writer that skips .lower() could store a case-variant duplicate
-- that this index would accept.
CREATE UNIQUE INDEX IF NOT EXISTS student_consent_email_idx
  ON student_consent (email);


-- ── approved_students ─────────────────────────────────────────────────────────
-- The enrolment allow-list: an email must appear here before it can be given an
-- account. `role` is the content scope the student is enrolled for.
CREATE TABLE IF NOT EXISTS approved_students (
  email      TEXT        PRIMARY KEY,
  full_name  TEXT        NOT NULL DEFAULT '',
  role       TEXT        NOT NULL DEFAULT '',
  added_by   TEXT        NOT NULL DEFAULT '',
  added_at   TIMESTAMPTZ,
  student_id UUID
);

-- Production has TWO identical btree indexes on student_id: this hand-made one, and
-- idx_approved_student_id from migration 002. Reproduced as found. Dropping one is a
-- production change, not a rebuild one.
CREATE INDEX IF NOT EXISTS approved_students_student_id_idx ON approved_students(student_id);


-- ── supervisors ───────────────────────────────────────────────────────────────
-- Staff accounts. `role` is 'supervisor', 'trainer' or 'admin'; anything that is
-- not exactly 'admin' is treated as trainer (tools/shared/db.py:534).
CREATE TABLE IF NOT EXISTS supervisors (
  email         TEXT PRIMARY KEY,
  supervisor_id TEXT NOT NULL DEFAULT '',
  cohort        TEXT NOT NULL DEFAULT 'SNEC',
  role          TEXT NOT NULL DEFAULT 'supervisor'
);


-- ── password_reset_otps ───────────────────────────────────────────────────────
-- One live reset code per email, hashed. Migration 013 adds the `attempts`
-- brute-force counter on top of this.
CREATE TABLE IF NOT EXISTS password_reset_otps (
  email      TEXT        PRIMARY KEY,
  otp_hash   TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── chat_sessions ─────────────────────────────────────────────────────────────
-- One row per tutor conversation. `summary` is NOT a generated recap: it is the
-- first 200 characters of the tutor's last reply, stored verbatim
-- (tools/chatbot/log_session.py:29-32). Treat it as personal data.
--
-- student_id has NO foreign key in production. That is faithful, not an omission:
-- the dump has FKs only on flashcards, flashcard_attempts, flashcard_deck_progress,
-- chunks, images and checklists.
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  topic       TEXT        NOT NULL DEFAULT '',
  summary     TEXT        NOT NULL DEFAULT '',
  token_count INTEGER     NOT NULL DEFAULT 0,
  model       TEXT        NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS chat_sessions_student_id_idx ON chat_sessions(student_id);


-- ── case_progress ─────────────────────────────────────────────────────────────
-- One row per completed OSCE station attempt. The grade columns arrive in
-- migrations 011 (rich sub-scores), 017 (checklist_coverage + grade_scale) and
-- 019 (checklist_detail); 003 adds the total_score CHECK.
--
-- `id` is GENERATED ALWAYS AS IDENTITY, as in production; tools/shared/db.py
-- insert_case_result never supplies an id. ALWAYS does not block a data restore:
-- COPY writes identity values as given, and pg_dump's --inserts output carries
-- OVERRIDING SYSTEM VALUE.
CREATE TABLE IF NOT EXISTS case_progress (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id   UUID        NOT NULL,
  case_id      TEXT        NOT NULL,
  total_score  INTEGER     NOT NULL DEFAULT 0,
  passed       BOOLEAN     NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Both hand-made in production. The single-column one is redundant — the composite
-- here and 002's idx_case_progress_student_time both lead with student_id — but it
-- exists, so it is reproduced.
CREATE INDEX IF NOT EXISTS case_progress_student_id_idx ON case_progress(student_id);
CREATE INDEX IF NOT EXISTS case_progress_student_id_case_id_idx ON case_progress(student_id, case_id);


-- ── documents ─────────────────────────────────────────────────────────────────
-- Knowledge-base source documents, one row per ingested PDF.
--
-- ⚠ documents / chunks / images are an ARCHIVE. Runtime chat retrieval was retired
-- for speed — the tutor injects the git-tracked workflows/ophthalmology_kb.md
-- instead — so nothing in the running application reads them. `checklists` below
-- is the exception and IS live.
--
-- `filename` UNIQUE is load-bearing: tools/kb/supabase_client.py:52 upserts with
-- on_conflict="filename", which PostgREST renders as ON CONFLICT (filename), and
-- Postgres rejects that at PLAN time with 42P10 unless a unique index on filename
-- exists. Without it a rebuilt database cannot ingest a single document. Inline, so
-- the constraint gets production's name, documents_filename_key.
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename    TEXT    NOT NULL UNIQUE,
  module      INTEGER NOT NULL,
  category    TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  page_count  INTEGER,
  ingested_at TIMESTAMPTZ DEFAULT now()
);


-- ── chunks ────────────────────────────────────────────────────────────────────
-- Embedded passages of each document. 1536 dimensions.
--
-- All three foreign keys to documents (chunks, images, checklists) are ON DELETE
-- CASCADE, as in production: deleting a document takes its chunks, figures and
-- checklist with it.
CREATE TABLE IF NOT EXISTS chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  page_start  INTEGER,
  page_end    INTEGER,
  text        TEXT    NOT NULL,
  token_count INTEGER,
  embedding   vector(1536),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Production's index exactly: hnsw, cosine, and a non-default ef_construction
-- (pgvector's defaults are m = 16, ef_construction = 64).
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 128);

CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);


-- ── images ────────────────────────────────────────────────────────────────────
-- Figures extracted from documents during ingestion, uploaded to the `kb-images`
-- storage bucket. The columns are named drive_* for historical reasons — an
-- earlier ingestion pipeline stored them on Google Drive.
CREATE TABLE IF NOT EXISTS images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number   INTEGER NOT NULL,
  image_index   INTEGER NOT NULL,
  drive_file_id TEXT,
  drive_url     TEXT,
  width_px      INTEGER,
  height_px     INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS images_document_id_idx ON images(document_id);


-- ── checklists ────────────────────────────────────────────────────────────────
-- ⚠ THE ONE TABLE HERE THAT IS LIVE, AUTHORITATIVE AND HAS NO BACKUP.
--
-- Every OSCE station reads it at runtime through get_checklist_by_name
-- (tools/api/routers/cases.py:36). `steps` is a JSONB array in which each step's
-- `notes` field carries the SNEC clinical grounding — and that field is exactly
-- what tests/fixtures/procedure_checklists.json drops, so the fixture LOOKS like a
-- backup and is not one. Losing this table breaks the OSCE station outright.
--
-- Restoring the schema alone leaves it empty. The rows must be migrated, or
-- re-ingested from the source PDFs via tools/kb/run_ingestion.py.
--
-- `document_id` UNIQUE for the same reason as documents.filename:
-- tools/kb/supabase_client.py:108 upserts with on_conflict="document_id", so without
-- it re-ingestion fails with 42P10. One checklist per document. Production has no
-- index on procedure_name (the first draft of this file invented one).
CREATE TABLE IF NOT EXISTS checklists (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID    NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  checklist_type TEXT    NOT NULL,
  procedure_name TEXT    NOT NULL,
  module         INTEGER NOT NULL,
  steps          JSONB   NOT NULL,
  total_steps    INTEGER,
  created_at     TIMESTAMPTZ DEFAULT now()
);


-- ── checklist_search() ────────────────────────────────────────────────────────
-- Exists in production, made by hand, and called by nothing in this repository —
-- the OSCE station reads checklists through get_checklist_by_name instead. Body
-- from the dump, so a rebuild matches.
CREATE OR REPLACE FUNCTION checklist_search(procedure TEXT)
RETURNS SETOF checklists
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM checklists WHERE procedure_name ILIKE '%' || procedure || '%' LIMIT 3;
$$;


-- ── semantic_search() ─────────────────────────────────────────────────────────
-- Production's signature and body, from the dump. The first draft of this file
-- rebuilt it from its call site and got the result columns wrong: production
-- returns chunk_id, not id, adds chunk_index, and has no page_end.
--
-- PostgREST matches RPC arguments by NAME, so query_embedding, top_k and
-- min_similarity must never be renamed (tools/kb/search.py:46). The caller reads
-- only `title` and `text` from each row (search.py format_context).
--
-- Not reachable from the running application: the only live import from search.py
-- is get_checklist_by_name, and search() itself runs only offline — in
-- tools/kb/run_ingestion.py's self-test and search.py's own __main__ block.
--
-- `query_embedding vector` has no (1536) because Postgres discards type modifiers on
-- function arguments; production's signature has none either.
CREATE OR REPLACE FUNCTION semantic_search(
  query_embedding vector,
  top_k           INTEGER DEFAULT 6,
  min_similarity  DOUBLE PRECISION DEFAULT 0.65
)
RETURNS TABLE (
  chunk_id    UUID,
  document_id UUID,
  filename    TEXT,
  title       TEXT,
  chunk_index INTEGER,
  page_start  INTEGER,
  text        TEXT,
  similarity  DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id, c.document_id, d.filename, d.title, c.chunk_index, c.page_start,
         c.text, 1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks c JOIN documents d ON d.id = c.document_id
  WHERE 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT top_k;
$$;


-- ── Storage buckets ───────────────────────────────────────────────────────────
-- ⚠ NOT CHECKED AGAINST THE DUMP, which leaves out the `storage` schema. The row
-- counts taken alongside it show two rows in storage.buckets, which agrees with this;
-- the ids and the public flag still come from the code. Both buckets are read with
-- get_public_url() (tools/kb/supabase_client.py:118-139), so both are public.
--
-- This runs on Supabase, which provides the storage schema; on a plain Postgres
-- there is no storage.buckets table and this block fails — skip it, and provide
-- object storage some other way.
INSERT INTO storage.buckets (id, name, public)
VALUES ('kb-images',      'kb-images',      true),
       ('selena-avatars', 'selena-avatars', true)
ON CONFLICT (id) DO NOTHING;


-- ── Row level security ────────────────────────────────────────────────────────
-- Production has RLS ENABLED on all 20 public tables. These 12 get it here; 001,
-- 004, 007, 010, 014, 015 and 016 enable it on the tables they create.
--
-- None of these 12 has a policy. Production's only three are the own-rows policies
-- on flashcards, flashcard_attempts and flashcard_deck_progress (001, 010, 015). RLS
-- with no policy denies everything to the anon and authenticated roles, so the anon
-- key reads nothing here, student_auth.password_hash included. The backend is
-- unaffected: it connects with the service-role key, which bypasses RLS.
ALTER TABLE student_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_auth        ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_consent     ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_students   ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_progress       ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE images              ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklists          ENABLE ROW LEVEL SECURITY;
