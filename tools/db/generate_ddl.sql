-- ============================================================================
-- EyeBot — make the database write its own CREATE TABLE statements
-- ============================================================================
--
-- WHAT THIS IS FOR
--   The tables in this database were created by hand in the Supabase dashboard
--   and never saved as SQL (docs/OPERATIONS.md §4). This query asks Postgres to
--   reconstruct the SQL for you. Paste it into the Supabase SQL editor, run it,
--   and the result is one column of ready-to-run statements: extensions, then
--   tables, then keys and rules, then indexes, then security policies, then
--   stored functions — already in dependency order.
--
--   Copy that column out and you have the schema as SQL.
--
-- THIS IS THE SECOND-BEST OPTION. The best is one command:
--
--     pg_dump --schema-only --no-owner --no-privileges "$SUPABASE_DB_URL" \
--       > tools/db/migrations/000_base_schema.sql
--
--   Use pg_dump if you can. It is the tool Postgres ships for exactly this job,
--   it handles cases this query does not (sequence ownership, column-level
--   privileges, comments, partitioning, generated columns), and its output is
--   guaranteed to restore. Get $SUPABASE_DB_URL from Supabase -> Project
--   Settings -> Database. Nothing in this codebase reads a Postgres connection
--   string, so resetting that password cannot break the running service.
--
--   This query exists for when you do not have that password to hand — in a
--   meeting, on someone else's laptop, or with only dashboard access.
--
-- KNOWN LIMITS — read before trusting the output
--   * Verify it. Run the output against a scratch Supabase project, then diff
--     that project against production using tools/db/export_schema.sql.
--   * It does not carry data. Rows need a separate --data-only dump.
--   * It does not create Storage buckets (kb-images, selena-avatars). No SQL
--     can; make those in the dashboard.
--   * Extension objects may need the extension installed into the same schema
--     it currently occupies — check the CREATE EXTENSION lines it emits first.
--
-- SAFE TO RUN ON PRODUCTION. It only reads the system catalogues.
-- ============================================================================

WITH ddl AS (

    -- 1. Extensions first — pgvector must exist before a vector column does.
    SELECT 1                          AS sort_key,
           e.extname::text            AS obj,
           'CREATE EXTENSION IF NOT EXISTS ' || quote_ident(e.extname)
             || ' WITH SCHEMA ' || quote_ident(n.nspname) || ';' AS statement
    FROM   pg_extension e
    JOIN   pg_namespace n ON n.oid = e.extnamespace
    WHERE  e.extname <> 'plpgsql'

    UNION ALL

    -- 2. The tables themselves: columns, types, defaults, NOT NULL.
    SELECT 2,
           c.relname::text,
           'CREATE TABLE IF NOT EXISTS public.' || quote_ident(c.relname)
             || ' (' || chr(10) || '  '
             || string_agg(
                  quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
                  || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
                  || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
                  ',' || chr(10) || '  ' ORDER BY a.attnum)
             || chr(10) || ');'
    FROM   pg_class c
    JOIN   pg_namespace n ON n.oid = c.relnamespace
    JOIN   pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT   JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE  n.nspname = 'public' AND c.relkind = 'r'
    GROUP  BY c.relname

    UNION ALL

    -- 3-5. Constraints, in an order that can actually be replayed: primary and
    -- unique keys first, then CHECKs, then foreign keys last — an FK cannot be
    -- added until the key it points at exists.
    SELECT CASE con.contype WHEN 'p' THEN 3
                            WHEN 'u' THEN 3
                            WHEN 'c' THEN 4
                            ELSE 5 END,
           cl.relname::text,
           'ALTER TABLE public.' || quote_ident(cl.relname)
             || ' ADD CONSTRAINT ' || quote_ident(con.conname) || ' '
             || pg_get_constraintdef(con.oid) || ';'
    FROM   pg_constraint con
    JOIN   pg_class cl ON cl.oid = con.conrelid
    WHERE  con.connamespace = 'public'::regnamespace

    UNION ALL

    -- 6. Indexes, skipping the ones Postgres created to back a constraint above
    -- (adding those twice is an error). pg_indexes.indexdef is already valid SQL.
    SELECT 6,
           i.tablename::text,
           i.indexdef || ';'
    FROM   pg_indexes i
    WHERE  i.schemaname = 'public'
    AND    NOT EXISTS (SELECT 1 FROM pg_constraint con
                       WHERE con.connamespace = 'public'::regnamespace
                       AND   con.conname = i.indexname)

    UNION ALL

    -- 7. Turn row-level security back on wherever it is on today.
    SELECT 7,
           t.tablename::text,
           'ALTER TABLE public.' || quote_ident(t.tablename)
             || ' ENABLE ROW LEVEL SECURITY;'
    FROM   pg_tables t
    WHERE  t.schemaname = 'public' AND t.rowsecurity

    UNION ALL

    -- 8. The policies themselves.
    SELECT 8,
           p.tablename::text,
           'CREATE POLICY ' || quote_ident(p.policyname)
             || ' ON public.' || quote_ident(p.tablename)
             || ' AS ' || p.permissive
             || ' FOR ' || p.cmd
             || ' TO ' || array_to_string(p.roles, ', ')
             || coalesce(' USING (' || p.qual || ')', '')
             || coalesce(' WITH CHECK (' || p.with_check || ')', '')
             || ';'
    FROM   pg_policies p
    WHERE  p.schemaname = 'public'

    UNION ALL

    -- 9. Stored functions, in full. This is the only way to recover
    -- semantic_search(), whose source exists in no file in this repository.
    SELECT 9,
           pr.proname::text,
           pg_get_functiondef(pr.oid) || ';'
    FROM   pg_proc pr
    JOIN   pg_namespace n ON n.oid = pr.pronamespace
    WHERE  n.nspname = 'public'
    AND    pr.prokind IN ('f', 'p')
)
SELECT statement
FROM   ddl
ORDER  BY sort_key, obj;
