#!/usr/bin/env python3
"""Loads a clinical case JSON from local .tmp/cases/ or Google Drive.

Usage (from run_case.py):
    from tools.cases.load_case import load_case
    case = load_case("case_001_poag")
"""

import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

LOCAL_CASES_DIR = PROJECT_ROOT / "cases"


def load_case(case_id: str) -> dict:
    """
    Load a case by ID. Checks local cases/ first, then Google Drive.

    Args:
        case_id: e.g. "case_001_poag"

    Returns:
        Case dict parsed from JSON.
    """
    if not re.match(r'^[a-zA-Z0-9_-]+$', case_id):
        raise ValueError(f"Invalid case_id: '{case_id}'")

    local_path = LOCAL_CASES_DIR / f"{case_id}.json"

    if local_path.exists():
        return json.loads(local_path.read_text(encoding="utf-8"))

    # Try Drive
    try:
        from tools.shared.gdrive import list_files, download_file
        files = list_files("cases")
        match = next((f for f in files if f["name"] == f"{case_id}.json"), None)
        if match:
            download_path = LOCAL_CASES_DIR / f"{case_id}.json"
            LOCAL_CASES_DIR.mkdir(parents=True, exist_ok=True)
            download_file(match["id"], download_path)
            return json.loads(download_path.read_text(encoding="utf-8"))
    except Exception:
        pass

    raise FileNotFoundError(
        f"Case '{case_id}' not found in .tmp/cases/ or Google Drive.\n"
        "Run Agent 16 (Case Author) to create cases, or place JSON files in .tmp/cases/"
    )


def list_available_cases() -> list[str]:
    """Return list of case IDs available locally."""
    if not LOCAL_CASES_DIR.exists():
        return []
    return [p.stem for p in LOCAL_CASES_DIR.glob("*.json")]
