#!/usr/bin/env python3
"""Update a student's profile in Supabase student_profiles after a session.

Usage:
    from tools.profile.update_profile import update_profile
    await update_profile(student_id, topic="glaucoma", score=0.75)
"""
import sys
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.profile.get_profile import get_profile
from tools.shared import db
from tools.shared.audit_log import log

WEAK_THRESHOLD = 0.65


def _calc_velocity(old_scores: dict, new_scores: dict) -> str:
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


async def update_profile(
    student_id: str,
    topic: str | None = None,
    score: float | None = None,
    new_missed_findings: list[str] | None = None,
    checkin_done: bool = False,
    role: str | None = None,
    xp_delta: int = 0,
    hearts_used: int = 0,
) -> None:
    """Update the student's profile. Never raises — logs errors to audit_log."""
    try:
        profile = await get_profile(student_id)
    except Exception as exc:
        log("profile_update_error", student_id=student_id, feature="profile", detail=str(exc))
        return

    today = date.today()

    # Streak — only recalculate when the student completes the daily check-in
    current_streak = int(profile.get("streak") or 0)
    new_streak = current_streak

    if checkin_done:
        last_active = profile.get("last_active")
        try:
            last = date.fromisoformat(str(last_active)) if last_active else None
        except (ValueError, TypeError):
            last = None

        if last is None or last == today:
            new_streak = max(current_streak, 1)
        elif last == today - timedelta(days=1):
            new_streak = current_streak + 1
        else:
            new_streak = 0

    # Retention scores — already a dict from Supabase JSONB
    retention = dict(profile.get("retention_scores") or {})
    old_retention = dict(retention)

    if topic and score is not None:
        old = float(retention.get(topic, score))
        retention[topic] = round(0.3 * float(score) + 0.7 * old, 3)

    # Weak topics
    weak_topics = [t for t, s in retention.items() if s < WEAK_THRESHOLD]

    # Missed findings — already a list from Supabase JSONB
    findings = list(profile.get("missed_findings") or [])

    def _is_near_duplicate(new: str, existing: list) -> bool:
        new_words = set(new.lower().split())
        return any(len(new_words & set(f.lower().split())) >= 3 for f in existing)

    if new_missed_findings:
        for f in new_missed_findings:
            if not _is_near_duplicate(f, findings):
                findings.append(f)
        if len(findings) > 20:
            findings = findings[-20:]

    velocity = _calc_velocity(old_retention, retention)
    session_count = int(profile.get("session_count") or 0) + 1

    updates: dict = {
        "session_count": session_count,
        "last_active": today.isoformat(),
        "retention_scores": retention,
        "weak_topics": weak_topics,
        "missed_findings": findings,
        "learning_velocity": velocity,
    }
    if checkin_done:
        updates["streak"] = new_streak
        updates["checkin_done_today"] = True
    if role:
        updates["role"] = role

    try:
        await db.update_profile(student_id, **updates)
    except Exception as exc:
        log("profile_write_error", student_id=student_id, feature="profile", detail=str(exc))

    # XP and hearts — separate call so a missing column (pre-migration) never
    # breaks the main profile update above.
    if xp_delta != 0 or hearts_used != 0:
        try:
            current_xp = int(profile.get("xp") or 0)
            streak_bonus = 50 if (checkin_done and new_streak > current_streak) else 0
            new_xp = max(0, current_xp + xp_delta + streak_bonus)

            last_reset_raw = profile.get("hearts_reset_date")
            try:
                last_reset = date.fromisoformat(str(last_reset_raw)) if last_reset_raw else None
            except (ValueError, TypeError):
                last_reset = None

            if last_reset != today:
                current_hearts = 5
            else:
                current_hearts = int(profile.get("hearts") or 5)

            new_hearts = max(0, current_hearts - hearts_used)

            await db.update_profile(student_id, xp=new_xp, hearts=new_hearts,
                                    hearts_reset_date=today.isoformat())
        except Exception as exc:
            log("gamification_write_error", student_id=student_id, feature="gamification", detail=str(exc))
    else:
        # Still reset hearts daily even when xp_delta/hearts_used are both 0
        try:
            last_reset_raw = profile.get("hearts_reset_date")
            last_reset = date.fromisoformat(str(last_reset_raw)) if last_reset_raw else None
            if last_reset != today:
                await db.update_profile(student_id, hearts=5, hearts_reset_date=today.isoformat())
        except Exception:
            pass
