#!/usr/bin/env python3
"""Retrieve a student's case completion history from snec_case_progress."""

from tools.shared.gsheets import get_rows

SHEET = "snec_case_progress"


def get_case_progress(student_id: str) -> dict[str, dict]:
    """Return completion records keyed by case_id.

    Each value is the *best* attempt: {"total_score": int, "passed": bool}.
    Only passing attempts (passed=="true") are relevant to unlock logic, but
    we expose the best score so the UI can show it if needed.
    """
    try:
        rows = get_rows(SHEET, filters={"student_id": student_id})
    except Exception:
        return {}

    best: dict[str, dict] = {}
    for row in rows:
        cid = str(row.get("case_id", ""))
        if not cid:
            continue
        score = int(row.get("total_score", 0) or 0)
        passed = str(row.get("passed", "false")).lower() == "true"
        prev = best.get(cid)
        if prev is None or score > prev["total_score"]:
            best[cid] = {"total_score": score, "passed": passed}
    return best
