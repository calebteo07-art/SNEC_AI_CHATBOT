-- Migration 000: the base schema — the 12 tables, the extension, the function and
-- the storage buckets that were created by hand in the Supabase dashboard and never
-- written down.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- READ THIS BEFORE YOU TRUST IT
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This file is a RECONSTRUCTION, not a dump. Migrations 001-019 were written by
-- hand as the product grew; the tables they ALTER were created by clicking around
-- the Supabase dashboard in 2026, so no CREATE TABLE for them exists anywhere.
-- This file fills that hole so the database can be rebuilt from source.
--
-- WHAT IS VERIFIED (read from the live production database on 2026-08-27, via the
-- PostgREST OpenAPI description at GET /rest/v1/ — see tools/db/SCHEMA-REFERENCE.md):
--   • every column name, in order
--   • every column type, including vector(1536)
--   • every NOT NULL
--   • every column DEFAULT **except on jsonb columns** — see below
--   • every PRIMARY KEY, including the composite ones
--   • every FOREIGN KEY's referenced table and column
--
-- WHAT IS RECONSTRUCTED, AND COULD BE WRONG (PostgREST does not expose these):
--   • the ON DELETE rule of each foreign key below. Left at the Postgres default
--     (NO ACTION) deliberately: if production really is ON DELETE CASCADE, this is
--     stricter than production and a delete errors instead of silently taking rows
--     with it. That is the safe direction to be wrong in.
--   • the body of semantic_search() — see the note above it.
--   • the index on chunks.embedding — type and parameters are a guess.
--   • whether ROW LEVEL SECURITY is enabled on any of these 12 tables. It is NOT
--     enabled below. See the RLS section at the bottom.
--   • CHECK constraints, other than the ones migrations 003/009/015 add.
--   • UNIQUE constraints. PostgREST reports none of them — not functional ones like
--     UNIQUE (lower(email)) on student_consent, and not ordinary ones either. Three
--     are created below, each recovered from the code rather than from the snapshot:
--     student_consent (lower(email)), documents(filename) and
--     checklists(document_id). The last two are provable — the ingestion path
--     upserts with ON CONFLICT on those columns, which Postgres rejects outright
--     unless a unique index exists — so production must have them. There may be
--     others nothing in the code reveals.
--   • jsonb column DEFAULTs. PostgREST omits them, so every jsonb column in the
--     snapshot shows a blank default whether or not it has one. Proof: migration
--     005 gives student_profiles.checkin_history a DEFAULT '[]'::jsonb, 005 is
--     applied, and the snapshot still shows that column's default as blank while
--     the plain INTEGER column from the same ALTER shows 0. So the four NOT NULL
--     jsonb columns below — student_profiles.weak_topics / missed_findings /
--     retention_scores and checklists.steps — may carry defaults in production that
--     are not reproduced here. Harmless to the running app, which always supplies
--     all four, but it means an INSERT that omits one fails here and succeeds in
--     production. Query 1 of export_schema.sql settles it (it uses pg_get_expr).
--   • smallint vs integer: PostgREST reports both as int32, so every integer here
--     is INTEGER. Production may use SMALLINT in places. Harmless in practice.
--
-- HOW TO REPLACE THE GUESSES WITH FACTS: run tools/db/export_schema.sql against the
-- live database (Supabase → SQL Editor) and compare. Better still, once you have the
-- Postgres password, `pg_dump --schema-only` and use that instead of this file.
-- tools/db/REBUILD.md has both procedures.
--
-- RUN ORDER: this file first, then 001 through 019 in numeric order.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── Extensions ────────────────────────────────────────────────────────────────
-- pgvector, for chunks.embedding.
--
-- Installed WITHOUT a target schema on purpose, so that on a FRESH database it
-- lands in `public`. That is not the Supabase default — the dashboard's "enable
-- extension" button installs into the `extensions` schema — but it is what this
-- project actually has: the live column reports its type as `public.vector(1536)`,
-- and a type is named by the schema it lives in.
--
-- ⚠ `IF NOT EXISTS` matches by extension NAME across every schema, so if you are
-- running this against a project where pgvector was already enabled through the
-- dashboard, this line is a silent no-op and the unqualified `vector(1536)` below
-- binds to `extensions.vector` instead. That database works, but it does not match
-- production. Only `ALTER EXTENSION vector SET SCHEMA public` relocates it.
CREATE EXTENSION IF NOT EXISTS vector;

