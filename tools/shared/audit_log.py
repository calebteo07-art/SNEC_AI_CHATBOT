#!/usr/bin/env python3
"""Local developer trace — an append-only JSONL breadcrumb file. NOT the audit trail.

READ THIS BEFORE ADDING A log() CALL. This app has two independent audit mechanisms and
only one of them ever reaches a human:

  * ``db.insert_audit_event()`` writes the Supabase ``audit_events`` table (migration 014),
    which ``GET /api/admin/audit`` serves to admins. Durable, queryable, survives a
    redeploy, shared across workers. **This is the audit trail.**
  * ``log()`` (this module) appends to ``.tmp/audit_log.jsonl``, which has NO reader
    anywhere in the app — ``read_recent()`` below is called only by this file's own
    self-test — and which lives on Render's ephemeral per-worker disk, so it is discarded
    on the next restart and never aggregated across workers.

Choosing between them: if a human ever has to answer a question from the record — what
broke, who did what, why did a student's rank stop moving — it belongs in ``audit_events``.
Reach for ``log()`` only when the event's real record already lives in a queryable table
(a failed profile write logged next to the ``profiles`` row it was writing), so the JSONL
line is a local debugging convenience whose loss costs nothing.

Security-relevant events do BOTH: the durable row is the record, and the local line carries
the extra debugging context that must NOT be persisted — see ``routers/chat.py``, where the
JSONL line keeps the raw blocked query and the ``audit_events`` twin keeps only the reason.

Student IDs are SHA-256 hashed before writing — raw PII never touches this file.

Usage (from other tools):
    from tools.shared.audit_log import log
    log("session_start", student_id="uuid-here", feature="chatbot", detail="topic: glaucoma")

Self-test:
    python tools/shared/audit_log.py
"""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
LOG_FILE = PROJECT_ROOT / ".tmp" / "audit_log.jsonl"


def _hash_id(student_id: str) -> str:
    """SHA-256 hash a student ID so raw PII never enters the log."""
    return hashlib.sha256(student_id.encode()).hexdigest()[:16]


def log(
    event_type: str,
    student_id: str = "system",
    feature: str = "system",
    detail: str = "",
) -> None:
    """
    Append one line to the local .tmp/audit_log.jsonl trace. Not staff-visible — see the
    module docstring for when to use db.insert_audit_event() instead.

    Args:
        event_type: What happened. Examples: session_start, card_reviewed,
                    case_completed, consent_recorded, image_quiz_start.
        student_id: Raw student UUID — will be hashed before writing.
        feature:    Which part of the app. Examples: chatbot, flashcards,
                    cases, image_quiz, onboarding, system.
        detail:     Any extra context (no PII). Examples: "topic: glaucoma",
                    "score: 85", "card_id: abc123".
    """
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "student_id": _hash_id(student_id),
        "feature": feature,
        "detail": detail,
    }

    try:
        LOG_FILE.parent.mkdir(exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except (PermissionError, OSError):
        # Read-only filesystem (e.g. container without a writable volume) —
        # audit log is best-effort; never crash a request because of it.
        pass


def read_recent(n: int = 20) -> list[dict]:
    """Return the last n entries from the local trace file.

    Used only by the self-test below — nothing in the running app reads this file, which is
    the whole reason log() is not an audit trail. Reads the file whole, with no rotation, so
    do not wire it to a request path."""
    if not LOG_FILE.exists():
        return []
    lines = LOG_FILE.read_text(encoding="utf-8").strip().splitlines()
    return [json.loads(line) for line in lines[-n:]]


if __name__ == "__main__":
    print("Testing audit_log.py...\n")

    log("test_event", student_id="test-student-001", feature="system", detail="audit log self-test")
    print(f"  Log file: {LOG_FILE}")

    entries = read_recent(5)
    latest = entries[-1]
    assert latest["event_type"] == "test_event"
    assert latest["feature"] == "system"
    assert "test-student-001" not in latest["student_id"], "Raw student ID must not appear in log"
    assert len(latest["student_id"]) == 16, "Expected 16-char hash"

    print(f"  Entry written: {json.dumps(latest, indent=2)}")
    print("\n  [PASS] audit_log.py working correctly.")
    sys.exit(0)
