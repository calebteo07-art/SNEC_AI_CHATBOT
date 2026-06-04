#!/usr/bin/env python3
"""Shared audit logger — append-only JSONL event log for the SNEC platform.

Every tool imports and calls log() whenever something significant happens.
Student IDs are SHA-256 hashed before writing — raw PII never touches the log.

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
    Append one audit event to .tmp/audit_log.jsonl.

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
    """Return the last n entries from the audit log."""
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
