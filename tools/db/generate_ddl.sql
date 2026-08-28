-- ============================================================================
-- EyeBot — make the database write its own CREATE TABLE statements
-- ============================================================================
--
-- WHAT THIS IS FOR
--   The tables in this database were created by hand in the Supabase dashboard
--   and never saved as SQL (docs/OPERATIONS.md §4). These queries ask Postgres
--   to reconstruct that SQL for you.
--
-- HOW TO USE  ***  READ THIS, IT MATTERS  ***
--   Run the queries ONE AT A TIME, in order, A through F.
--   For each: select just that one query, paste into Supabase -> SQL Editor,
--   Run, then copy the single result column. Paste the six results together,
--   in order, into one file. That file is your schema as SQL.
--
--   Do NOT paste this whole file in at once. Each query is deliberately
--   standalone so that if one fails you still get the other five, and so the
--   error tells you exactly which part broke.
--
-- IF SOMETHING ERRORS
--   Run query 0 first. If query 0 works, the connection is fine and the
--   problem is in one specific query below — send the error text.
--
-- THIS IS THE SECOND-BEST OPTION. The best is one command:
--
--     pg_dump --schema-only --no-owner --no-privileges "$SUPABASE_DB_URL" \
--       > tools/db/migrations/000_base_schema.sql
--
--   pg_dump is the tool Postgres ships for this job, it covers cases these
--   queries do not (sequence ownership, comments, generated columns, column
--   privileges), and its output is guaranteed to restore. Get $SUPABASE_DB_URL
--   from Supabase -> Project Settings -> Database. Nothing in this codebase
--   reads a Postgres connection string, so resetting that password cannot
--   break the running service.
--
-- LIMITS
--   * Verify the output: replay it into a scratch project, then diff against
--     production with tools/db/export_schema.sql.
--   * No data. Rows need a separate pg_dump --data-only.
--   * No Storage buckets (kb-images, selena-avatars) — these queries never read the
--     storage schema. The bucket ROWS are ordinary table rows, and
--     tools/db/migrations/000_base_schema.sql creates both with an INSERT INTO
--     storage.buckets. What no SQL carries is the stored OBJECTS themselves.
--
-- SAFE TO RUN ON PRODUCTION. These only read the system catalogues.
-- ============================================================================


-- ── 0. Connection check ─────────────────────────────────────────────────────
-- Run this first. It should return one row: your Postgres version and 20.
SELECT version() AS postgres_version,
       (SELECT count(*)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r') AS tables_found;


-- ── A. Extensions ───────────────────────────────────────────────────────────
-- Must come first: pgvector has to exist before a vector column can.
SELECT 'CREATE EXTENSION IF NOT EXISTS ' || quote_ident(e.extname)
         || ' WITH SCHEMA ' || quote_ident(n.nspname) || ';' AS statement
FROM   pg_extension e
JOIN   pg_namespace n ON n.oid = e.extnamespace
WHERE  e.extname <> 'plpgsql'
ORDER  BY e.extname;


-- ── B. The tables ───────────────────────────────────────────────────────────
-- Columns, types, defaults and NOT NULL. Keys and rules come in query C.
SELECT 'CREATE TABLE IF NOT EXISTS public.' || quote_ident(c.relname)
         || ' (' || chr(10) || '  '
         || string_agg(
              quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
              || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
              || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
              ',' || chr(10) || '  ' ORDER BY a.attnum)
         || chr(10) || ');' AS statement
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
JOIN   pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT   JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE  n.nspname = 'public' AND c.relkind = 'r'
GROUP  BY c.relname
ORDER  BY c.relname;


-- ── C. Keys, uniqueness, CHECK rules, foreign keys ──────────────────────────
-- Ordered so it replays: primary and unique keys first, then CHECKs, then
-- foreign keys last — an FK cannot be added before the key it points at exists.
SELECT 'ALTER TABLE public.' || quote_ident(cl.relname)
         || ' ADD CONSTRAINT ' || quote_ident(con.conname) || ' '
         || pg_get_constraintdef(con.oid) || ';' AS statement
FROM   pg_constraint con
JOIN   pg_class cl     ON cl.oid = con.conrelid
JOIN   pg_namespace n  ON n.oid = cl.relnamespace
WHERE  n.nspname = 'public'
ORDER  BY CASE con.contype WHEN 'p' THEN 1
                           WHEN 'u' THEN 2
                           WHEN 'c' THEN 3
                           ELSE 4 END,
          cl.relname, con.conname;


-- ── D. Indexes ──────────────────────────────────────────────────────────────
-- Skips the indexes Postgres created to back a constraint in query C, because
-- creating those a second time is an error. indexdef is already valid SQL.
SELECT i.indexdef || ';' AS statement
FROM   pg_indexes i
WHERE  i.schemaname = 'public'
AND    NOT EXISTS (
         SELECT 1
         FROM   pg_constraint con
         JOIN   pg_class cl    ON cl.oid = con.conrelid
         JOIN   pg_namespace n ON n.oid = cl.relnamespace
         WHERE  n.nspname = 'public'
         AND    con.conname = i.indexname)
ORDER  BY i.tablename, i.indexname;


-- ── E. Row-level security, then the policies ────────────────────────────────
SELECT 'ALTER TABLE public.' || quote_ident(t.tablename)
         || ' ENABLE ROW LEVEL SECURITY;' AS statement
FROM   pg_tables t
WHERE  t.schemaname = 'public' AND t.rowsecurity
ORDER  BY t.tablename;

SELECT 'CREATE POLICY ' || quote_ident(p.policyname)
         || ' ON public.' || quote_ident(p.tablename)
         || ' AS ' || p.permissive
         || ' FOR ' || p.cmd
         || ' TO ' || array_to_string(p.roles, ', ')
         || coalesce(' USING (' || p.qual || ')', '')
         || coalesce(' WITH CHECK (' || p.with_check || ')', '')
         || ';' AS statement
FROM   pg_policies p
WHERE  p.schemaname = 'public'
ORDER  BY p.tablename, p.policyname;


-- ── F. Stored functions ─────────────────────────────────────────────────────
-- Run this one even if you run nothing else. semantic_search() is called at
-- tools/kb/search.py:47 and its source exists in NO file in this repository.
SELECT pg_get_functiondef(pr.oid) || ';' AS statement
FROM   pg_proc pr
JOIN   pg_namespace n ON n.oid = pr.pronamespace
WHERE  n.nspname = 'public'
AND    pr.prokind IN ('f', 'p')
ORDER  BY pr.proname;
