#!/usr/bin/env python3
"""Update a student's profile in the snec_profiles Google Sheet after a session.

Usage:
    from tools.profile.update_profile import update_profile
    update_profile(
        student_id,
        topic="glaucoma",       # optional: topic studied/assessed
        score=0.75,             # optional: 0.0-1.0 retention score for topic
        new_missed_findings=[],  # optional: list of missed clinical findings
        checkin_done=False,     # optional: mark checkin complete
    )
"""

import json
import sys
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.profile.get_profile import get_profile
from tools.shared.gsheets import update_row
from tools.shared.audit_log import log

SHEET = "snec_profiles"
WEAK_THRESHOLD = 0.65


def _calc_velocity(old_scores: dict, new_scores: dict) -> str:
    """Compare average retention before/after to determine learning trend."""
    if not old_scores or not new_scores:
        return "stable"
    old_avg = sum(old_scores.values()) / len(old_scores)
    new_avg = sum(new_scores.values()) / len(new_scores)
    diff = new_avg - old_avg
    if diff > 0.05:
        return "improving"
    if diff < -0.05:
        return "declining"
    return "stable"


def update_profile(
    student_id: str,
    topic: str | None = None,
    score: float | None = None,
    new_missed_findings: list[str] | None = None,
    checkin_done: bool = False,
    role: str | None = None,
) -> None:
    """
    Update the student's profile. Never raises — logs errors to audit_log.
    """
    try:
        profile = get_profile(student_id)
    except Exception as exc:
        log("profile_update_error", student_id=student_id, feature="profile", detail=str(exc))
        return

    today = date.today()
    today_str = today.isoformat()

    # Streak
    last_active = profile.get("last_active", "")
    try:
        last = date.fromisoformat(last_active) if last_active else None
    except ValueError:
        last = None

    current_streak = int(profile.get("streak", "0") or "0")
    if last is None or last == today:
        new_streak = max(current_streak, 1)
    elif last == today - timedelta(days=1):
        new_streak = current_streak + 1
    else:
        new_streak = 1

    # Retention scores
    try:
        retention = json.loads(profile.get("retention_scores", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        retention = {}
    old_retention = dict(retention)

    if topic and score is not None:
        old = float(retention.get(topic, score))
        retention[topic] = round(0.3 * float(score) + 0.7 * old, 3)

    # Weak topics
    weak_topics = [t for t, s in retention.items() if s < WEAK_THRESHOLD]

    # Missed findings — deduplicate by word overlap, cap at 20 entries
    try:
        findings = json.loads(profile.get("missed_findings", "[]") or "[]")
    except (json.JSONDecodeError, TypeError):
        findings = []

    def _is_near_duplicate(new: str, existing: list) -> bool:
        new_words = set(new.lower().split())
        return any(len(new_words & set(f.lower().split())) >= 3 for f in existing)

    if new_missed_findings:
        for f in new_missed_findings:
            if not _is_near_duplicate(f, findings):
                findings.append(f)
        if len(findings) > 20:
            findings = findings[-20:]

    # Learning velocity
    velocity = _calc_velocity(old_retention, retention)

    # Session count
    session_count = int(profile.get("session_count", "0") or "0") + 1

    updates = {
        "session_count": str(session_count),
        "streak": str(new_streak),
        "last_active": today_str,
        "retention_scores": json.dumps(retention),
        "weak_topics": json.dumps(weak_topics),
        "missed_findings": json.dumps(findings),
        "learning_velocity": velocity,
    }
    if checkin_done:
        updates["checkin_done_today"] = "true"
    if role:
        updates["role"] = role

    try:
        update_row(SHEET, "student_id", student_id, updates)
    except Exception as exc:
        log("profile_write_error", student_id=student_id, feature="profile", detail=str(exc))