-- gen_random_uuid() — in core Postgres since 13, and already present on Supabase.
-- Named here so a rebuild on a plain Postgres 12 or earlier does not fail obscurely.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ── student_profiles ──────────────────────────────────────────────────────────
-- The central per-student row. Every gamification column added after this point
-- (xp, hearts, streak_freezes, division, boosts, …) arrives via migrations
-- 003, 004, 005, 006, 008, 009, 012, 016 and 018 — they are deliberately NOT here,
-- so that this file plus those migrations reproduces the live column set exactly
-- once, rather than twice.
--
-- role, weak_topics, missed_findings, retention_scores and supervisor_note are
-- NOT NULL with no default, which is faithful to production: the application
-- always supplies them (tools/profile/get_profile.py `_DEFAULTS`).
CREATE TABLE IF NOT EXISTS student_profiles (
  student_id         UUID        PRIMARY KEY,
  role               TEXT        NOT NULL,
  weak_topics        JSONB       NOT NULL,
  missed_findings    JSONB       NOT NULL,
  retention_scores   JSONB       NOT NULL,
  session_count      INTEGER     NOT NULL DEFAULT 0,
  streak             INTEGER     NOT NULL DEFAULT 0,
  last_active        DATE,
  learning_velocity  TEXT        NOT NULL DEFAULT 'stable',
  checkin_done_today BOOLEAN     NOT NULL DEFAULT false,
  supervisor_note    TEXT        NOT NULL,
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
  student_name   TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  consent_date   TIMESTAMPTZ,
  pdpa_version   TEXT        NOT NULL,
  withdrawn_date TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Load-bearing. Without it, two concurrent first-logins by the same person create
-- two consent rows, so that person gets two student_ids and their profile, streak
-- and avatar strand behind whichever row a later read happens to pick
-- (tools/shared/db.py:935 get_consent_by_email documents the race in full).
--
-- ⚠ Certain that it is NEEDED; NOT certain that production has it. The only
-- evidence is that code comment — PostgREST does not report functional unique
-- indexes, so it is invisible in SCHEMA-REFERENCE.md. Query 3 of export_schema.sql
-- settles it. If a data restore hits a duplicate email here, this index will refuse
-- to build: that is the constraint doing its job, not a defect in this file.
CREATE UNIQUE INDEX IF NOT EXISTS student_consent_email_lower_uniq
  ON student_consent (lower(email));


-- ── approved_students ─────────────────────────────────────────────────────────
-- The enrolment allow-list: an email must appear here before it can be given an
-- account. `role` is the content scope the student is enrolled for.
CREATE TABLE IF NOT EXISTS approved_students (
  email      TEXT        PRIMARY KEY,
  full_name  TEXT        NOT NULL,
  role       TEXT        NOT NULL,
  added_by   TEXT        NOT NULL,
  added_at   TIMESTAMPTZ,
  student_id UUID
);


-- ── supervisors ───────────────────────────────────────────────────────────────
-- Staff accounts. `role` is 'supervisor', 'trainer' or 'admin'; anything that is
-- not exactly 'admin' is treated as trainer (tools/shared/db.py:534).
CREATE TABLE IF NOT EXISTS supervisors (
  email         TEXT PRIMARY KEY,
  supervisor_id TEXT NOT NULL,
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
-- the live constraint list shows FKs only on flashcards, flashcard_attempts,
-- flashcard_deck_progress, chunks, images and checklists.
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  topic       TEXT        NOT NULL,
  summary     TEXT        NOT NULL,
  token_count INTEGER     NOT NULL DEFAULT 0,
  model       TEXT        NOT NULL
);


-- ── case_progress ─────────────────────────────────────────────────────────────
-- One row per completed OSCE station attempt. The grade columns arrive in
-- migrations 011 (rich sub-scores), 017 (checklist_coverage + grade_scale) and
-- 019 (checklist_detail); 003 adds the total_score CHECK.
--
-- `id` is an identity column, not a serial: production reports it NOT NULL with no
-- DEFAULT, which is what an identity column looks like through PostgREST, and
-- tools/shared/db.py:insert_case_result never supplies an id. BY DEFAULT rather
-- than ALWAYS so a data restore can write explicit ids.
CREATE TABLE IF NOT EXISTS case_progress (
  id           BIGINT      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  student_id   UUID        NOT NULL,
  case_id      TEXT        NOT NULL,
  total_score  INTEGER     NOT NULL DEFAULT 0,
  passed       BOOLEAN     NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── documents ─────────────────────────────────────────────────────────────────
-- Knowledge-base source documents, one row per ingested PDF.
--
-- ⚠ documents / chunks / images are an ARCHIVE. Runtime chat retrieval was retired
-- for speed — the tutor injects the git-tracked workflows/ophthalmology_kb.md
-- instead — so nothing in the running application reads them. `checklists` below
-- is the exception and IS live.
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename    TEXT    NOT NULL,
  module      INTEGER NOT NULL,
  category    TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  page_count  INTEGER,
  ingested_at TIMESTAMPTZ DEFAULT now()
);

-- Production MUST have this, and it is invisible in SCHEMA-REFERENCE.md because
-- PostgREST does not report unique constraints. The evidence is that ingestion
-- works today: tools/kb/supabase_client.py:52 upserts with on_conflict="filename",
-- which PostgREST renders as ON CONFLICT (filename), and Postgres rejects that at
-- PLAN time with 42P10 unless a unique index on filename exists. Without this line
-- a rebuilt database cannot ingest a single document — the failure is immediate and
-- total, not a slow drift. Confirm the real constraint's name and shape with
-- queries 2 and 3 of tools/db/export_schema.sql.
CREATE UNIQUE INDEX IF NOT EXISTS documents_filename_uniq ON documents(filename);


-- ── chunks ────────────────────────────────────────────────────────────────────
-- Embedded passages of each document. 1536 dimensions — read from the live column
-- type, not assumed.
CREATE TABLE IF NOT EXISTS chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID    NOT NULL REFERENCES documents(id),
  chunk_index INTEGER NOT NULL,
  page_start  INTEGER,
  page_end    INTEGER,
  text        TEXT    NOT NULL,
  token_count INTEGER,
  embedding   vector(1536),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ⚠ RECONSTRUCTED. An index of some kind exists in production, but PostgREST does
-- not describe indexes, so its type (hnsw vs ivfflat), its operator class and its
-- build parameters are unknown. Cosine is the right operator class for the
-- similarity semantic_search() computes below, and hnsw needs no training rows.
-- Confirm against query 3 (Indexes) of tools/db/export_schema.sql and correct this.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);


