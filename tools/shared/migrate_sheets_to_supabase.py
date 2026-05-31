#!/usr/bin/env python3
"""One-time migration: copy snec_auth, snec_profiles, snec_sessions, snec_case_progress
from Google Sheets to Supabase PostgreSQL.

Run ONCE before switching the app to Supabase. Delete this file after successful run.

Usage:
    python tools/shared/migrate_sheets_to_supabase.py
"""
import asyncio
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gsheets import get_rows
from tools.shared import db


def _bool(val: object) -> bool:
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() == "true"


def _int(val: object) -> int:
    try:
        return int(str(val).strip() or "0")
    except (ValueError, TypeError):
        return 0


def _json_list(val: object) -> list:
    if isinstance(val, list):
        return val
    try:
        result = json.loads(str(val) or "[]")
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _json_dict(val: object) -> dict:
    if isinstance(val, dict):
        return val
    try:
        result = json.loads(str(val) or "{}")
        return result if isinstance(result, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


async def migrate_auth(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        email = row.get("email", "").strip()
        if not email:
            continue
        await db.upsert_auth(
            email=email,
            password_hash=str(row.get("password_hash", "")),
            must_change=_bool(row.get("must_change", "true")),
        )
        count += 1
    return count


async def migrate_profiles(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        student_id = row.get("student_id", "").strip()
        if not student_id:
            continue
        last_active = row.get("last_active", "") or None
        await db.upsert_profile(
            student_id=student_id,
            role=str(row.get("role", "")),
            weak_topics=_json_list(row.get("weak_topics", "[]")),
            missed_findings=_json_list(row.get("missed_findings", "[]")),
            retention_scores=_json_dict(row.get("retention_scores", "{}")),
            session_count=_int(row.get("session_count", "0")),
            streak=_int(row.get("streak", "0")),
            last_active=last_active,
            learning_velocity=str(row.get("learning_velocity", "stable")),
            checkin_done_today=_bool(row.get("checkin_done_today", "false")),
            supervisor_note=str(row.get("supervisor_note", "")),
        )
        count += 1
    return count


async def migrate_sessions(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        student_id = row.get("student_id", "").strip()
        if not student_id:
            continue
        await db.insert_session(
            student_id=student_id,
            topic=str(row.get("topic", ""))[:100],
            summary=str(row.get("summary", ""))[:200],
            token_count=_int(row.get("token_count", "0")),
            model=str(row.get("model", "")),
        )
        count += 1
    return count


async def migrate_case_progress(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        student_id = row.get("student_id", "").strip()
        case_id = row.get("case_id", "").strip()
        if not student_id or not case_id:
            continue
        await db.insert_case_result(
            student_id=student_id,
            case_id=case_id,
            total_score=_int(row.get("total_score", "0")),
            passed=_bool(row.get("passed", "false")),
        )
        count += 1
    return count


async def main() -> None:
    print("EyeBot — Sheets -> Supabase migration\n")

    print("Reading snec_auth from Sheets...")
    auth_rows = get_rows("snec_auth")
    n = await migrate_auth(auth_rows)
    print(f"  Migrated {n} auth rows")

    print("Reading snec_profiles from Sheets...")
    profile_rows = get_rows("snec_profiles")
    n = await migrate_profiles(profile_rows)
    print(f"  Migrated {n} profile rows")

    print("Reading snec_sessions from Sheets...")
    session_rows = get_rows("snec_sessions")
    n = await migrate_sessions(session_rows)
    print(f"  Migrated {n} session rows")

    print("Reading snec_case_progress from Sheets...")
    case_rows = get_rows("snec_case_progress")
    n = await migrate_case_progress(case_rows)
    print(f"  Migrated {n} case progress rows")

    print("\nMigration complete. Verify row counts in Supabase Table Editor, then delete this file.")


if __name__ == "__main__":
    asyncio.run(main())
