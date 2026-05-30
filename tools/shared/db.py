#!/usr/bin/env python3
"""Async Supabase PostgreSQL client for the four migrated tables.

Replaces Google Sheets for: student_auth, student_profiles, chat_sessions, case_progress.
All functions are async. JSONB columns are returned as native Python dicts/lists.

Usage:
    from tools.shared import db
    profile = await db.get_profile(student_id)
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import AsyncClient, acreate_client

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

_client: AsyncClient | None = None


async def _get_client() -> AsyncClient:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL", "").strip()
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
            )
        _client = await acreate_client(url, key)
    return _client


# ── student_auth ─────────────────────────────────────────────────────────────

async def get_auth(email: str) -> dict | None:
    """Return the auth row for email, or None if not found."""
    client = await _get_client()
    result = (
        await client.table("student_auth")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def upsert_auth(email: str, password_hash: str, must_change: bool) -> None:
    """Insert or update an auth row."""
    client = await _get_client()
    await client.table("student_auth").upsert(
        {"email": email, "password_hash": password_hash, "must_change": must_change},
        on_conflict="email",
    ).execute()


async def update_auth(email: str, **fields) -> None:
    """Update specific fields on an auth row."""
    client = await _get_client()
    await client.table("student_auth").update(fields).eq("email", email).execute()


# ── student_profiles ──────────────────────────────────────────────────────────

async def get_profile(student_id: str) -> dict | None:
    """Return the profile row for student_id, or None if not found.
    JSONB columns (weak_topics, missed_findings, retention_scores) are
    returned as native Python lists/dicts — no json.loads() needed.
    """
    client = await _get_client()
    result = (
        await client.table("student_profiles")
        .select("*")
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def upsert_profile(student_id: str, **fields) -> None:
    """Insert or update a profile row."""
    client = await _get_client()
    await client.table("student_profiles").upsert(
        {"student_id": student_id, **fields},
        on_conflict="student_id",
    ).execute()


async def update_profile(student_id: str, **fields) -> None:
    """Update specific fields on a profile row."""
    client = await _get_client()
    await client.table("student_profiles").update(fields).eq("student_id", student_id).execute()


# ── chat_sessions ─────────────────────────────────────────────────────────────

async def insert_session(
    student_id: str, topic: str, summary: str, token_count: int, model: str
) -> None:
    """Append a chat session record."""
    client = await _get_client()
    await client.table("chat_sessions").insert(
        {
            "student_id": student_id,
            "topic": topic,
            "summary": summary,
            "token_count": token_count,
            "model": model,
        }
    ).execute()


async def get_sessions(student_id: str, limit: int = 20) -> list[dict]:
    """Return the most recent sessions for a student, newest first."""
    client = await _get_client()
    result = (
        await client.table("chat_sessions")
        .select("*")
        .eq("student_id", student_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


# ── case_progress ─────────────────────────────────────────────────────────────

async def insert_case_result(
    student_id: str, case_id: str, total_score: int, passed: bool
) -> None:
    """Append a case completion record."""
    client = await _get_client()
    await client.table("case_progress").insert(
        {
            "student_id": student_id,
            "case_id": case_id,
            "total_score": total_score,
            "passed": passed,
        }
    ).execute()


async def get_case_results(student_id: str) -> list[dict]:
    """Return all case completion records for a student."""
    client = await _get_client()
    result = (
        await client.table("case_progress")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    return result.data or []
