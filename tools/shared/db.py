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
    student_id: str,
    case_id: str,
    total_score: int,
    passed: bool,
    score_100: int | None = None,
    safe: bool | None = None,
    consult_technique: int | None = None,
    judgement_safety: int | None = None,
    missed_critical: list | None = None,
    coaching: dict | None = None,
) -> None:
    """Append a case completion record. The rich OSCE-grade columns are additive and
    nullable (migration 011); when any are supplied we try the full insert first and,
    if those columns are absent (pre-migration), fall back to the base four columns so
    the submit path stays green until the migration is applied."""
    client = await _get_client()
    base: dict = {
        "student_id": student_id,
        "case_id": case_id,
        "total_score": total_score,
        "passed": passed,
    }
    rich = dict(base)
    if score_100 is not None:
        rich["score_100"] = score_100
    if safe is not None:
        rich["safe"] = safe
    if consult_technique is not None:
        rich["consult_technique"] = consult_technique
    if judgement_safety is not None:
        rich["judgement_safety"] = judgement_safety
    if missed_critical is not None:
        rich["missed_critical"] = missed_critical
    if coaching is not None:
        rich["coaching"] = coaching
    try:
        await client.table("case_progress").insert(rich).execute()
    except Exception:
        if len(rich) == len(base):  # nothing extra to shed → the error is real
            raise
        await client.table("case_progress").insert(base).execute()


