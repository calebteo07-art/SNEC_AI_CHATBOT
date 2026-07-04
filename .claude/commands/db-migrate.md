---
description: Lint a Supabase migration and emit paste-ready SQL — never paste a file path or PG-incompatible DDL again.
argument-hint: "[migration file or number, e.g. 005 — omit to pick the latest]"
allowed-tools: Read, Bash, Glob, Grep, Edit, Write
---

# DB MIGRATE — safe hand-off to the Supabase SQL editor

Migrations in this repo are applied by pasting SQL into the Supabase SQL editor
(dashboard → SQL). Two live failures this command exists to prevent:
- pasting the migration file **path** instead of its contents → `42601 syntax error at or near "tools"`
- PG-incompatible DDL like `ADD CONSTRAINT IF NOT EXISTS` → `42601 syntax error at or near "NOT"`

Target: $ARGUMENTS (if empty, use the highest-numbered file in `tools/db/migrations/`).

## Steps

1. Resolve the migration file in `tools/db/migrations/`. If `$ARGUMENTS` is a number,
   match by prefix (e.g. `005` → `005_streak_xp.sql`).

2. Lint it (deterministic, tested — see `tests/db/test_lint_migration.py`):
   ```bash
   python tools/db/lint_migration.py tools/db/migrations/<file>.sql
   ```
   - **Errors** → fix the SQL first (the linter says how), re-lint, only then continue.
   - Warnings → surface them to the user but proceed.

3. Print the migration's **full raw SQL** in a single ```sql fenced block, prefixed with
   exactly this instruction: *"Paste everything inside this block into the Supabase SQL
   editor (Dashboard → SQL Editor → New query) and Run. Paste the contents — never the
   file path."*

4. Ask the user to confirm it ran successfully. On success, record it in
   `tools/db/migrations/APPLIED.md` (create if missing: one line per migration,
   `- [x] <file> — applied <ISO date>`), then commit that ledger change.

5. If Supabase returned an error instead, read the error code, fix the SQL in the
   migration file (keep it idempotent so a partial run can be re-pasted), re-lint,
   and re-emit. Never tell the user to "try again" with unchanged SQL.
