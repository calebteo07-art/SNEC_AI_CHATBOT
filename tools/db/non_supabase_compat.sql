-- Run this BEFORE 000_base_schema.sql when the target is NOT Supabase —
-- AWS RDS, Aurora, Cloud SQL, a Docker container, a laptop Postgres.
-- On Supabase itself, skip this file entirely; it is unnecessary there.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- WHY THIS IS NEEDED
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Supabase is not just Postgres. It is Postgres plus PostgREST (the HTTP API),
-- GoTrue (auth) and Storage, and the migration set reaches into two schemas that
-- only those services create:
--
--   storage.buckets   000_base_schema.sql — the INSERT near the end
--   auth.uid()        001:42, 010:36, 015:37 — inside CREATE POLICY
--
-- The auth.uid() ones are not cosmetic. Postgres analyses a policy's USING
-- expression when the policy is CREATED, not when it is first evaluated, so an
-- unresolvable auth.uid() aborts the CREATE POLICY statement outright. Migrations
-- 001, 010 and 015 fail on a plain Postgres, and 001 fails early enough to take
-- the flashcards table's indexes with it if the file is run as one transaction.
--
-- This file supplies the minimum stubs so the whole chain runs unmodified.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠ READ THIS BEFORE ASSUMING A PORT IS DONE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- These stubs make the SQL run. They do NOT make the application work. Nothing in
-- this codebase opens a Postgres connection — there is no psycopg, no asyncpg and
-- no SQLAlchemy anywhere. Every query goes over HTTP to PostgREST through
-- supabase-py (tools/shared/db.py:17 `from supabase import AsyncClient`).
--
-- So a correctly-shaped database on RDS is a database the app cannot talk to.
-- Moving off Supabase means one of:
--   * run PostgREST + GoTrue + Storage yourself in front of the new Postgres
--     (they are open source; this is the smallest-diff path, and the app may need
--     no code change at all beyond SUPABASE_URL), or
--   * replace the data layer in tools/shared/db.py, tools/shared/otp_store.py and
--     tools/kb/supabase_client.py with a real Postgres driver, and replace auth
--     and file storage separately.
--
-- Decide which before porting, not after.

-- ── auth ──────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;

-- Fail-closed stub. Real Supabase returns the caller's JWT subject; there is no
-- JWT here, so this returns NULL and every own-rows policy matches nothing. A role
-- WITHOUT BYPASSRLS therefore sees zero rows.
--
-- That is deliberately the safe direction. The alternative — deleting the three
-- policies so the files run — leaves the tables with RLS enabled and no policy,
-- or worse, RLS off entirely, and nothing would tell you which. Here the policies
-- stay installed and enforcing, and the application's own role is expected to
-- bypass RLS exactly as the Supabase service-role key does today.
--
-- ⚠ If you later wire up real auth, replace this function. Leaving the stub in
-- place while granting app users direct database logins would silently deny them
-- every row.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $$ SELECT NULL::uuid $$;


-- ── storage ───────────────────────────────────────────────────────────────────
-- Supabase Storage is an object store with a Postgres-backed catalogue. Outside
-- Supabase, neither exists. This creates only the catalogue table that 000's
-- INSERT targets, so the migration chain completes.
--
-- ⚠ IT STORES NO FILES. The columns below are the three 000 writes, not Supabase's
-- full definition. Serving kb-images and selena-avatars off Supabase needs a real
-- object store and a change to tools/kb/supabase_client.py:118-139, which calls
-- client.storage.from_(...). The rows this creates are a record of which buckets
-- ought to exist — nothing more.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  public BOOLEAN NOT NULL DEFAULT false
);


-- ── pgvector ──────────────────────────────────────────────────────────────────
-- 000 runs CREATE EXTENSION vector and builds an hnsw index. Neither is stubbed
-- here, because both are real requirements rather than Supabase conveniences:
--
--   * AWS RDS / Aurora Postgres ship pgvector from 15.2 / 14.7 onward — available,
--     but you may need to allow it in the parameter group first.
--   * hnsw needs pgvector 0.5.0+. On an older build, swap 000's index for
--     ivfflat: CREATE INDEX ... USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);  -- and note ivfflat must be built AFTER loading rows,
--     or it trains on an empty table and recall collapses.
--   * A local Postgres needs pgvector compiled and installed; it is not bundled.
--
-- If pgvector is genuinely unavailable, the only column that needs it is
-- chunks.embedding, and chunks is a dead archive at runtime — the tutor reads the
-- git-tracked workflows/ophthalmology_kb.md, not the database. Dropping the column
-- and the index costs you the ability to re-enable retrieval later, and nothing
-- that is running today.
