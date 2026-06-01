#!/usr/bin/env python3
"""Compute a student's learning progress for the Progress screen."""
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.profile.get_profile import get_profile
from tools.shared import db


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

    return {
        "session_count": session_count,
        "streak": streak,
        "learning_velocity": velocity,
        "weak_topics": list(weak_topics)[:5],
        "topic_performance": topic_performance,
        "sessions": sessions,
    }
