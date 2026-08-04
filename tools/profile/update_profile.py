#!/usr/bin/env python3
"""Update a student's profile in Supabase student_profiles after a session.

Usage:
    from tools.profile.update_profile import update_profile
    await update_profile(student_id, topic="glaucoma", score=0.75)
"""
import asyncio
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.gamification import streak as streak_engine
from tools.gamification.leaderboard import weekly_tally
from tools.gamification.league import apply_division_bonus
from tools.profile.get_profile import get_profile
from tools.shared import db
from tools.shared.audit_log import log
from tools.shared.clock import app_today, app_week_start

WEAK_THRESHOLD = 0.65

# Lumens awarded for completing the daily check-in (the core daily ritual), granted once
# per day when the check-in advances the streak. Kept modest so the check-in is a reliable
# daily anchor without dwarfing graded work (a passing OSCE station pays far more).
CHECKIN_BONUS = 50


def _fraction(value) -> float:
    """Bound a retention score to the 0-1 fraction every consumer assumes.

    `retention_scores` is read as a fraction everywhere — mastery multiplies it by 100,
    weak_topics compares it against WEAK_THRESHOLD, and the cohort/report/progress
    readers average it raw — but one writer's `score` is client-supplied
    (POST /api/gamification/sync). Bounding it at the single write keeps every reader
    honest without each having to re-clamp.
    """
    return min(1.0, max(0.0, float(value)))


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


