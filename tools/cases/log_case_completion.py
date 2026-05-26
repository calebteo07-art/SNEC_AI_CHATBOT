#!/usr/bin/env python3
"""Log a case completion to the snec_case_progress sheet."""

from datetime import datetime, timezone

from tools.shared.gsheets import append_row

SHEET = "snec_case_progress"


def log_case_completion(student_id: str, case_id: str, total_score: int) -> None:
    """Append a case completion record.

    A case is considered passing when total_score >= 24 (60% of 40).
    Multiple completions of the same case are allowed — the unlock logic
    counts distinct passing scores so students can retake cases freely.
    """
    passed = total_score >= 24
    append_row(SHEET, {
        "student_id": student_id,
        "case_id": case_id,
        "total_score": str(total_score),
        "passed": "true" if passed else "false",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
