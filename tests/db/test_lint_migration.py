"""Guardrail linter for hand-pasted Supabase migrations.

Every rule here encodes a failure that actually happened in a live session:
  - 2026-06-05: ``ADD CONSTRAINT IF NOT EXISTS`` pasted into the Supabase SQL
    editor -> ``ERROR 42601: syntax error at or near "NOT"`` (PG doesn't
    support IF NOT EXISTS on ADD CONSTRAINT).
  - 2026-06-13: the migration file *path* was pasted instead of its contents
    -> ``ERROR 42601: syntax error at or near "tools"``.
Warnings push toward idempotent SQL because migrations get re-pasted.
"""
import subprocess
import sys

import pytest

from tools.db.lint_migration import lint_sql


def levels(findings):
    return [f[0] for f in findings]


def messages(findings):
    return " | ".join(f[1] for f in findings)


class TestErrors:
    def test_flags_add_constraint_if_not_exists(self):
        sql = "ALTER TABLE student_profiles\n  ADD CONSTRAINT IF NOT EXISTS chk_hearts CHECK (hearts BETWEEN 0 AND 5);"
        findings = lint_sql(sql)
        assert "error" in levels(findings)
        assert "ADD CONSTRAINT" in messages(findings)

    def test_flags_create_policy_if_not_exists(self):
        sql = 'CREATE POLICY IF NOT EXISTS "read_own" ON flashcard_reviews FOR SELECT USING (true);'
        findings = lint_sql(sql)
        assert "error" in levels(findings)

    def test_flags_file_path_pasted_instead_of_contents(self):
        # The classic: pasting the *path* into the SQL editor.
        findings = lint_sql("tools/db/migrations/004_leaderboard.sql")
        assert "error" in levels(findings)
        assert "contents" in messages(findings).lower()

    def test_do_block_guard_is_the_accepted_fix(self):
        # The correct PG-compatible guard must lint clean (no errors).
        sql = (
            "DO $$ BEGIN\n"
            "  ALTER TABLE student_profiles ADD CONSTRAINT chk_hearts CHECK (hearts BETWEEN 0 AND 5);\n"
            "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
        )
        assert "error" not in levels(lint_sql(sql))


class TestIdempotencyWarnings:
    def test_warns_create_table_without_if_not_exists(self):
        findings = lint_sql("CREATE TABLE leaderboard (id uuid PRIMARY KEY);")
        assert "warning" in levels(findings)

    def test_warns_create_index_without_if_not_exists(self):
        findings = lint_sql("CREATE INDEX idx_reviews_user ON flashcard_reviews (user_id);")
        assert "warning" in levels(findings)

    def test_idempotent_ddl_is_clean(self):
        sql = (
            "CREATE TABLE IF NOT EXISTS leaderboard (id uuid PRIMARY KEY);\n"
            "CREATE INDEX IF NOT EXISTS idx_reviews_user ON flashcard_reviews (user_id);"
        )
        assert lint_sql(sql) == []

    def test_comments_do_not_false_positive(self):
        sql = "-- CREATE TABLE legacy (id int);\nCREATE TABLE IF NOT EXISTS t (id int);"
        assert lint_sql(sql) == []


class TestCli:
    def test_cli_exits_nonzero_on_error_and_print_emits_contents(self, tmp_path):
        bad = tmp_path / "bad.sql"
        bad.write_text("ALTER TABLE t ADD CONSTRAINT IF NOT EXISTS c CHECK (x > 0);", encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, "tools/db/lint_migration.py", str(bad)],
            capture_output=True, text=True,
        )
        assert proc.returncode == 1

        good = tmp_path / "good.sql"
        good.write_text("CREATE TABLE IF NOT EXISTS t (id int);", encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, "tools/db/lint_migration.py", str(good), "--print"],
            capture_output=True, text=True,
        )
        assert proc.returncode == 0
        assert "CREATE TABLE IF NOT EXISTS t" in proc.stdout
