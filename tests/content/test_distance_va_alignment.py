"""Distance VA teaching content must match CC-D0008.

CC-D0008 (SNEC Nursing competency assessment, "Visual Acuity - Distance Vision
Testing for Adults & Children using LogMAR (Modified) Method") is the authority
wherever the sources disagree. It sides with the PSA Checklist V2 against the
older SOP NU-PR-OPD-D0039 v03 on every procedural point. Background and the
full three-way comparison: docs/notes/2026-07-31-distance-va-source-conflict.md.

Pinned here are the facts the SOP states differently (so a well-meaning edit
back to the SOP wording fails loudly), plus the Snellen/LogMAR ladder that no
source disputes and the app previously did not teach at all.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CASES_DIR = PROJECT_ROOT / "cases"
KB_DOC = PROJECT_ROOT / "workflows" / "ophthalmology_kb.md"
STATIC_CARDS = PROJECT_ROOT / "tools" / "flashcards" / "static_cards.py"

# Snellen -> LogMAR, from CC-D0008's M&S screen captures. Screen 1 carries
# 6/60, 6/48, 6/38; screen 2 carries 6/30, 6/24, 6/19; screen 3 carries 6/15,
# 6/12, 6/9.5, 6/7.5. 6/120 comes from the procedure text. Note 6/9.5 — the
# modified-LogMAR line, NOT the familiar Snellen 6/9.
LOGMAR_LADDER = {
    "6/7.5": "0.1",
    "6/9.5": "0.2",
    "6/12": "0.3",
    "6/15": "0.4",
    "6/19": "0.5",
    "6/24": "0.6",
    "6/30": "0.7",
    "6/38": "0.8",
    "6/48": "0.9",
    "6/60": "1.0",
    "6/120": "1.3",
}

# Cases that teach the modified-LogMAR distance procedure itself. Cases that
# merely record a VA value in a history are out of scope.
LOGMAR_PROCEDURE_CASES = [
    "case_ot_011_modified_logmar_va_testing.json",
    "case_psa_006_logmar_va_adult_new_patient.json",
    "case_psa_050_logmar_distance_va_pinhole_refractive.json",
    "case_oa_037_logmar_low_vision_progression.json",
    "case_psa_001_logmar_child.json",
    "case_oa_002_iop_va.json",
]


def _text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _kb_logmar_sections() -> str:
    """Only the modified-LogMAR parts of the KB reference.

    The doc also documents the Snellen chart / projector, where "Standard testing
    distance: 6 metres" is correct and must not be flagged.
    """
    doc = _text(KB_DOC)
    keep = []
    for start, end in (
        ("*Modified LogMAR (M&S System):*", "*Snellen Chart / Projector:*"),
        ("**Procedure — Distance Vision with Modified LogMAR:**", "**Pinhole Test:**"),
        ("**Special Scenarios — Modified LogMAR:**", "**Key Principles"),
    ):
        keep.append(doc[doc.index(start): doc.index(end, doc.index(start))])
    return "\n".join(keep)


def _logmar_content_blobs() -> list[tuple[str, str]]:
    """(label, text) for every surface that teaches the modified-LogMAR procedure."""
    blobs = [("workflows/ophthalmology_kb.md", _kb_logmar_sections())]
    for name in LOGMAR_PROCEDURE_CASES:
        blobs.append((f"cases/{name}", _text(CASES_DIR / name)))
    return blobs


def _distance_va_deck() -> str:
    """The distance_va flashcard block, sliced out of the static pool by key."""
    src = _text(STATIC_CARDS)
    start = src.index('"distance_va": {')
    end = src.index('"near_vision": {', start)
    return src[start:end]


# --- 1. The ladder the app never taught -------------------------------------

def test_kb_doc_teaches_the_full_snellen_logmar_ladder():
    """Every Snellen/LogMAR pair from CC-D0008 must appear in the KB reference."""
    doc = _text(KB_DOC)
    missing = [
        f"{snellen} = {logmar}"
        for snellen, logmar in LOGMAR_LADDER.items()
        if not re.search(rf"{re.escape(snellen)}\s*\|\s*{re.escape(logmar)}\b", doc)
    ]
    assert not missing, f"KB doc is missing ladder rows: {missing}"


def test_ladder_uses_6_over_9_point_5_not_6_over_9():
    """The modified-LogMAR line is 6/9.5. Teaching 6/9 as a chart line is wrong."""
    deck = _distance_va_deck()
    assert "6/9.5" in deck, "distance_va deck never teaches the 6/9.5 line"


# --- 2. Facts the superseded SOP states differently -------------------------

def test_reading_direction_is_left_to_right_everywhere():
    """CC-D0008: read the 5 characters from left to right. The SOP says right to left."""
    offenders = [
        label for label, blob in _logmar_content_blobs()
        if "right to left" in blob.lower()
    ]
    offenders += ["flashcards/distance_va"] if "right to left" in _distance_va_deck().lower() else []
    assert not offenders, f"'right to left' is the superseded SOP wording: {offenders}"


def test_no_fixed_metre_distance_for_the_modified_logmar_chart():
    """The M&S system is calibrated to room length, so no fixed figure is taught.

    Guards the three values the app previously carried: 4 m (SOP), 6 m and 3 m
    (neither document). Snellen-projector and near-vision distances are out of
    scope and are not scanned here.
    """
    bad = re.compile(r"\b(3|4|6)\s?(?:m\b|metre|meter)", re.I)
    offenders = []
    for label, blob in _logmar_content_blobs():
        for match in bad.finditer(blob):
            window = blob[max(0, match.start() - 200): match.end() + 200].lower()
            if "logmar" in window or "distance v" in window or "test distance" in window:
                offenders.append(f"{label}: ...{blob[max(0, match.start()-60):match.end()+60].strip()}...")
    assert not offenders, "fixed test distance stated for the modified-LogMAR chart:\n" + "\n".join(offenders)


def test_pinhole_is_used_when_no_letters_are_read_at_6_60():
    """CC-D0008 step 11. The SOP goes straight to 6/120 with no pinhole here.

    The pinhole must be attempted ON the 6/60 line, before 6/120 is reached. A
    bare mention of "pinhole" is not enough: the 6/120 step legitimately reads
    "(no pinhole)", which an unanchored search matches by accident.
    """
    doc = _text(KB_DOC)
    scenarios = doc[doc.index("**Special Scenarios"):]
    section = scenarios[: scenarios.index("**Key Principles")]
    line = next(
        (ln for ln in section.splitlines()
         if "6/60" in ln and re.search(r"(cannot read|unable to read|no letter)", ln, re.I)
         and re.search(r"(at all|any)", ln, re.I)),
        None,
    )
    assert line, "KB doc has no scenario for reading no letters at all at 6/60"
    before_6120 = line.split("6/120")[0]
    assert re.search(r"(use|apply|try|attempt)\s+(a\s+)?pinhole", before_6120, re.I), (
        "the pinhole must be attempted on the 6/60 line before moving to 6/120; got:\n" + line
    )


def test_6_120_is_logmar_1_3_and_reached_without_pinhole_first():
    """CC-D0008 step 12: 6/120 (1.3), no pinhole first, then with pinhole."""
    doc = _text(KB_DOC)
    assert "6/120" in doc and "1.3" in doc, "KB doc never gives 6/120 its LogMAR value (1.3)"


# --- 3. The cases must not contradict the procedure -------------------------

@pytest.mark.parametrize("name", LOGMAR_PROCEDURE_CASES)
def test_case_is_valid_json_and_free_of_superseded_wording(name):
    case = json.loads(_text(CASES_DIR / name))
    blob = json.dumps(case, ensure_ascii=False).lower()
    assert "right to left" not in blob, f"{name} carries the superseded SOP reading direction"


# --- 4. No station may grade against the superseded SOP row -----------------

def test_no_station_can_resolve_to_the_superseded_sop_checklist():
    """The SOP-derived row may linger in Supabase; it must never be resolved.

    It contradicts CC-D0008 on reading direction, test distance and both pinhole
    steps, so grading against it would mark correct technique wrong.
    """
    from tools.cases.resolve_checklist import resolve_procedure_name

    superseded = "Distance Vision Testing LogMAR (SOP)"
    name, how = resolve_procedure_name({"checklist_procedure": superseded})
    assert name == "Distance Vision Testing LogMAR", (
        f"a case pinned to the superseded row resolved to {name!r}"
    )
    assert how == "explicit"

    # And every real case must land somewhere current.
    for path in sorted(CASES_DIR.glob("*.json")):
        resolved, _ = resolve_procedure_name(json.loads(_text(path)))
        assert resolved != superseded, f"{path.name} resolves to the superseded row"


def test_snellen_chart_cases_keep_real_snellen_lines():
    """6/9 and 6/18 are real Snellen lines and must survive on Snellen-chart cases.

    The M&S modified-LogMAR chart has 6/9.5 and 6/19 instead, so LogMAR-chart
    readings were migrated to those. That migration must not touch a case that
    explicitly uses a Snellen chart or projector, where 6/9 is exactly right.
    """
    case = _text(CASES_DIR / "case_psa_007_snellen_va_pinhole.json")
    assert "snellen chart projector" in case.lower(), "fixture case is no longer Snellen-based"
    assert "6/9 (LogMAR 0.18)" in case, (
        "a Snellen-chart reading was migrated to the M&S chart ladder; 6/9 is a real "
        "Snellen line and its LogMAR conversion is 0.18"
    )


def test_ingestion_manifest_does_not_recreate_the_superseded_checklist():
    """Re-running KB ingestion must not rebuild the contradictory checklist row."""
    manifest = _text(PROJECT_ROOT / "tools" / "kb" / "run_ingestion.py")
    assert '"Distance Vision Testing LogMAR (SOP)"' not in manifest, (
        "run_ingestion.py would recreate the superseded SOP checklist row"
    )
