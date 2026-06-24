#!/usr/bin/env python3
"""Read a student's profile from Supabase student_profiles table.

Returns a default profile dict if the student has no row (and creates the row).
Resets checkin_done_today if last_active is not today.

Usage:
    from tools.profile.get_profile import get_profile
    profile = await get_profile(student_id)
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from datetime import date

from tools.shared import db
from tools.shared.audit_log import log
from tools.shared.clock import app_today

_DEFAULTS = {
    "role": "",
    "weak_topics": [],
    "missed_findings": [],
    "retention_scores": {},
    "session_count": 0,
    "streak": 0,
    "last_active": None,
    "learning_velocity": "stable",
    "checkin_done_today": False,
    "supervisor_note": "",
    "xp": 0,
    "hearts": 5,
    "hearts_reset_date": None,
    # Streak rest-days + freeze (migration 005)
    "streak_freezes": 0,
    "best_streak": 0,
    "checkin_history": [],
    # Daily-goal XP ring source (migration 005)
    "xp_today": 0,
    "xp_today_date": None,
}


def _default_profile(student_id: str) -> dict:
    return {"student_id": student_id, **_DEFAULTS}


async def get_profile(student_id: str) -> dict:
    """Return the student's profile dict. Creates a default row if missing.
    Resets checkin_done_today if last_active is not today.
    Never raises — returns a default profile on any error.
    """
    try:
        profile = await db.get_profile(student_id)
    except Exception as exc:
        log("profile_read_error", student_id=student_id, feature="profile", detail=str(exc))
        return _default_profile(student_id)

    if not profile:
        profile = _default_profile(student_id)
        try:
            await db.upsert_profile(student_id, **_DEFAULTS)
        except Exception as exc:
            log("profile_create_error", student_id=student_id, feature="profile", detail=str(exc))
        return profile

    # Reset checkin flag if this is a new day (SGT boundary)
    last_active = profile.get("last_active")
    if last_active:
        try:
            last_date = date.fromisoformat(str(last_active)) if isinstance(last_active, str) else last_active
            if last_date != app_today():
                profile["checkin_done_today"] = False
                try:
                    await db.update_profile(student_id, checkin_done_today=False)
                except Exception as exc:
                    log("profile_reset_error", student_id=student_id, feature="profile", detail=str(exc))
        except (ValueError, TypeError):
            pass

    return profile
