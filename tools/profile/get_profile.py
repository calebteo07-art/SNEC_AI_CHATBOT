#!/usr/bin/env python3
"""Read a student's profile from the snec_profiles Google Sheet.

Returns a default profile dict if the student has no row (and creates the row).
Resets checkin_done_today if last_active is not today.

Usage:
    from tools.profile.get_profile import get_profile
    profile = get_profile(student_id)
"""

import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gsheets import get_rows, append_row, update_row
from tools.shared.audit_log import log

SHEET = "snec_profiles"

_DEFAULTS = {
    "role": "",
    "weak_topics": "[]",
    "missed_findings": "[]",
    "retention_scores": "{}",
    "session_count": "0",
    "streak": "0",
    "last_active": "",
    "learning_velocity": "stable",
    "checkin_done_today": "false",
}


def _default_profile(student_id: str) -> dict:
    """Return a new profile dict with defaults for the given student_id."""
    return {"student_id": student_id, **_DEFAULTS}


def get_profile(student_id: str) -> dict:
    """
    Return the student's profile dict. Creates a default row if missing.
    Resets checkin_done_today if last_active is not today.

    Never raises — returns a default profile on any Sheets error.
    """
    try:
        rows = get_rows(SHEET, filters={"student_id": student_id})
    except Exception as exc:
        log("profile_read_error", student_id=student_id, feature="profile", detail=str(exc))
        return _default_profile(student_id)

    if not rows:
        profile = _default_profile(student_id)
        try:
            append_row(SHEET, profile)
        except Exception as exc:
            log("profile_create_error", student_id=student_id, feature="profile", detail=str(exc))
        return profile

    profile = rows[0]

    # Reset checkin flag if this is a new day
    last_active_str = profile.get("last_active", "")
    if last_active_str:
        try:
            last_active_date = date.fromisoformat(last_active_str)
            if last_active_date != date.today():
                profile["checkin_done_today"] = "false"
                try:
                    update_row(SHEET, "student_id", student_id, {"checkin_done_today": "false"})
                except Exception as exc:
                    log("profile_reset_error", student_id=student_id, feature="profile", detail=str(exc))
        except ValueError:
            pass

    return profile
