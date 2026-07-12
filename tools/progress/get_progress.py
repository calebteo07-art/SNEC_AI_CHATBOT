#!/usr/bin/env python3
"""Compute a student's learning progress for the Progress screen."""
import sys
from datetime import date, datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.gamification import streak as streak_engine
from tools.profile.get_profile import get_profile
from tools.shared import db
from tools.shared.clock import app_today

DAILY_XP_GOAL = 100


def _parse_date(value):
    try:
        return date.fromisoformat(str(value)) if value else None
    except (ValueError, TypeError):
        return None


def _streak_detail(profile: dict) -> dict:
    """The data the dashboard streak band renders: current/best/freezes, whether
    today is done, and the Mon..Sun week with weekend rest days."""
    today = app_today()
    current = int(profile.get("streak") or 0)
    freezes = int(profile.get("streak_freezes") or 0)
    best = max(int(profile.get("best_streak") or 0), current)
    last_checkin = _parse_date(profile.get("last_checkin_date"))
    history = list(profile.get("checkin_history") or [])

    # If the streak is no longer continuable, show it as zero (matches checkin.py).
    if current > 0 and not streak_engine.streak_alive(last_checkin, today, freezes):
        current = 0

    done_today = today.isoformat() in history
    tier = streak_engine.tier_for(current)
    return {
        "current": current,
        "best": best,
        "freezes": freezes,
        "done_today": done_today,
        "week": streak_engine.current_week_states(today, history),
        "tier": tier["tier"],
        "next_tier": tier["next"],
        "to_next": tier["to_next"],
    }


async def get_progress(student_id: str) -> dict:
    """Return structured progress data for the given student.

    Returns:
        {
          "session_count": int,
          "streak": int,
          "learning_velocity": str,
          "weak_topics": list[str],
          "topic_performance": list[{"topic": str, "score": float}],
          "sessions": list[{"session_id": str, "timestamp": str,
                            "topic": str, "summary": str, "mode": str}],
        }
    """
    profile = await get_profile(student_id)

    streak = int(profile.get("streak") or 0)
    session_count = int(profile.get("session_count") or 0)
    velocity = profile.get("learning_velocity") or "stable"
    weak_topics = profile.get("weak_topics") or []
    retention: dict = profile.get("retention_scores") or {}

    topic_performance = [
        {"topic": t, "score": round(s, 3)}
        for t, s in sorted(retention.items(), key=lambda x: x[1])
    ]

    raw_sessions = []
    try:
        raw_sessions = await db.get_sessions(student_id, limit=30)
    except Exception:
        pass

    sessions = []
    for s in raw_sessions:
        ts = str(s.get("created_at", ""))
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            friendly = dt.strftime("%d %b %Y")
        except Exception:
            friendly = ts[:10]
        sessions.append({
            "session_id": str(s.get("session_id", "")),
            "timestamp": friendly,
            "topic": s.get("topic") or "—",
            "summary": s.get("summary", ""),
            "mode": "chat",
        })

    xp = int(profile.get("xp") or 0)
    hearts = int(profile.get("hearts") or 5)
    level = (xp // 500) + 1

    # Lifetime Lumens for the home vault badges. Falls back to the current balance
    # (xp) when the column is absent (pre-migration 009) — before any forfeit,
    # lifetime ≈ balance, so the badge card looks correct during the transition.
    coins_earned = int(profile.get("coins_earned") or 0) or xp

    # Daily-goal XP tally (the dashboard ring source) — resets each SGT day, so a
    # stale xp_today_date reads as zero.
    today = app_today()
    xp_today = int(profile.get("xp_today") or 0) if _parse_date(profile.get("xp_today_date")) == today else 0

    streak_detail = _streak_detail(profile)

    return {
        "session_count": session_count,
        "streak": streak_detail["current"],
        "xp": xp,
        "coins_earned": coins_earned,
        "xp_today": xp_today,
        "daily_goal": DAILY_XP_GOAL,
        "hearts": hearts,
        "level": level,
        "learning_velocity": velocity,
        "weak_topics": list(weak_topics)[:5],
        "topic_performance": topic_performance,
        "sessions": sessions,
        "streak_detail": streak_detail,
    }
