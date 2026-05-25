#!/usr/bin/env python3
"""Compute a student's learning progress for the Progress screen.

Usage (from server.py):
    from tools.progress.get_progress import get_progress
    data = get_progress(student_id)
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.profile.get_profile import get_profile
from tools.shared.gsheets import get_rows


def get_progress(student_id: str) -> dict:
    """
    Return structured progress data for the given student.

    Returns:
        {
          "session_count": int,
          "streak": int,
          "learning_velocity": str,   # "improving" | "stable" | "declining"
          "weak_topics": list[str],
          "topic_performance": list[{topic, score, session_count}],
          "sessions": list[{session_id, timestamp, topic, summary, mode}],
        }
    """
    profile = get_profile(student_id)

    streak = int(profile.get("streak", 0) or 0)
    session_count = int(profile.get("session_count", 0) or 0)
    velocity = profile.get("learning_velocity", "stable") or "stable"

    try:
        weak_topics = json.loads(profile.get("weak_topics", "[]") or "[]")
    except (json.JSONDecodeError, TypeError):
        weak_topics = []

    try:
        retention: dict = json.loads(profile.get("retention_scores", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        retention = {}

    # Build per-topic performance list sorted worst→best
    topic_performance = [
        {"topic": t, "score": round(s, 3)}
        for t, s in sorted(retention.items(), key=lambda x: x[1])
    ]

    # Session history from Sheets (most recent first, cap at 30)
    try:
        raw_sessions = get_rows("snec_sessions", filters={"student_id": student_id})
    except Exception:
        raw_sessions = []

    sessions = []
    for s in reversed(raw_sessions[-30:]):
        ts = s.get("timestamp", "")
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            friendly = dt.strftime("%-d %b %Y")
        except Exception:
            friendly = ts[:10]
        sessions.append({
            "session_id": s.get("session_id", ""),
            "timestamp": friendly,
            "topic": s.get("topic", "—"),
            "summary": s.get("summary", ""),
            "mode": "chat",
        })

    return {
        "session_count": session_count,
        "streak": streak,
        "learning_velocity": velocity,
        "weak_topics": weak_topics[:5],
        "topic_performance": topic_performance,
        "sessions": sessions,
    }
