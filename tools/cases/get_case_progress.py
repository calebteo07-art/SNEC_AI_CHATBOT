#!/usr/bin/env python3
"""Read case completion records for a student from Supabase.

Usage:
    from tools.cases.get_case_progress import get_case_progress
    results = await get_case_progress(student_id)
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db


async def get_case_progress(student_id: str) -> list[dict]:
    """Return all case completion records for a student.
    Each dict has: case_id (str), total_score (int), passed (bool), completed_at (str).
    Returns [] on error.
    """
    try:
        return await db.get_case_results(student_id)
    except Exception:
        return []
