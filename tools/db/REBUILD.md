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

That produces the **schema**, on Supabase. It does not produce the **data** — see
[What this does not give you](#what-this-does-not-give-you) — and if you are
targeting anything other than Supabase, read the next section first.

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

## Target is not Supabase (AWS RDS, Cloud SQL, a laptop)?

Then run [`non_supabase_compat.sql`](non_supabase_compat.sql) **first**, before
`000`, and read the two warnings at the top of it.

Four statements in the set reach into schemas only a Supabase project has:
`storage.buckets` in `000`, and `auth.uid()` inside the `CREATE POLICY` in `001`,
`010` and `015`. The `auth.uid()` ones are not cosmetic — Postgres analyses a
policy's `USING` expression when the policy is *created*, so those three files
abort outright rather than behaving differently. The compat file stubs both.

**But making the SQL run is not the same as porting the app**, and this is the part
worth knowing before anyone spends a day on it: nothing in this codebase opens a
Postgres connection. There is no `psycopg`, no `asyncpg`, no SQLAlchemy — every
query goes over HTTP to PostgREST through `supabase-py`
(`tools/shared/db.py:17`). Supabase here is Postgres **plus** PostgREST plus GoTrue
plus Storage. A perfectly-shaped database on RDS is one the application cannot talk
to. You would need to run PostgREST/GoTrue/Storage in front of it (all open source,
and probably no app code changes beyond `SUPABASE_URL`), or replace the data layer
in `tools/shared/db.py`, `tools/shared/otp_store.py` and
`tools/kb/supabase_client.py` outright.

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

Other objects were missing too: the `vector` extension, two functions
(`semantic_search()` and `checklist_search()`), eight hand-made indexes — among
them the unique index on `student_consent(email)` — and the two Storage buckets.

`000_base_schema.sql` supplies all of them. Re-derive the table counts yourself
rather than trusting this paragraph:

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

## How much of file 000 is verified

`000_base_schema.sql` began on 2026-08-28 as a **reconstruction** from the PostgREST
snapshot in [`SCHEMA-REFERENCE.md`](SCHEMA-REFERENCE.md). On **2026-10-02** it was
checked against a real schema-only `pg_dump` of production (Postgres 17.6, taken with
the Supabase CLI's `pg_dump` pipeline) and corrected.

The dump is **not** in this repository and should not be: the repository is public.
It is kept offline, with the backup it was taken alongside.

### How it was checked

Both sides were parsed with `pglast` 8.4 (the real PostgreSQL parser, libpg_query)
into one normalised model and diffed: columns in order, with type, nullability and
default; every constraint by name, including each foreign key's `ON DELETE`; every
index with its method, operator class and `WITH` options; RLS state; policies; and
each function's signature and re-parsed body. Run against the old `000` it found 73
differences. After the fixes below, `000` + `001`–`019` diffs to **zero**: 20 tables,
38 constraints, 21 indexes, RLS on all 20 tables, 3 policies, 2 functions. A planted
type change and a planted column swap were both caught, so the zero is not a
comparer that cannot see.

### What the dump settled

| Was unknown | What 000 used to do | What production has, and 000 now does |
|---|---|---|
| `ON DELETE` rule on each FK | omitted (`NO ACTION`) | **`ON DELETE CASCADE`** on all three `document_id` FKs (`chunks`, `images`, `checklists`). The `student_profiles` FKs in 001/010/015 were already right. |
| `semantic_search()` body | rebuilt from its call site | The real body. The guess had the wrong result columns: production returns `chunk_id` (not `id`), adds `chunk_index` and has no `page_end`. The argument names were right, and the only caller reads just `title` and `text`, which both versions return. |
| Index on `chunks.embedding` | `chunks_embedding_idx`, hnsw cosine, default build parameters | `chunks_embedding_hnsw`, hnsw cosine, `WITH (m = 16, ef_construction = 128)` — pgvector's default `ef_construction` is 64. |
| RLS on the 12 tables | left **off** | **On, on all 20 public tables.** The only policies are the three own-rows ones on the flashcard tables (001, 010, 015). `000` now enables RLS on its 12, so anon and authenticated get nothing; the backend uses the service-role key, which bypasses RLS. |
| Unique index on `student_consent` | `UNIQUE (lower(email))` | `student_consent_email_idx` on **plain `email`**. Not a live bug — see [Is the plain-`email` index a bug?](#is-the-plain-email-index-a-bug) |
| `UNIQUE` on `documents(filename)`, `checklists(document_id)` | separate `CREATE UNIQUE INDEX` statements | Confirmed — both are table constraints (`documents_filename_key`, `checklists_document_id_key`), which is what an inline `UNIQUE` produces. Without them a rebuilt database cannot ingest a document (`42P10` at plan time). |
| Other `UNIQUE` constraints | none | Confirmed: there are none. |
| jsonb `DEFAULT`s | none | `student_profiles.weak_topics` and `missed_findings` default to `'[]'`, `retention_scores` to `'{}'`. `checklists.steps` has no default. |
| CHECK constraints beyond 003/009/015 | none | Confirmed: there are none. |
| `SMALLINT` vs `INTEGER` | `INTEGER` throughout | Confirmed: every integer column in `000` is `integer` in production. |

### What the dump found that nobody suspected

| Old `000` | Production, and `000` now |
|---|---|
| No `DEFAULT` on 11 `NOT NULL` text columns | `DEFAULT ''` on `student_profiles.role` / `supervisor_note`, `student_consent.student_name` / `pdpa_version`, `approved_students.full_name` / `role` / `added_by`, `chat_sessions.topic` / `summary` / `model` and `supervisors.supervisor_id`. PostgREST shows an empty-string default as a blank, exactly like no default: `audit_events.target` is `DEFAULT ''` by migration 014 and reads blank in `SCHEMA-REFERENCE.md`. |
| `case_progress.id` `GENERATED BY DEFAULT AS IDENTITY` | `GENERATED ALWAYS`. A data restore still works: `COPY` writes identity values as given. |
| — | `checklist_search(procedure text) RETURNS SETOF checklists`, made by hand. Nothing in the repository calls it. |
| — | Five hand-made indexes no migration created: `approved_students_student_id_idx` (an exact duplicate of 002's `idx_approved_student_id`), `case_progress_student_id_idx` (made redundant by two composites that lead with `student_id`), `case_progress_student_id_case_id_idx`, `chat_sessions_student_id_idx` and `images_document_id_idx`. All are reproduced. Dropping the redundant two would be a production change. |
| `idx_checklists_procedure` | Does not exist. Removed. |
| `idx_chunks_document` | Exists as `chunks_document_id_idx`. Renamed. |
| — | RLS on `leaderboard_settings`, `avatar_images`, `league_week` and `league_seal`, which 004, 007 and 016 never enabled. Each of those files now does; on production that line is a no-op. |

### Still not verified

| What | Why |
|---|---|
| The two Storage buckets | The Supabase CLI dump leaves out the `storage` schema. The row counts taken alongside it show two rows in `storage.buckets`, which agrees with `000`; the ids and the `public` flag still come from the code. |
| Execution | See below. |
| `GRANT`s, and the `pg_stat_statements`, `supabase_vault` and `uuid-ossp` extensions | Not reproduced. Supabase sets these up on every project; production's grants come from its `ALTER DEFAULT PRIVILEGES … IN SCHEMA public` entries. On a non-Supabase target the roles do not exist anyway. |

### Is the plain-`email` index a bug?

**Not today.** Every path that writes `student_consent.email` lower-cases it first:
login (`tools/api/routers/auth.py:80`), `/api/onboard` (`auth.py:297`), and the admin
single add (`admin.py:89`) and bulk add (`admin.py:1220`). All four reach the table
through `tools/shared/identity.py`, and nothing else writes that column.
`get_consent_by_email` matches with `.eq()` on the same lower-cased string. So two
first-logins that differ only in case are both lower-cased before they reach the
index, and it blocks the second just as `UNIQUE (lower(email))` would.

The gap is latent: case-insensitivity is enforced by the code, not by the database.
A future writer that skips `.lower()`, or a row stored in mixed case before the
lower-casing existed, would get past it. The lower-cased login lookup would also miss
such a legacy row, so that person would be given a second `student_id`. One read-only
query in the SQL editor tells you whether any exist:

```sql
SELECT count(*) FROM student_consent WHERE email <> lower(email);
```

If it returns 0, replacing the index with `UNIQUE (lower(email))` is safe and closes
the gap. That is a production migration, so it has not been made here.

**Verification actually performed:** all 20 files parse clean under `pglast` 8.4,
and their parsed shape diffs clean against the dump, as described above. `000` is 37
statements: 2 extensions, 12 tables, 8 indexes, 2 functions, 1 insert and 12
`ENABLE ROW LEVEL SECURITY`s.

**Verification NOT performed: none of this SQL has been executed anywhere.** The
machine it was written on has PostgreSQL's client tools but no server and no
pgvector. A parse and a shape diff prove the SQL is valid and describes production;
they do not prove every statement succeeds. That distinction is not academic here —
a catalogue query in `generate_ddl.sql` parsed clean and still failed with `42P01`
the first time it met a real database, because name resolution happens at runtime.

**The first run may still hit an error**, though far less likely than before the
dump. Send back the error and it gets fixed.

---

## Re-checking against a fresh dump

Done once, on 2026-10-02 (above). Repeat it after anyone changes the schema by hand
in the dashboard — that is how `000` went wrong in the first place. It takes about
two minutes.

1. Supabase → **Project Settings → Database → Connection string → URI**. Reveal
   and copy the password. (No credential for this exists in the repo or in Render:
   the backend reaches Supabase over PostgREST with a service-role JWT, which
   cannot authenticate `pg_dump`.)

2. Resetting that password **cannot break production.** Nothing in the codebase
   opens a Postgres connection — verified: no `psycopg`, no `asyncpg`, no
   `sqlalchemy` import, and no connection string anywhere. So if the password is
   lost, reset it freely.

3. Dump to a file **outside this repository** — the repository is public:

```bash
pg_dump --schema-only --no-owner --no-privileges "$SUPABASE_DB_URL" > ~/eyebot-schema.sql
```

Two traps that will cost you an afternoon:

- Use the **session-mode** pooler on port **5432**. The transaction-mode pooler on
  6543 cannot hold the snapshot `pg_dump` needs.
- Do **not** pass `--schema=public` on its own. It drops the `vector` extension and
  the Storage schema, and you get a dump that will not restore.

4. Diff it against `000` + `001`–`019`, object by object, as described under
   [How it was checked](#how-it-was-checked), and fix `000` (or the migration that
   owns the object) until the diff is empty. Do not paste the dump over `000`: it
   also re-creates every object `001`–`019` own, and it carries Supabase-internal
   statements.

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

`004`, `007` and `016` were edited the same way on 2026-10-02. Production has RLS on
the four tables they create, but those files never enabled it, so each gained one
`ENABLE ROW LEVEL SECURITY`. On production that line is a no-op.

The one thing to get right is **order**. `APPLIED.md` records what has been run
against production and why the order was load-bearing more than once — migration
019's code shipped two days ahead of its `ALTER`, and the all-or-nothing insert
fallback of the day turned one unknown column into the loss of nine on every OSCE
attempt submitted between 2026-08-06 and 2026-08-08. Those sub-scores are gone.
Read that file before applying anything to a live database.
