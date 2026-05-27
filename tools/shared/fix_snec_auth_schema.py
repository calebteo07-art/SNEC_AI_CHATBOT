#!/usr/bin/env python3
"""One-time migration: ensure snec_auth has a must_change column and backfill existing rows.

Existing rows (users who have already set a password) are backfilled to must_change=false.
Run once, then delete this file.

Usage:
    python tools/shared/fix_snec_auth_schema.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from tools.shared.gsheets import _get_sheet  # noqa: E402

SHEET_NAME = "snec_auth"


def main():
    sheet = _get_sheet(SHEET_NAME)
    headers = sheet.row_values(1)
    print(f"Current headers: {headers}")

    if "must_change" not in headers:
        # Add the column header at the end
        new_col_idx = len(headers) + 1
        sheet.update_cell(1, new_col_idx, "must_change")
        headers.append("must_change")
        print(f"Added 'must_change' header at column {new_col_idx}")

    must_change_col = headers.index("must_change") + 1

    # Backfill every existing data row that has an empty must_change to "false"
    all_values = sheet.get_all_values()
    updated = 0
    for row_num, row in enumerate(all_values[1:], start=2):
        current_val = row[must_change_col - 1] if len(row) >= must_change_col else ""
        if current_val.strip() == "":
            sheet.update_cell(row_num, must_change_col, "false")
            email = row[0] if row else "?"
            print(f"  Row {row_num} ({email}): set must_change=false")
            updated += 1

    print(f"\nDone. {updated} row(s) backfilled.")


if __name__ == "__main__":
    main()
