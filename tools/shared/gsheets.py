#!/usr/bin/env python3
"""Shared Google Sheets wrapper — all Sheets reads/writes in the SNEC platform go through here.

Every tool that needs to read or write data imports this module instead of
calling the gspread API directly. This keeps API changes in one place.

Usage (from other tools):
    from tools.shared.gsheets import append_row, get_rows, update_row

Self-test:
    python tools/shared/gsheets.py
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
import gspread

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

TOKEN_FILE = PROJECT_ROOT / "token.json"
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

_client: gspread.Client | None = None
_spreadsheet: gspread.Spreadsheet | None = None


def _get_spreadsheet() -> gspread.Spreadsheet:
    """Return authenticated gspread Spreadsheet, reusing connection if open."""
    global _client, _spreadsheet

    if _spreadsheet is not None:
        return _spreadsheet

    spreadsheet_id = os.getenv("GOOGLE_SPREADSHEET_ID", "").strip()
    if not spreadsheet_id:
        raise RuntimeError(
            "GOOGLE_SPREADSHEET_ID not set in .env. "
            "Run python tools/shared/infrastructure_bootstrap.py first."
        )

    if not TOKEN_FILE.exists():
        raise RuntimeError(
            "token.json not found. "
            "Run python tools/shared/infrastructure_bootstrap.py to authenticate."
        )

    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")

    _client = gspread.authorize(creds)
    _spreadsheet = _client.open_by_key(spreadsheet_id)
    return _spreadsheet


def _get_sheet(sheet_name: str) -> gspread.Worksheet:
    return _get_spreadsheet().worksheet(sheet_name)


def append_row(sheet_name: str, row_dict: dict) -> None:
    """
    Append a row to a sheet. Keys must match the sheet's header row exactly.

    Args:
        sheet_name: e.g. "snec_sessions", "snec_flashcards"
        row_dict:   e.g. {"session_id": "abc", "student_id": "xyz", ...}
    """
    sheet = _get_sheet(sheet_name)
    headers = sheet.row_values(1)
    row = [str(row_dict.get(h, "")) for h in headers]
    sheet.append_row(row, value_input_option="RAW")


def get_rows(sheet_name: str, filters: dict | None = None) -> list[dict]:
    """
    Return all rows as a list of dicts. Optionally filter by column values.

    Args:
        sheet_name: e.g. "snec_flashcards"
        filters:    e.g. {"student_id": "abc123"} — returns only matching rows

    Returns:
        List of dicts, one per matching row. Empty list if no matches.
    """
    sheet = _get_sheet(sheet_name)
    records = sheet.get_all_records()

    if not filters:
        return records

    return [
        row for row in records
        if all(str(row.get(k, "")) == str(v) for k, v in filters.items())
    ]


def update_row(
    sheet_name: str,
    match_col: str,
    match_val: str,
    updates: dict,
) -> bool:
    """
    Update columns in the first row where match_col == match_val.

    Args:
        sheet_name: e.g. "snec_flashcards"
        match_col:  Column to search, e.g. "card_id"
        match_val:  Value to match, e.g. "card-abc123"
        updates:    Columns and new values, e.g. {"interval_days": "7", "easiness_factor": "2.5"}

    Returns:
        True if a row was found and updated, False if no match.
    """
    sheet = _get_sheet(sheet_name)
    headers = sheet.row_values(1)

    if match_col not in headers:
        raise ValueError(f"Column '{match_col}' not found in sheet '{sheet_name}'")

    match_col_idx = headers.index(match_col) + 1
    cell = sheet.find(match_val, in_column=match_col_idx)

    if cell is None:
        return False

    row_num = cell.row
    for col_name, new_value in updates.items():
        if col_name in headers:
            col_idx = headers.index(col_name) + 1
            sheet.update_cell(row_num, col_idx, str(new_value))

    return True


def delete_row(sheet_name: str, match_col: str, match_val: str) -> bool:
    """
    Delete the first row where match_col == match_val.
    Used for test cleanup — not called in normal app operation.

    Returns:
        True if deleted, False if not found.
    """
    sheet = _get_sheet(sheet_name)
    headers = sheet.row_values(1)

    if match_col not in headers:
        return False

    match_col_idx = headers.index(match_col) + 1
    cell = sheet.find(match_val, in_column=match_col_idx)

    if cell is None:
        return False

    sheet.delete_rows(cell.row)
    return True


if __name__ == "__main__":
    print("Testing gsheets.py...\n")

    TEST_SESSION_ID = "gsheets-self-test-001"

    # Write a test row
    print("  Writing test row to snec_sessions...")
    append_row("snec_sessions", {
        "session_id": TEST_SESSION_ID,
        "student_id": "test-student",
        "timestamp": "2026-01-01T00:00:00Z",
        "topic": "gsheets self-test",
        "summary": "automated test row",
        "token_count": "0",
        "model": "test",
    })
    print("  [OK] Row written.")

    # Read it back
    print("  Reading back rows filtered by session_id...")
    rows = get_rows("snec_sessions", filters={"session_id": TEST_SESSION_ID})
    assert len(rows) == 1, f"Expected 1 row, got {len(rows)}"
    assert rows[0]["topic"] == "gsheets self-test"
    print(f"  [OK] Row found: {rows[0]}")

    # Update it
    print("  Updating summary field...")
    updated = update_row("snec_sessions", "session_id", TEST_SESSION_ID, {"summary": "updated"})
    assert updated, "update_row returned False"
    rows = get_rows("snec_sessions", filters={"session_id": TEST_SESSION_ID})
    assert rows[0]["summary"] == "updated"
    print("  [OK] Row updated.")

    # Clean up
    print("  Deleting test row...")
    deleted = delete_row("snec_sessions", "session_id", TEST_SESSION_ID)
    assert deleted, "delete_row returned False"
    rows = get_rows("snec_sessions", filters={"session_id": TEST_SESSION_ID})
    assert len(rows) == 0
    print("  [OK] Row deleted.")

    print("\n  [PASS] gsheets.py working correctly.")
    sys.exit(0)
