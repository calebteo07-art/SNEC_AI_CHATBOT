#!/usr/bin/env python3
"""Create the snec_profiles, snec_supervisors, snec_supervisor_alerts, and
snec_case_progress sheets if they do not already exist in the project spreadsheet.

Run once during setup:
    python tools/profile/bootstrap_sheets.py
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gsheets import _get_spreadsheet

SHEETS = {
    "snec_profiles": [
        "student_id", "weak_topics", "missed_findings", "retention_scores",
        "session_count", "streak", "last_active", "learning_velocity", "checkin_done_today",
        "role", "supervisor_note",
    ],
    "snec_supervisors": [
        "supervisor_id", "email", "cohort", "role",
    ],
    "snec_supervisor_alerts": [
        "week_start", "active_students", "inactive_students", "weakest_topics",
        "at_risk_count", "report_json",
    ],
    "snec_case_progress": [
        "student_id", "case_id", "total_score", "passed", "completed_at",
    ],
}


def ensure_sheet(name: str, headers: list[str]) -> None:
    spreadsheet = _get_spreadsheet()
    try:
        ws = spreadsheet.worksheet(name)
        existing = ws.row_values(1)
        missing = [h for h in headers if h not in existing]
        if missing:
            for col_name in missing:
                ws.add_cols(1)
                col_idx = len(existing) + 1
                ws.update_cell(1, col_idx, col_name)
                existing.append(col_name)
            print(f"  [updated] '{name}' — added columns: {missing}")
        else:
            print(f"  [skip] '{name}' already exists with all columns.")
    except Exception as e:
        if "worksheet" in str(e).lower() or "not found" in str(e).lower():
            ws = spreadsheet.add_worksheet(title=name, rows=1000, cols=len(headers))
            ws.append_row(headers, value_input_option="RAW")
            print(f"  [created] '{name}' with {len(headers)} columns.")
        else:
            raise


if __name__ == "__main__":
    print("Bootstrapping EyeQ profile sheets...\n")
    for sheet_name, cols in SHEETS.items():
        ensure_sheet(sheet_name, cols)
    print("\nDone.")
