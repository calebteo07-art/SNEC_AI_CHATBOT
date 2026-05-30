#!/usr/bin/env python3
"""Log a completed case simulation to Supabase case_progress table.

Usage:
    from tools.cases.log_case_completion import log_case_completion
    await log_case_completion(student_id, case_id, total_score, passed)
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.audit_log import log as audit_log


async def log_case_completion(
    student_id: str,
    case_id: str,
    total_score: int,
    passed: bool,
) -> None:
    """Append a case completion record. Never raises."""
    try:
        await db.insert_case_result(
            student_id=student_id,
            case_id=case_id,
            total_score=total_score,
            passed=passed,
        )
        audit_log(
            "case_completed",
            student_id=student_id,
            feature="cases",
            detail=f"case: {case_id}, score: {total_score}, passed: {passed}",
        )
    except Exception as exc:
        audit_log("case_log_error", student_id=student_id, feature="cases", detail=str(exc))
