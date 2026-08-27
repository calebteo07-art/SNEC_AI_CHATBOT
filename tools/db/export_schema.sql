-- ============================================================================
-- EyeBot — read the live database's own schema
-- ============================================================================
--
-- WHY THIS FILE EXISTS
--   The migrations in this directory are almost entirely ALTER TABLE. The
--   tables themselves were created by hand in the Supabase dashboard and never
--   captured as SQL, so the running database is the only copy of its own
--   structure. See docs/OPERATIONS.md §4.
--
--   The permanent fix is one command, and it needs the Postgres password from
--   Supabase -> Project Settings -> Database (NOT the service-role key, which
--   is a REST token and cannot authenticate pg_dump):
--
--     pg_dump --schema-only --no-owner --no-privileges "$SUPABASE_DB_URL" \
--       > tools/db/migrations/000_base_schema.sql
--
--   This file is the stopgap for when that password is not to hand: every
--   query below is SELECT-only, runs in the Supabase SQL editor, and between
--   them they show the whole schema.
--
-- HOW TO USE
--   Supabase dashboard -> SQL Editor -> New query -> paste ONE section at a
--   time -> Run -> "Download CSV" to keep the result.
--
-- SAFE TO RUN ON PRODUCTION. Nothing here writes, locks or drops anything.
-- ============================================================================


-- -- 1. Every table and column ------------------------------------------------
-- The blank-form definition: what boxes exist, what each accepts, what fills in
-- when left empty. format_type() is deliberate — information_schema reports the
-- pgvector column as "USER-DEFINED" and hides its dimension, which is the one
-- number that cannot be guessed from the repo.
SELECT c.relname                                   AS table_name,
       a.attnum                                    AS position,
       a.attname                                   AS column_name,
       format_type(a.atttypid, a.atttypmod)        AS data_type,
       CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'nullable' END AS nullable,
       pg_get_expr(d.adbin, d.adrelid)             AS default_value
FROM   pg_attribute a
JOIN   pg_class     c ON c.oid = a.attrelid
JOIN   pg_namespace n ON n.oid = c.relnamespace
LEFT   JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE  n.nspname = 'public'
AND    c.relkind = 'r'
AND    a.attnum > 0
AND    NOT a.attisdropped
ORDER  BY c.relname, a.attnum;


-- -- 2. Keys, uniqueness and CHECK rules ---------------------------------------
-- The rules the database enforces regardless of what the application does.
-- Includes the UNIQUE(lower(email)) index on student_consent, which exists in
-- no migration file and which the first-login identity path depends on.
SELECT cl.relname               AS table_name,
       con.conname              AS constraint_name,
       CASE con.contype WHEN 'p' THEN 'PRIMARY KEY'
                        WHEN 'f' THEN 'FOREIGN KEY'
                        WHEN 'u' THEN 'UNIQUE'
                        WHEN 'c' THEN 'CHECK'
                        ELSE con.contype::text END AS constraint_type,
       pg_get_constraintdef(con.oid) AS definition
FROM   pg_constraint con
JOIN   pg_class cl     ON cl.oid = con.conrelid
JOIN   pg_namespace n  ON n.oid = cl.relnamespace
WHERE  n.nspname = 'public'
ORDER  BY cl.relname, con.contype, con.conname;


-- -- 3. Indexes ---------------------------------------------------------------
-- Includes any vector index (hnsw / ivfflat) on chunks.embedding.
SELECT tablename, indexname, indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
ORDER  BY tablename, indexname;


-- -- 4. Stored functions ------------------------------------------------------
-- Run this one even if you run nothing else. semantic_search() is called at
-- tools/kb/search.py:47 and its source exists NOWHERE in this repository, so
-- this query is the only way to recover it.
--
-- To be precise about urgency: it is NOT reachable from the running app. The
-- only live import from search.py is get_checklist_by_name (tools/api/routers/
-- cases.py:36), which reads the checklists table; search() itself is imported
-- only by the offline tools/kb/run_ingestion.py. So losing it breaks no student
-- journey today — it permanently removes the ability to switch KB retrieval
-- back on, because nothing left in the repo knows what the function did.
SELECT p.proname                                    AS function_name,
       pg_get_function_identity_arguments(p.oid)    AS arguments,
       pg_get_functiondef(p.oid)                    AS full_source
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
AND    p.prokind IN ('f', 'p')
ORDER  BY p.proname;


-- -- 5. Extensions ------------------------------------------------------------
-- pgvector is an undeclared dependency: no CREATE EXTENSION anywhere in the
-- repo. Note the schema it is installed into — pg_dump --schema=public alone
-- will not carry it.
SELECT e.extname, e.extversion, n.nspname AS installed_in_schema
FROM   pg_extension e
JOIN   pg_namespace n ON n.oid = e.extnamespace
ORDER  BY e.extname;


-- -- 6. Row-level security ----------------------------------------------------
-- The repo only sets RLS on 4 tables, so the posture on the rest is unknown
-- until you run this. The backend uses the service-role key and bypasses RLS
-- entirely; these policies guard anon-key access only.
SELECT c.relname             AS table_name,
       c.relrowsecurity      AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public' AND c.relkind = 'r'
ORDER  BY c.relname;

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public'
ORDER  BY tablename, policyname;


-- -- 7. Triggers and views ----------------------------------------------------
SELECT c.relname AS table_name, t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS definition
FROM   pg_trigger t
JOIN   pg_class c ON c.oid = t.tgrelid
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public' AND NOT t.tgisinternal
ORDER  BY c.relname, t.tgname;

SELECT table_name, view_definition
FROM   information_schema.views
WHERE  table_schema = 'public'
ORDER  BY table_name;


-- -- 8. Storage buckets -------------------------------------------------------
-- kb-images and selena-avatars. pg_dump captures the metadata rows below but
-- NOT the file bytes — those need `supabase storage cp -r` or the S3 endpoint.
SELECT id, name, public, created_at FROM storage.buckets ORDER BY name;

SELECT bucket_id,
       count(*) AS objects,
       pg_size_pretty(sum((metadata->>'size')::bigint)) AS total_bytes
FROM   storage.objects
GROUP  BY bucket_id
ORDER  BY bucket_id;


-- -- 9. How big the export is going to be --------------------------------------
-- Approximate row counts, from the planner's statistics — instant, no scan.
SELECT c.relname AS table_name,
       c.reltuples::bigint AS approx_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public' AND c.relkind = 'r'
ORDER  BY pg_total_relation_size(c.oid) DESC;
