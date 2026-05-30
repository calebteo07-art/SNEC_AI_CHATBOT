#!/usr/bin/env python3
"""Log a completed chat session to Supabase chat_sessions table.

Usage:
    from tools.chatbot.log_session import log_session
    await log_session(student_id, messages, topic, token_count, model)
"""
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.audit_log import log as audit_log


async def log_session(
    student_id: str,
    messages: list[dict],
    topic: str = "Ophthalmology",
    token_count: int = 0,
    model: str = "",
) -> str:
    """Append a session record and return the session_id (UUID string).
    Never raises — logs errors to audit_log.
    """
    summary = next(
        (m["content"][:200] for m in reversed(messages) if m.get("role") == "assistant"),
        "",
    )

    try:
        await db.insert_session(
            student_id=student_id,
            topic=topic[:100],
            summary=summary,
            token_count=token_count,
            model=model,
        )
        audit_log("session_logged", student_id=student_id, feature="chatbot", detail=f"topic: {topic}")
    except Exception as exc:
        audit_log("session_log_error", student_id=student_id, feature="chatbot", detail=str(exc))

    return str(uuid.uuid4())
