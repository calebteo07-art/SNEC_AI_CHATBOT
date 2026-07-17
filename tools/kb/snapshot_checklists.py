#!/usr/bin/env python3
"""Snapshot the real OSCE procedure checklists from Supabase into a test fixture.

The action-panel completeness test (tests/cases/test_action_panel_completeness.py)
asserts that EVERY step of EVERY procedure checklist is explicitly classified as a
manual chip or a verbal step — never left to fall through to a generically-clipped
label and silently vanish from the action panel. That test must run keyless and
offline in CI, so the checklists are frozen here into a fixture.

Excluded: the "* Skills Observation" sheets. Those are supervisor LOGBOOK tally
sheets (repeated rows like "Patient 1: Date /Age/Sex/Race", "Preceptor Name / Sign"),
not procedures a student performs at a station — classifying their rows as chips
would be meaningless.

Refresh after re-ingesting or editing any checklist:
    python tools/kb/snapshot_checklists.py            # write the fixture
    python tools/kb/snapshot_checklists.py --dry-run  # print a summary only
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

FIXTURE = PROJECT_ROOT / "tests" / "fixtures" / "procedure_checklists.json"

# Logbook tally sheets — not station procedures. See module docstring.
LOGBOOK_MARKER = "Skills Observation"


def _steps_of(row: dict) -> list[dict]:
    """Unwrap the `steps` column, which Supabase stores as {"steps": [...]}."""
    steps = row.get("steps") or []
    if isinstance(steps, str):
        steps = json.loads(steps)
    if isinstance(steps, dict):
        steps = steps.get("steps", [])
    return steps


def fetch() -> list[dict]:
    from tools.kb.supabase_client import get_client

    rows = get_client().table("checklists").select(
        "procedure_name, steps, checklist_type"
    ).execute().data
    out = []
    for r in sorted(rows, key=lambda x: x["procedure_name"]):
        if LOGBOOK_MARKER in r["procedure_name"]:
            continue
        out.append({
            "procedure_name": r["procedure_name"],
            "checklist_type": r.get("checklist_type"),
            "steps": [
                {
                    "step_number": s.get("step_number"),
                    "category": s.get("category"),
                    "critical": s.get("critical"),
                    "action": s.get("action"),
                }
                for s in _steps_of(r)
            ],
        })
    return out


def main() -> None:
    from dotenv import load_dotenv

    load_dotenv(PROJECT_ROOT / ".env")
    data = fetch()
    total = sum(len(c["steps"]) for c in data)
    for c in data:
        print(f"  {len(c['steps']):3}  {c['procedure_name']}")
    print(f"\n{len(data)} procedure checklists · {total} steps")

    if "--dry-run" in sys.argv:
        print("(dry run — fixture not written)")
        return
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
