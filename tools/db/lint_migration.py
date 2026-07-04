"""Lint a SQL migration for Supabase/Postgres hand-paste hazards.

Usage:
    python tools/db/lint_migration.py <file.sql> [--print]

Exit codes: 0 = clean or warnings only, 1 = errors (do NOT paste), 2 = usage.
``--print`` emits the raw SQL to stdout so it can be copied verbatim into the
Supabase SQL editor — paste the *contents*, never the file path.

Each rule encodes a real prod-adjacent failure (see tests/db/test_lint_migration.py).
Dependency-free on purpose: this must run anywhere, instantly.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

Finding = tuple[str, str]  # (level, message)

# Looks like a lone file path, not SQL — the paste-the-path mistake (42601).
_PATH_RE = re.compile(r"^[\w./\\:-]+\.sql$")

_COMMENT_LINE = re.compile(r"--.*?$", re.M)
_COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.S)


def _strip_comments(sql: str) -> str:
    return _COMMENT_LINE.sub("", _COMMENT_BLOCK.sub("", sql))


def lint_sql(sql: str) -> list[Finding]:
    findings: list[Finding] = []
    stripped = sql.strip()

    if _PATH_RE.match(stripped):
        findings.append((
            "error",
            "This is a file PATH, not SQL — paste the file's *contents* into the "
            "Supabase SQL editor (pasting the path raises 42601).",
        ))
        return findings

    body = _strip_comments(sql)

    if re.search(r"\bADD\s+CONSTRAINT\s+IF\s+NOT\s+EXISTS\b", body, re.I):
        findings.append((
            "error",
            "Postgres does not support ADD CONSTRAINT IF NOT EXISTS (42601). "
            "Wrap it in: DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
        ))

    if re.search(r"\bCREATE\s+POLICY\s+IF\s+NOT\s+EXISTS\b", body, re.I):
        findings.append((
            "error",
            "Postgres does not support CREATE POLICY IF NOT EXISTS. "
            "DROP POLICY IF EXISTS first, then CREATE POLICY.",
        ))

    # Idempotency warnings: migrations get re-pasted, so DDL should tolerate reruns.
    if re.search(r"\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)", body, re.I):
        findings.append(("warning", "CREATE TABLE without IF NOT EXISTS — re-pasting will fail."))

    if re.search(r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY)", body, re.I):
        findings.append(("warning", "CREATE INDEX without IF NOT EXISTS — re-pasting will fail."))

    if re.search(r"\bADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)", body, re.I):
        findings.append(("warning", "ADD COLUMN without IF NOT EXISTS — re-pasting will fail."))

    return findings


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    path = Path(args[0])
    if not path.is_file():
        print(f"no such file: {path}", file=sys.stderr)
        return 2

    sql = path.read_text(encoding="utf-8")
    findings = lint_sql(sql)
    for level, msg in findings:
        print(f"[{level.upper()}] {msg}", file=sys.stderr)

    has_error = any(level == "error" for level, _ in findings)
    if not findings:
        print(f"[OK] {path.name} lints clean.", file=sys.stderr)

    if "--print" in argv and not has_error:
        sys.stdout.write(sql)

    return 1 if has_error else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
