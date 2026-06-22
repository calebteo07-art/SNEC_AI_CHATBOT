# tests/cases/test_checklist_provenance.py
"""Guard: every virtual-patient case resolves to a REAL database checklist.

The OSCE station builds its checklist via resolve_procedure_name() ->
get_checklist_by_name(); if the name matches nothing in Supabase it silently
falls back to a checklist built from the case's own rubric. The product
requirement is the opposite: every station checklist must come from the
ingested/authored checklists in the database.

The database is populated from two sources of truth:
  - tools/kb/run_ingestion.py            (checklists parsed from the OSCE PDFs)
  - tools/kb/seed_authored_checklists.py (authored, no-PDF checklists)

This test mirrors get_checklist_by_name's matching (exact, then case-insensitive
substring) against those names, so a typo'd or unmapped checklist_procedure
fails here instead of silently degrading a station.
"""
import json
from pathlib import Path

import pytest

from tools.cases.resolve_checklist import resolve_procedure_name
from tools.kb.run_ingestion import MODULE_1_CATALOG, MODULE_2_CATALOG
from tools.kb.seed_authored_checklists import authored_checklist_names

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CASES_DIR = PROJECT_ROOT / "cases"

# Canonical procedure names that actually exist in the database.
DB_NAMES = sorted(
    {
        e["procedure_name"]
        for e in (MODULE_1_CATALOG + MODULE_2_CATALOG)
        if e.get("is_checklist") and e.get("procedure_name")
    }
    | set(authored_checklist_names())
)

CASE_FILES = sorted(CASES_DIR.glob("case_*.json"))


def _db_match(name: str) -> str | None:
    """Mirror tools.kb.search.get_checklist_by_name: exact, then substring."""
    if not name:
        return None
    for n in DB_NAMES:                       # exact
        if n == name:
            return n
    low = name.lower()
    for n in DB_NAMES:                       # ilike %name%  (name is substring of n)
        if low in n.lower():
            return n
    return None


def test_case_files_exist():
    assert CASE_FILES, "no case files found"


def test_authored_checklists_registered():
    for n in authored_checklist_names():
        assert n in DB_NAMES


@pytest.mark.parametrize("case_file", CASE_FILES, ids=lambda p: p.stem)
def test_case_resolves_to_real_db_checklist(case_file):
    case = json.loads(case_file.read_text(encoding="utf-8"))
    name, how = resolve_procedure_name(case)
    assert name, (
        f"{case_file.name}: nothing resolved (how={how}) — the station would fall "
        f"back to the case's own rubric. Add a checklist_procedure (or keyword rule) "
        f"pointing to a real database checklist."
    )
    matched = _db_match(name)
    assert matched, (
        f"{case_file.name}: checklist_procedure {name!r} matches no database "
        f"checklist. Valid names:\n  " + "\n  ".join(DB_NAMES)
    )
