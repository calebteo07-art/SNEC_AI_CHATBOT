#!/usr/bin/env python3
"""Async student identity manager — handles student IDs and PDPA consent.

All functions are async and use the Supabase student_consent table.

Usage:
    from tools.shared.identity import get_or_create_student, has_consented, record_consent
    student_id, student_name = await get_or_create_student(full_name, email)
"""
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.audit_log import log

PDPA_VERSION = "1.0"


async def get_or_create_student(name: str, email: str) -> tuple[str, str]:
    """Look up a student by email; create a new consent row if not found.
    Returns (student_id, student_name).

    The stored name wins for a returning student: student_consent.student_name is the
    identity of record (it is what /api/auth/me reads), and `name` here is only ever a
    best-guess seed from the caller — for staff, who have no approved_students row, it
    degrades to their email address. Returning it keeps every caller agreeing on what
    the person is called instead of greeting them by their email.

    Callers that hold an *authoritative* name (the one an admin typed into the roster)
    should pass the result through sync_roster_name() to correct a stale stored one.
    """
    existing = await db.get_consent_by_email(email)
    if existing:
        student_id = existing["student_id"]
        log("student_lookup", student_id=student_id, feature="identity", detail="returning student")
        return student_id, (existing.get("student_name") or "").strip() or name

    student_id = str(uuid.uuid4())
    try:
        await db.upsert_consent(student_id, student_name=name, email=email)
    except Exception:
        # A concurrent first-login won the race (or, once UNIQUE(lower(email)) exists, the DB
        # rejected this second row): re-read by email and defer to the stored identity. Minting
        # a second uuid here is exactly the bug we are closing — it strands the person's
        # avatar_config/streak/XP under a duplicate id and re-fires the onboarding gate. A
        # genuine write failure (nothing to re-read) still surfaces.
        winner = await db.get_consent_by_email(email)
        if winner:
            log("student_create_raced", student_id=winner["student_id"], feature="identity",
                detail="deferred to existing identity after insert conflict")
            return winner["student_id"], (winner.get("student_name") or "").strip() or name
        raise
    log("student_created", student_id=student_id, feature="identity", detail="new student registered")
    return student_id, name


async def seed_student_name(email: str, full_name: str) -> None:
    """Persist an admin-entered display name to the identity of record (student_consent)
    at account-creation time, so it is authoritative immediately — before first login, and
    even for staff, who have no approved_students row to seed a name from. Updates the
    person's existing consent row (matched by email) or creates one keyed by a fresh id;
    that row binds to the account at first login, which also matches by email (PDPA consent
    is still recorded then). A blank name is a no-op — never clobber a stored name with
    nothing. Caller passes an already-normalised (lower-cased, stripped) email."""
    name = (full_name or "").strip()
    if not name:
        return
    existing = await db.get_consent_by_email(email)
    if existing:
        await db.update_consent(existing["student_id"], student_name=name)
    else:
        await db.upsert_consent(str(uuid.uuid4()), student_name=name, email=email)
    log("student_name_seeded", student_id=(existing or {}).get("student_id", ""),
        feature="identity", detail="admin-entered name persisted to consent")


async def sync_roster_name(student_id: str, stored_name: str, roster_name: str) -> str:
    """Reconcile the stored identity with the admin-entered roster name; return the
    name to use.

    approved_students.full_name is authoritative: an admin types it when creating the
    account and can correct it afterwards, and students cannot rename themselves. The
    consent row is only the snapshot taken at first login, so a correction would other-
    wise never reach the greeting. Healing the row (rather than just preferring the
    roster name in the response) keeps /api/auth/me — which reads student_consent —
    and every downstream feature agreeing on one name.

    Writes only on a real mismatch. Staff have no roster row, so roster_name is empty
    for them and their stored name is left exactly as it is.
    """
    if not roster_name or roster_name == stored_name:
        return stored_name or roster_name

    await db.update_consent(student_id, student_name=roster_name)
    log("student_name_synced", student_id=student_id, feature="identity",
        detail=f"roster name replaced stored name {stored_name!r}")
    return roster_name


async def has_consented(student_id: str) -> bool:
    """Return True if the student has a recorded consent_date and no withdrawn_date."""
    row = await db.get_consent_by_student_id(student_id)
    if not row:
        return False
    return bool(row.get("consent_date")) and not bool(row.get("withdrawn_date"))


async def record_consent(student_id: str) -> None:
    """Record PDPA consent for a student."""
    now = datetime.now(timezone.utc).isoformat()
    await db.update_consent(
        student_id,
        consent_date=now,
        pdpa_version=PDPA_VERSION,
        withdrawn_date=None,
    )
    log("consent_recorded", student_id=student_id, feature="identity",
        detail=f"pdpa_version={PDPA_VERSION}")


async def withdraw_consent(student_id: str) -> None:
    """Record consent withdrawal for a student."""
    now = datetime.now(timezone.utc).isoformat()
    await db.update_consent(student_id, withdrawn_date=now)
    log("consent_withdrawn", student_id=student_id, feature="identity", detail="")
