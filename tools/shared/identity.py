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
    """
    existing = await db.get_consent_by_email(email)
    if existing:
        student_id = existing["student_id"]
        log("student_lookup", student_id=student_id, feature="identity", detail="returning student")
        return student_id, (existing.get("student_name") or "").strip() or name

    student_id = str(uuid.uuid4())
    await db.upsert_consent(student_id, student_name=name, email=email)
    log("student_created", student_id=student_id, feature="identity", detail="new student registered")
    return student_id, name


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
