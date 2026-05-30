#!/usr/bin/env python3
"""Read case completion records for a student from Supabase.

Usage:
    from tools.cases.get_case_progress import get_case_progress
    progress = await get_case_progress(student_id)
    # returns dict of case_id -> {total_score, passed, completed_at}
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db


async def get_case_progress(student_id: str) -> dict:
    """Return dict of case_id -> row for a student.
    If a case was attempted multiple times, a passing result takes precedence.
    Returns {} on error.
    """
    try:
        results = await db.get_case_results(student_id)
        progress: dict = {}
        for row in results:
            case_id = row["case_id"]
            existing = progress.get(case_id)
            # Keep passing result if we already have one
            if existing and existing.get("passed"):
                continue
            progress[case_id] = row
        return progress
    except Exception:
        return {}