async def seal_outgoing_week(profile: dict, week_start) -> None:
    """Preserve last week's final score before `weekly_tally` overwrites it.

    xp_week is never cleared at the Monday boundary — it is ignored once xp_week_start goes
    stale. So the closed week's score is still readable right up until this student's next
    earn, and that earn destroys it. Sealing here (idempotent on the composite PK) means a
    00:00 Monday earn can no longer erase a week of work. Best-effort: a failure here must
    never block the student's XP award."""
    stamp = str(profile.get("xp_week_start") or "")
    score = int(profile.get("xp_week") or 0)
    if not stamp or stamp == week_start.isoformat() or score <= 0:
        return
    try:
        await db.seal_week_score(profile.get("student_id"), stamp,
                                 int(profile.get("division") or 1), score)
    except Exception:
        pass


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
        # Both operands are bounded, so the blend is a 0-1 fraction by construction.
        # Clamping the STORED value too heals a row poisoned before this guard existed —
        # bounding only the incoming score would still blend 0.7 of an out-of-range
        # history forward on an otherwise legitimate write.
        value = _fraction(score)
        old = _fraction(retention.get(topic, value))
        retention[topic] = round(0.3 * value + 0.7 * old, 3)

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

    # ── Persist. The writes below touch DISJOINT column groups (session / streak /
    #    xp+hearts / xp_today / xp_week / coins) and are all computed from the single
    #    profile read above, so dispatch them CONCURRENTLY (asyncio.gather) instead of
    #    one-after-another: a hot caller (flashcard XP, check-in) otherwise pays N
    #    sequential Supabase round-trips on the single worker. Each write stays
    #    individually guarded — a column still pending its migration must never sink the
    #    others (same fault isolation as the previous sequential calls). _write swallows
    #    per-write errors, so the gather always completes cleanly.
    async def _write(label: str, feature: str, **fields) -> None:
        try:
            await db.update_profile(student_id, **fields)
        except Exception as exc:
            log(label, student_id=student_id, feature=feature, detail=str(exc))

    writes = [_write("profile_write_error", "profile", **updates)]

    # New gamification columns (streak_freezes / best_streak / checkin_history) —
    # a missing column (pre-migration) never breaks the others.
    if checkin_done:
        writes.append(_write(
            "streak_write_error", "gamification",
            streak_freezes=new_freezes, best_streak=best_streak, checkin_history=history,
        ))

    # Streak bonus for completing the daily check-in — computed up-front so it applies even
    # when the check-in carries no xp_delta of its own. (The bug this replaces left the bonus
    # inside the `xp_delta or hearts_used` guard below, so a plain check-in awarded nothing.)
    streak_bonus = CHECKIN_BONUS if (checkin_done and streak_advanced) else 0

    # THE DIVISION MULTIPLIER, applied exactly once, here. This function is the only place
    # any Lumen is credited in the app — OSCE grading, flashcard decks, tutor chat and the
    # check-in all arrive through it — so scaling at the four call sites instead would be
    # four chances to drift, and the drift would be silent (XP still lands, at the wrong
    # rate, and no screen says so).
    #
    # Applied to the SUM, not to xp_delta alone, so the check-in's streak bonus scales too:
    # it is computed above rather than passed in, which makes it the one award that could
    # quietly escape. apply_division_bonus passes penalties through untouched — a forfeit is
    # -30 flat at every tier — so nothing below needs to know the sign.
    gain = apply_division_bonus(xp_delta + streak_bonus, profile.get("division"))

    # XP / hearts / daily + weekly tallies / lifetime Lumens. Values are pure functions
    # of the profile read above; each lands in its own guarded write. Guard the
    # computation too so update_profile keeps its never-raises contract.
    # Every tally below spends `gain`, never the raw delta: three of four scaled would give
    # a student a weekly rank and a level that disagree.
    if xp_delta != 0 or hearts_used != 0 or streak_bonus > 0:
        try:
            current_xp = int(profile.get("xp") or 0)
            new_xp = max(0, current_xp + gain)
            last_reset = _parse_date(profile.get("hearts_reset_date"))
            current_hearts = 5 if last_reset != today else int(profile.get("hearts") or 5)
            new_hearts = max(0, current_hearts - hearts_used)
            writes.append(_write(
                "xp_write_error", "gamification",
                xp=new_xp, hearts=new_hearts, hearts_reset_date=today_iso,
            ))

            # xp_today (the daily-goal ring source) — resets each SGT day.
            xtd = _parse_date(profile.get("xp_today_date"))
            base_today = int(profile.get("xp_today") or 0) if xtd == today else 0
            new_xp_today = max(0, base_today + gain)
            writes.append(_write(
                "xp_today_write_error", "gamification",
                xp_today=new_xp_today, xp_today_date=today_iso,
            ))

            # xp_week (the weekly-leaderboard tally) — resets each SGT week (Monday).
            week_start = app_week_start()
            # Seal the OUTGOING week before the tally below discards it: xp_week is ignored
            # at the boundary, not cleared, so this is the last moment last week's score
            # exists anywhere. No-ops (no I/O) except on the one earn that crosses a Monday.
            await seal_outgoing_week(profile, week_start)
            new_xp_week = weekly_tally(profile.get("xp_week"), profile.get("xp_week_start"),
                                       week_start, gain)
            writes.append(_write(
                "xp_week_write_error", "gamification",
                xp_week=new_xp_week, xp_week_start=week_start.isoformat(),
            ))

            # coins_earned (lifetime Lumens, monotonic) — only ever increases (never on a
            # forfeit/penalty), drives the home Lumens badge tiers.
            earned_gain = max(0, gain)
            if earned_gain > 0:
                current_earned = int(profile.get("coins_earned") or 0)
                writes.append(_write(
                    "coins_earned_write_error", "gamification",
                    coins_earned=current_earned + earned_gain,
                ))
        except Exception as exc:
            log("gamification_write_error", student_id=student_id, feature="gamification", detail=str(exc))
    else:
        # Still reset hearts daily even when xp_delta/hearts_used are both 0.
        try:
            last_reset = _parse_date(profile.get("hearts_reset_date"))
            if last_reset != today:
                writes.append(_write(
                    "hearts_reset_error", "gamification",
                    hearts=5, hearts_reset_date=today_iso,
                ))
        except Exception:
            pass

    await asyncio.gather(*writes)
