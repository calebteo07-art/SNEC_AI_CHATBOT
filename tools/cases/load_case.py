#!/usr/bin/env python3
"""Loads a clinical case JSON from the local cases/ directory.

Usage:
    from tools.cases.load_case import load_case
    case = load_case("case_oa_001_history_triage")
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

    raise FileNotFoundError(
        f"Case '{case_id}' not found in cases/. "
        "Place the JSON file in the cases/ directory."
    )


def list_available_cases() -> list[str]:
    """Return list of case IDs available locally."""
    if not LOCAL_CASES_DIR.exists():
        return []
    return [p.stem for p in LOCAL_CASES_DIR.glob("*.json")]
