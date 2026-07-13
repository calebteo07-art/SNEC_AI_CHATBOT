#!/usr/bin/env python3
"""Update a student's profile in Supabase student_profiles after a session.

Usage:
    from tools.profile.update_profile import update_profile
    await update_profile(student_id, topic="glaucoma", score=0.75)
"""
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.gamification import streak as streak_engine
from tools.profile.get_profile import get_profile
from tools.shared import db
from tools.shared.audit_log import log
from tools.shared.clock import app_today

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


def _parse_date(value):
    try:
        return date.fromisoformat(str(value)) if value else None
    except (ValueError, TypeError):
        return None


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

    today = app_today()
    today_iso = today.isoformat()

    # Streak — only recalculated when the student completes the daily check-in.
    # The engine treats weekends as rest days and bridges a single missed weekday
    # with a banked freeze (see tools/gamification/streak.py). checkin_history (the
    # durable log of check-in dates) is the source of truth: the last check-in is the
    # most recent date in it, and when the incremental `streak` column failed to
    # persist (the old missing last_checkin_date column) the running count is healed
    # from that log so an existing streak is never lost.
    current_streak = int(profile.get("streak") or 0)
    new_streak = current_streak
    new_freezes = int(profile.get("streak_freezes") or 0)
    best_streak = int(profile.get("best_streak") or 0)
    history = list(profile.get("checkin_history") or [])
    streak_advanced = False

    if checkin_done:
        recon = streak_engine.streak_state_from_history(history, today)
        base_streak = current_streak if current_streak > 0 else recon["streak"]
        base_freezes = new_freezes or recon["freezes"]
        result = streak_engine.advance_streak(
            recon["last_checkin"], today, base_streak, base_freezes
        )
        new_streak = result["streak"]
        new_freezes = result["freezes"]
        streak_advanced = result["changed"] and result["streak"] > base_streak
        if today_iso not in history:
            history.append(today_iso)
            history = history[-21:]
        best_streak = max(best_streak, recon["best"], new_streak)

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
        "last_active": today_iso,
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

    # New gamification columns (streak_freezes / best_streak / checkin_history) —
    # written in a separate call so a missing column (pre-migration) never breaks
    # the main update above.
    if checkin_done:
        try:
            await db.update_profile(
                student_id,
                streak_freezes=new_freezes,
                best_streak=best_streak,
                checkin_history=history,
            )
        except Exception as exc:
            log("streak_write_error", student_id=student_id, feature="gamification", detail=str(exc))

    # XP and hearts — separate call so a missing column (pre-migration) never
    # breaks the main profile update above.
    if xp_delta != 0 or hearts_used != 0:
        try:
            current_xp = int(profile.get("xp") or 0)
            streak_bonus = 50 if (checkin_done and streak_advanced) else 0
            new_xp = max(0, current_xp + xp_delta + streak_bonus)

            last_reset = _parse_date(profile.get("hearts_reset_date"))
            current_hearts = 5 if last_reset != today else int(profile.get("hearts") or 5)
            new_hearts = max(0, current_hearts - hearts_used)

            await db.update_profile(student_id, xp=new_xp, hearts=new_hearts,
                                    hearts_reset_date=today_iso)

            # xp_today (the daily-goal ring source) — resets each SGT day. Separate
            # guarded call so the xp/hearts write above survives a missing column.
            try:
                xtd = _parse_date(profile.get("xp_today_date"))
                base_today = int(profile.get("xp_today") or 0) if xtd == today else 0
                new_xp_today = max(0, base_today + xp_delta + streak_bonus)
                await db.update_profile(student_id, xp_today=new_xp_today, xp_today_date=today_iso)
            except Exception as exc:
                log("xp_today_write_error", student_id=student_id, feature="gamification", detail=str(exc))

            # coins_earned (lifetime Lumens, monotonic) — drives the home Lumens
            # badge tiers. Only ever increases (never on a forfeit/penalty), and a
            # separate guarded call so a missing column (pre-migration 009) never
            # breaks the xp write above.
            earned_gain = max(0, xp_delta + streak_bonus)
            if earned_gain > 0:
                try:
                    current_earned = int(profile.get("coins_earned") or 0)
                    await db.update_profile(student_id, coins_earned=current_earned + earned_gain)
                except Exception as exc:
                    log("coins_earned_write_error", student_id=student_id, feature="gamification", detail=str(exc))
        except Exception as exc:
            log("gamification_write_error", student_id=student_id, feature="gamification", detail=str(exc))
    else:
        # Still reset hearts daily even when xp_delta/hearts_used are both 0
        try:
            last_reset = _parse_date(profile.get("hearts_reset_date"))
            if last_reset != today:
                await db.update_profile(student_id, hearts=5, hearts_reset_date=today_iso)
        except Exception:
            pass
