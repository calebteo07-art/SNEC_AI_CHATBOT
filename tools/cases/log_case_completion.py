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
    score_100: int | None = None,
    safe: bool | None = None,
    consult_technique: int | None = None,
    judgement_safety: int | None = None,
    missed_critical: list | None = None,
    coaching: dict | None = None,
    checklist_coverage: int | None = None,
    grade_scale: int | None = None,
    checklist_detail: list | None = None,
) -> None:
    """Append a case completion record. Never raises. The rich OSCE-grade fields are
    additive and forwarded to db.insert_case_result, which degrades to the base four
    columns until migrations 011, 017, and 019 are applied."""
    try:
        await db.insert_case_result(
            student_id=student_id,
            case_id=case_id,
            total_score=total_score,
            passed=passed,
            score_100=score_100,
            safe=safe,
            consult_technique=consult_technique,
            judgement_safety=judgement_safety,
            missed_critical=missed_critical,
            coaching=coaching,
            checklist_coverage=checklist_coverage,
            grade_scale=grade_scale,
            checklist_detail=checklist_detail,
        )
        audit_log(
            "case_completed",
            student_id=student_id,
            feature="cases",
            detail=f"case: {case_id}, score: {total_score}, passed: {passed}",
        )
    except Exception as exc:
        audit_log("case_log_error", student_id=student_id, feature="cases", detail=str(exc))
