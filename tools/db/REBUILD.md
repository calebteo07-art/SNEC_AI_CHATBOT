# Rebuilding the EyeBot database

Everything needed to create an empty, correctly-shaped EyeBot database from SQL in
this repository, plus what that SQL cannot give you and how to get it.

---

## TL;DR

```
tools/db/migrations/000_base_schema.sql   ← run first
tools/db/migrations/001_flashcards.sql
tools/db/migrations/002_indexes.sql
   ... 003 through 018 in numeric order ...
tools/db/migrations/019_case_progress_checklist_detail.sql
```

Twenty files, numeric order, no gaps. Paste each into the Supabase SQL Editor and
run it, or `psql -f` each in turn. Every file is idempotent, so a re-run is safe.

That produces the **schema**. It does not produce the **data** — see
[What this does not give you](#what-this-does-not-give-you).

If you would rather run one file than twenty, concatenate them in order. This is
deliberately *not* committed as a file: a generated copy sitting next to its
sources drifts, and a stale schema file is worse than none.

```bash
cat tools/db/migrations/0*.sql > /tmp/eyebot_schema.sql
```

`cat` with that glob sorts numerically because the names are zero-padded — `000`
through `019`, in order. Check the top of the result says `Migration 000` before
running it.

---

## Why file 000 exists

Migrations `001`–`019` were written as the product grew. They `ALTER TABLE` a set
of tables that were never created by a migration at all — they were created by
clicking around the Supabase dashboard during 2026. So `001` through `019` alone do
not run on an empty database: the very first statement of `001` references
`student_profiles`, which nothing creates.

Twenty tables are used by the application. Eight are created by migrations. The
other **twelve had no `CREATE TABLE` anywhere**:

| | |
|---|---|
| `student_profiles` | `chat_sessions` |
| `student_auth` | `approved_students` |
| `student_consent` | `supervisors` |
| `case_progress` | `password_reset_otps` |
| `documents` | `chunks` |
| `images` | `checklists` |

Four non-table objects were missing too: the `semantic_search()` function, the
`vector` extension, the `UNIQUE (lower(email))` index on `student_consent`, and the
two Storage buckets.

`000_base_schema.sql` supplies all sixteen. Re-derive the counts yourself rather
than trusting this paragraph:

```bash
grep -rhoE '\.table\("[a-z_]+"\)' tools/ | sort -u | wc -l
```

```bash
grep -rhoiE '^CREATE TABLE (IF NOT EXISTS )?[a-z_]+' tools/db/migrations/*.sql | sed 's/.* //' | sort -u | wc -l
```

```bash
grep -rhoiE '^CREATE TABLE (IF NOT EXISTS )?[a-z_]+' tools/db/migrations/000_base_schema.sql | wc -l
```

The first two both return **20** — every table the application touches now has a
`CREATE TABLE`. The third returns **12**: the ones that had none before this file.

The `^` anchor is load-bearing. Without it the pattern also matches the phrase
"CREATE TABLE" inside comments — including in this very file's header — and the
count comes out at 21.

---

## How much of file 000 is verified, and how much is a guess

This matters more than anything else on this page. `000_base_schema.sql` is a
**reconstruction**, not a database dump.

### Read from the live production database (trustworthy)

Every column name and order, every type — including `vector(1536)` — every
`NOT NULL`, every non-jsonb `DEFAULT`, every primary key including the composite
ones, and every foreign key's target. These came from the PostgREST OpenAPI
description at `GET /rest/v1/` on 2026-08-27, captured in
[`SCHEMA-REFERENCE.md`](SCHEMA-REFERENCE.md). Read-only; no table rows were fetched.

### Reconstructed, and possibly wrong

| Unknown | What 000 does | Why |
|---|---|---|
| `ON DELETE` rule on each FK | omits it (Postgres default `NO ACTION`) | If production is `CASCADE`, this errors instead of silently deleting rows. Wrong in the safe direction. |
| `semantic_search()` body | rebuilt from its call site | The name and its three argument names are exact — PostgREST matches RPC arguments by name — and the result carries `title` and `text` because `format_context` reads them. The rest is inferred. |
| Index on `chunks.embedding` | `hnsw (embedding vector_cosine_ops)` | An index exists; its type and parameters are not visible through PostgREST. |
| RLS on the 12 tables | leaves it **off**, loudly | Guessing wrong in either direction is bad. See the note at the foot of 000. |
| `UNIQUE (lower(email))` on `student_consent` | creates it | Certain it is *needed*; not certain it *exists* in production. The only evidence is a code comment at `tools/shared/db.py:935`, because PostgREST does not report unique constraints of any kind. If production has duplicate emails, this statement will fail on a data restore — and that failure is information, not a bug. |
| `UNIQUE` on `documents(filename)` and `checklists(document_id)` | creates both | Recovered from the code, not the snapshot. `tools/kb/supabase_client.py:52` and `:108` upsert with `ON CONFLICT` on those columns, and Postgres rejects that at *plan* time with `42P10` unless a unique index exists — so production must have both, or its own ingestion would never have run. **Omitting these was a real bug in the first draft of this file:** without them a rebuilt database cannot ingest a single document, which is precisely the recovery path item 1 below depends on. |
| Other `UNIQUE` constraints | none | Only the three above are recoverable from the code. If production carries others, nothing here would reveal them. |
| `SMALLINT` vs `INTEGER` | uses `INTEGER` | PostgREST reports both as `int32`. Harmless. |

**Verification actually performed:** all 20 files parse clean under `pglast` 8.4,
which wraps the real PostgreSQL parser (libpg_query) — `000` is 20 statements:
2 extensions, 12 tables, 4 indexes, 1 function, 1 insert.

**Verification NOT performed: none of this SQL has been executed anywhere.** There
is no Postgres and no Docker on the machine it was written on. A parse pass proves
the syntax is valid PostgreSQL; it proves nothing about whether the statements
succeed. That distinction is not academic here — a catalogue query in
`generate_ddl.sql` parsed clean and still failed with `42P01` the first time it met
a real database, because name resolution happens at runtime.

**Expect to fix something on the first run.** Send back the error and it gets fixed.

---

## The better path: dump the real thing

The reconstruction exists because the password was not to hand. Once it is, replace
guesswork with fact — this takes about two minutes.

1. Supabase → **Project Settings → Database → Connection string → URI**. Reveal
   and copy the password. (No credential for this exists in the repo or in Render:
   the backend reaches Supabase over PostgREST with a service-role JWT, which
   cannot authenticate `pg_dump`.)

2. Resetting that password **cannot break production.** Nothing in the codebase
   opens a Postgres connection — verified: no `psycopg`, no `asyncpg`, no
   `sqlalchemy` import, and no connection string anywhere. So if the password is
   lost, reset it freely.

3. Dump:

```bash
pg_dump --schema-only --no-owner --no-privileges "$SUPABASE_DB_URL" > tools/db/migrations/000_base_schema.sql
```

Two traps that will cost you an afternoon:

- Use the **session-mode** pooler on port **5432**. The transaction-mode pooler on
  6543 cannot hold the snapshot `pg_dump` needs.
- Do **not** pass `--schema=public` on its own. It drops the `vector` extension and
  the Storage schema, and you get a dump that will not restore.

A real dump also settles every "reconstructed" row in the table above, including
the RLS policies and the true `semantic_search()` body.

---

## Reading the live schema without any password

If you only need to *see* the schema rather than rebuild it, two files here run
read-only in the Supabase SQL Editor with no credentials beyond dashboard access:

- **[`export_schema.sql`](export_schema.sql)** — 12 `SELECT`s: columns, constraints,
  indexes, functions, extensions, RLS, triggers, views, buckets, table sizes.
- **[`generate_ddl.sql`](generate_ddl.sql)** — makes Postgres emit its own
  `CREATE TABLE` statements as copyable SQL. Query F prints the real
  `semantic_search()` body.

Both are split into standalone queries rather than one big `UNION`, so a failure
names its own culprit. `generate_ddl.sql` is lettered A–F and opens with **query 0**,
a connection check — run that first: it returns the Postgres version and a table
count, and if the count is `20` the connection is good and any later error is a bug
in the SQL, not in your setup. `export_schema.sql` is numbered 1–9 and has no
query 0; its section 1 is an ordinary catalogue `SELECT` that fails loudly anyway.

---

## What this does not give you

Schema is not content. After a rebuild the database is correctly shaped and
completely empty. Ranked by how much trouble the gap causes:

1. **`checklists` — live, authoritative, and the only copy.** Every OSCE station
   reads it at runtime via `get_checklist_by_name`
   ([`tools/api/routers/cases.py:36`](../api/routers/cases.py)). Each step's `notes`
   field carries the SNEC clinical grounding. `tests/fixtures/procedure_checklists.json`
   looks like a backup and is not one — it drops `notes` entirely
   (`grep -c '"notes"'` returns 0). **Lose this table and the OSCE station breaks.**
   Migrate the rows, or re-ingest from the source PDFs.

2. **The 83 source PDFs are on a personal OneDrive account**, in neither this
   repository nor Supabase — `tools/kb/run_ingestion.py:32-33` hard-codes
   `Desktop\Module {1,2} Content EyeBot`. Checked 2026-08-28: 83 catalogue entries
   (81 distinct filenames — two appear in both modules), 83 files on disk, none
   missing and none uncatalogued. There is no fallback if that account goes away,
   and re-ingestion (item 1 above) reads from exactly these paths.

3. **`documents` / `chunks` / embeddings are an archive, dead at runtime.** Runtime
   chat retrieval was retired for speed — the tutor injects the git-tracked
   `workflows/ophthalmology_kb.md`. Migrating them moves history, not the tutor.

4. **Rebuildable, so no panic:** `cases/*.json` (155 OSCE cases),
   `tools/flashcards/static_cards.py`, `frontend/public/avatar/`.

### Before copying any rows: this is a PDPA decision, not an engineering one

**Fourteen of the twenty tables hold real personal data** — `student_auth.password_hash`,
`student_consent.student_name` and `email`, `supervisors` (staff records),
`audit_events.ip`, `chat_sessions.summary` (verbatim tutor reply text), and more.

Moving those rows to a different organisation's database is a decision for SNEC's
data protection officer. Restoring the **schema** carries no personal data and needs
no such approval; copying the **rows** does. Keep the two steps separate, and get
the second one signed off before running it.

---

## If a file fails

Every migration is written to be idempotent — `IF NOT EXISTS`, `DROP POLICY` before
`CREATE POLICY`, `DO $$ … EXCEPTION WHEN duplicate_object $$` around bare
`ADD CONSTRAINT`. Re-running a file that partly succeeded is safe.

That was not quite true until 2026-08-28: `001_flashcards.sql` was the one file with
an unguarded `CREATE POLICY`, so re-pasting it aborted the whole script with `42710`,
and — worse — a rebuild whose `000` came from a real `pg_dump` (which already carries
the policy) failed on `001`'s *first* run. It now carries the same
`DROP POLICY IF EXISTS` guard as `010` and `015`. If you are holding an older copy of
this repository, check that line before trusting the paragraph above.

The one thing to get right is **order**. `APPLIED.md` records what has been run
against production and why the order was load-bearing more than once — migration
019's code shipped two days ahead of its `ALTER`, and the all-or-nothing insert
fallback of the day turned one unknown column into the loss of nine on every OSCE
attempt submitted between 2026-08-06 and 2026-08-08. Those sub-scores are gone.
Read that file before applying anything to a live database.