async def get_case_results(student_id: str) -> list[dict]:
    """Return all case completion records for a student. `select("*")` surfaces the
    additive rich-grade columns (score_100, safe, consult_technique, judgement_safety,
    missed_critical, coaching) automatically once migration 011 is applied."""
    client = await _get_client()
    result = (
        await client.table("case_progress")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    return result.data or []


# ── flashcard_attempts (migration 010 — per-card grading log) ──────────────────

async def insert_flashcard_attempt(
    student_id: str, card_id: str | None, topic_tag: str, correct: bool, score: int
) -> None:
    """Append a per-card flashcard attempt. Raises if the table is missing
    (pre-migration 010) — callers best-effort-catch so the study loop still works."""
    client = await _get_client()
    await client.table("flashcard_attempts").insert(
        {
            "student_id": student_id,
            "card_id": card_id,
            "topic_tag": topic_tag,
            "correct": correct,
            "score": score,
        }
    ).execute()


async def get_flashcard_attempts(student_id: str) -> list[dict]:
    """Return all flashcard attempts for a student, newest first. Raises on a missing
    table (pre-migration 010) — callers catch and treat as no data."""
    client = await _get_client()
    result = (
        await client.table("flashcard_attempts")
        .select("*")
        .eq("student_id", student_id)
        .order("ts", desc=True)
        .execute()
    )
    return result.data or []


async def get_topic_accuracy(student_id: str) -> dict[str, dict]:
    """Per-topic flashcard accuracy for a student:
    {topic_tag: {"correct": int, "total": int, "pct": float}}. Built from the raw
    attempts, so it propagates the pre-migration missing-table error to the caller."""
    attempts = await get_flashcard_attempts(student_id)
    agg: dict[str, dict] = {}
    for a in attempts:
        topic = a.get("topic_tag") or "general"
        bucket = agg.setdefault(topic, {"correct": 0, "total": 0, "pct": 0.0})
        bucket["total"] += 1
        if a.get("correct"):
            bucket["correct"] += 1
    for bucket in agg.values():
        bucket["pct"] = (
            round(100 * bucket["correct"] / bucket["total"], 1) if bucket["total"] else 0.0
        )
    return agg


# ── Admin helpers (bulk reads) ────────────────────────────────────────────────

async def get_all_profiles() -> list[dict]:
    """Return all student profile rows. Used by admin dashboard."""
    client = await _get_client()
    result = await client.table("student_profiles").select("*").execute()
    return result.data or []


async def get_all_sessions(limit: int = 500) -> list[dict]:
    """Return recent sessions across all students. Used by admin dashboard."""
    client = await _get_client()
    result = (
        await client.table("chat_sessions")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


async def get_all_case_progress() -> list[dict]:
    """Return all case completion records. Used by admin dashboard."""
    client = await _get_client()
    result = (
        await client.table("case_progress")
        .select("*")
        .order("completed_at", desc=True)
        .execute()
    )
    return result.data or []


# ── approved_students ─────────────────────────────────────────────────────────

async def get_approved(email: str) -> dict | None:
    """Return the approved_students row for email, or None if not found."""
    client = await _get_client()
    result = (
        await client.table("approved_students")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_all_approved() -> list[dict]:
    """Return all rows from approved_students."""
    client = await _get_client()
    result = await client.table("approved_students").select("*").execute()
    return result.data or []


async def upsert_approved(
    email: str,
    full_name: str = "",
    role: str = "",
    added_by: str = "",
    added_at: str | None = None,
    student_id: str | None = None,
) -> None:
    """Insert or update an approved_students row."""
    client = await _get_client()
    payload: dict = {"email": email, "full_name": full_name, "role": role, "added_by": added_by}
    if added_at:
        payload["added_at"] = added_at
    if student_id:
        payload["student_id"] = student_id
    await client.table("approved_students").upsert(payload, on_conflict="email").execute()


async def update_approved(email: str, **fields) -> None:
    """Update specific fields on an approved_students row."""
    client = await _get_client()
    await client.table("approved_students").update(fields).eq("email", email).execute()


async def delete_approved(email: str) -> bool:
    """Delete an approved_students row. Returns True if a row was deleted."""
    client = await _get_client()
    result = await client.table("approved_students").delete().eq("email", email).execute()
    return len(result.data) > 0


# ── student_consent ───────────────────────────────────────────────────────────

async def get_consent_by_email(email: str) -> dict | None:
    """Return the student_consent row for email, or None."""
    client = await _get_client()
    result = (
        await client.table("student_consent")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_consent_by_student_id(student_id: str) -> dict | None:
    """Return the student_consent row for student_id, or None."""
    client = await _get_client()
    result = (
        await client.table("student_consent")
        .select("*")
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_all_consent() -> list[dict]:
    """Return all rows from student_consent."""
    client = await _get_client()
    result = await client.table("student_consent").select("*").execute()
    return result.data or []


async def upsert_consent(student_id: str, student_name: str, email: str) -> None:
    """Insert or update a student_consent row (core identity fields only)."""
    client = await _get_client()
    await client.table("student_consent").upsert(
        {"student_id": student_id, "student_name": student_name, "email": email},
        on_conflict="student_id",
    ).execute()


async def update_consent(student_id: str, **fields) -> None:
    """Update specific fields on a student_consent row."""
    client = await _get_client()
    await client.table("student_consent").update(fields).eq("student_id", student_id).execute()


# ── leaderboard_settings (opt-in, supervisor-gated leaderboard) ───────────────

async def get_leaderboard_enabled(cohort: str = "SNEC") -> bool:
    """Whether the cohort leaderboard is on. ON by default (no explicit row) so it
    is there for students without setup; a supervisor can still turn it OFF, which
    stores an explicit row. Raises if the table is missing (pre-migration) — the
    caller catches and treats that as disabled."""
    client = await _get_client()
    result = (
        await client.table("leaderboard_settings")
        .select("enabled")
        .eq("cohort", cohort)
        .limit(1)
        .execute()
    )
    return bool(result.data[0]["enabled"]) if result.data else True


async def set_leaderboard_enabled(cohort: str, enabled: bool) -> None:
    """Enable/disable the cohort leaderboard (supervisor action)."""
    client = await _get_client()
    await client.table("leaderboard_settings").upsert(
        {"cohort": cohort, "enabled": enabled, "updated_at": "now()"},
        on_conflict="cohort",
    ).execute()


# ── supervisors ───────────────────────────────────────────────────────────────

async def get_supervisor(email: str) -> dict | None:
    """Return the supervisors row for email, or None."""
    client = await _get_client()
    result = (
        await client.table("supervisors")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_all_supervisors() -> list[dict]:
    """Return all rows from supervisors."""
    client = await _get_client()
    result = await client.table("supervisors").select("*").execute()
    return result.data or []


async def upsert_supervisor(
    email: str,
    role: str = "supervisor",
    cohort: str = "SNEC",
    supervisor_id: str = "",
) -> None:
    """Insert or update a supervisors row."""
    client = await _get_client()
    await client.table("supervisors").upsert(
        {"email": email, "role": role, "cohort": cohort, "supervisor_id": supervisor_id},
        on_conflict="email",
    ).execute()


async def delete_supervisor(email: str) -> None:
    """Delete a supervisors row."""
    client = await _get_client()
    await client.table("supervisors").delete().eq("email", email).execute()


# ── avatar_images (Selena 3D-portrait cache, migration 007) ───────────────────

async def get_avatar_image(config_hash: str) -> dict | None:
    """Return the cached portrait row for a config hash, or None.

    Raises if the table is missing (pre-migration 007) — callers catch that and
    fall back to the instant SVG (the portrait cache is a graceful add-on)."""
    client = await _get_client()
    result = (
        await client.table("avatar_images")
        .select("*")
        .eq("config_hash", config_hash)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_avatar_images_bulk(config_hashes: list[str]) -> dict[str, str]:
    """hash → public image URL for every READY portrait among the given hashes.
    One query (no N+1). Raises if the table is missing — callers degrade to {}."""
    if not config_hashes:
        return {}
    client = await _get_client()
    result = (
        await client.table("avatar_images")
        .select("config_hash,status,image_url")
        .in_("config_hash", list(set(config_hashes)))
        .execute()
    )
    return {
        r["config_hash"]: r["image_url"]
        for r in (result.data or [])
        if r.get("status") == "ready" and r.get("image_url")
    }


async def upsert_avatar_image(
    config_hash: str, status: str, image_url: str | None = None
) -> None:
    """Insert or update a portrait cache row (keyed by config_hash). status ∈
    pending|ready|failed."""
    client = await _get_client()
    payload: dict = {"config_hash": config_hash, "status": status, "updated_at": "now()"}
    if image_url is not None:
        payload["image_url"] = image_url
    await client.table("avatar_images").upsert(payload, on_conflict="config_hash").execute()