-- ── images ────────────────────────────────────────────────────────────────────
-- Figures extracted from documents during ingestion, uploaded to the `kb-images`
-- storage bucket. The columns are named drive_* for historical reasons — an
-- earlier ingestion pipeline stored them on Google Drive.
CREATE TABLE IF NOT EXISTS images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID    NOT NULL REFERENCES documents(id),
  page_number   INTEGER NOT NULL,
  image_index   INTEGER NOT NULL,
  drive_file_id TEXT,
  drive_url     TEXT,
  width_px      INTEGER,
  height_px     INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now()
);


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
CREATE TABLE IF NOT EXISTS checklists (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID    NOT NULL REFERENCES documents(id),
  checklist_type TEXT    NOT NULL,
  procedure_name TEXT    NOT NULL,
  module         INTEGER NOT NULL,
  steps          JSONB   NOT NULL,
  total_steps    INTEGER,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Same reasoning as documents_filename_uniq above: tools/kb/supabase_client.py:108
-- upserts with on_conflict="document_id", so production must carry a unique
-- constraint here or its own re-ingestion would fail with 42P10. Note this makes
-- the relationship one checklist per document, which is what the upsert asserts.
CREATE UNIQUE INDEX IF NOT EXISTS checklists_document_id_uniq ON checklists(document_id);

CREATE INDEX IF NOT EXISTS idx_checklists_procedure ON checklists(procedure_name);


-- ── semantic_search() ─────────────────────────────────────────────────────────
-- ⚠⚠ RECONSTRUCTED FROM ITS CALL SITE. The real body exists only inside the live
-- database and in no file in this repository. Replace it with the real one — query
-- F of tools/db/generate_ddl.sql prints it.
--
-- What IS known, and is honoured exactly below, because PostgREST RPC matches
-- arguments by NAME and a mismatch is a hard failure (tools/kb/search.py:46):
--   • the name is semantic_search
--   • the three parameters are query_embedding, top_k, min_similarity
--   • the result rows carry at least `title` and `text`
--     (tools/kb/search.py format_context reads exactly those two)
--
-- What is GUESSED: the remaining result columns, the similarity metric, and
-- whether the real function filters on min_similarity the way this one does.
--
-- Urgency, stated precisely: this function is NOT reachable from the running
-- application. The only live import from search.py is get_checklist_by_name;
-- search() itself is called only offline — by tools/kb/run_ingestion.py's
-- self-test and by search.py's own __main__ block (search.py:139). Losing the real body does not cause an outage — it removes the
-- ability to ever switch retrieval back on without rewriting this.
CREATE OR REPLACE FUNCTION semantic_search(
  query_embedding vector(1536),
  top_k           INTEGER DEFAULT 6,
  min_similarity  DOUBLE PRECISION DEFAULT 0.65
)
RETURNS TABLE (
  id          UUID,
  document_id UUID,
  title       TEXT,
  filename    TEXT,
  text        TEXT,
  page_start  INTEGER,
  page_end    INTEGER,
  similarity  DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id,
         c.document_id,
         d.title,
         d.filename,
         c.text,
         c.page_start,
         c.page_end,
         (1 - (c.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity
  FROM   chunks c
  JOIN   documents d ON d.id = c.document_id
  WHERE  c.embedding IS NOT NULL
    AND  (1 - (c.embedding <=> query_embedding)) >= min_similarity
  ORDER  BY c.embedding <=> query_embedding
  LIMIT  top_k;
$$;


-- ── Storage buckets ───────────────────────────────────────────────────────────
-- Two buckets, both read with get_public_url() (tools/kb/supabase_client.py:118-139),
-- so both are public. This runs on Supabase, which provides the storage schema;
-- on a plain Postgres there is no storage.buckets table and this block fails —
-- skip it, and provide object storage some other way.
INSERT INTO storage.buckets (id, name, public)
VALUES ('kb-images',      'kb-images',      true),
       ('selena-avatars', 'selena-avatars', true)
ON CONFLICT (id) DO NOTHING;


-- ── Row level security — DELIBERATELY NOT SET ─────────────────────────────────
-- ⚠ Whether RLS is enabled on the 12 tables above is UNKNOWN. PostgREST does not
-- report it, and this file does not guess, because guessing either way is bad:
-- enabling it wrongly locks out a caller production allows, and disabling it
-- wrongly exposes student_auth.password_hash to anyone holding the anon key.
--
-- Migrations 001, 010, 014 and 015 DO enable it on the tables they create, so the
-- pattern the project follows is: enable RLS, add an own-rows policy, and rely on
-- the service-role key (which bypasses RLS) for the backend.
--
-- Before trusting this file in production, run query 6 (Row-level security) of tools/db/export_schema.sql
-- against the live database and add the matching statements here.
--
-- Mitigating context, so this is not read as more alarming than it is: the browser
-- never talks to Supabase. The frontend contains zero Supabase references and zero
-- NEXT_PUBLIC_ variables, so no anon key is published to a client; every query goes
-- through the FastAPI backend behind a JWT. RLS here is defence in depth, not the
-- only lock on the door.
