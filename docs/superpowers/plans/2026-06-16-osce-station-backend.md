# OSCE Station — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for the Guided OSCE Station — a case→checklist resolver, deterministic 3-phase split, fixed patient demographics, an examination-action builder, a live "examiner" auto-tick, and two new API endpoints (`/station`, `/observe`) plus encouraging OSCE-anchored grading.

**Architecture:** New pure-Python modules under `tools/cases/` (deterministic, unit-testable with no network), wired into `tools/api/routers/cases.py`. AI calls (examiner, debrief) go through the existing `tools/shared/gemini_client.ask` with `asyncio.to_thread` + `MOCK_MODE` resilience. Demographics are backfilled into `cases/*.json` by a one-time script. The frontend redesign is a separate plan.

**Tech Stack:** Python 3, FastAPI, Pydantic, pytest (+ `pytest.mark.asyncio`), Supabase (`tools/kb/search.get_checklist_by_name`), Gemini via `tools/shared/gemini_client`.

**Spec:** `docs/superpowers/specs/2026-06-16-virtual-patient-osce-station-design.md`

---

## File Structure

- Create `tools/cases/resolve_checklist.py` — case → canonical checklist name (explicit → keyword → rubric fallback) + rubric-derived checklist builder.
- Create `tools/cases/phase_split.py` — deterministic 1/2/3 phase assignment + grouping (omits empty phases).
- Create `tools/cases/examination_actions.py` — build examination tray actions from `examination_findings` + map each to checklist steps.
- Create `tools/cases/seed_demographics.py` — one-time tool: backfill fixed NRIC/DOB/address/phone into every case file.
- Create `tools/cases/observe_steps.py` — live AI examiner: transcript → newly-satisfied step numbers (`[]` in mock).
- Modify `tools/api/routers/cases.py` — add `/station` + `/observe` endpoints and Pydantic models; add `per_phase` to submit; encouraging debrief wording.
- Modify `tools/api/shared.py` — one line in `PATIENT_SYSTEM` about demographics.
- Tests under `tests/cases/`.

---

## Task 1: Phase split module

**Files:**
- Create: `tools/cases/phase_split.py`
- Test: `tests/cases/test_phase_split.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/cases/test_phase_split.py
"""Tests for deterministic 3-phase split of checklist steps."""
from tools.cases.phase_split import assign_phases, group_by_phase, PHASE_NAMES


def _steps(*cats):
    return [{"step_number": i + 1, "category": c, "action": f"step {i+1}", "critical": False}
            for i, c in enumerate(cats)]


def test_anchor_split_three_phases():
    # prep, prep, clinical, clinical, post  -> 1,1,2,2,3
    steps = _steps("patient_identification", "patient_education",
                   "clinical_assessment", "clinical_assessment", "post_procedure")
    assert assign_phases(steps) == [1, 1, 2, 2, 3]


def test_mid_procedure_education_is_phase_two():
    # education between two clinical steps stays in the procedure span
    steps = _steps("clinical_assessment", "patient_education", "clinical_assessment")
    assert assign_phases(steps) == [2, 2, 2]


def test_no_procedure_anchor_falls_back():
    # no clinical_assessment/medication: leading prep -> 1, trailing post -> 3, rest -> 2
    steps = _steps("patient_identification", "equipment", "post_procedure")
    phases = assign_phases(steps)
    assert phases[0] == 1
    assert phases[-1] == 3


def test_every_step_assigned_exactly_once():
    steps = _steps("documentation", "patient_identification", "clinical_assessment",
                   "infection_control", "post_procedure", "documentation")
    phases = assign_phases(steps)
    assert len(phases) == len(steps)
    assert all(p in (1, 2, 3) for p in phases)


def test_group_by_phase_omits_empty_phases():
    # all clinical -> only phase 2 present
    steps = _steps("clinical_assessment", "clinical_assessment")
    groups = group_by_phase(steps)
    assert [g["phase"] for g in groups] == [2]
    assert groups[0]["name"] == PHASE_NAMES[2]
    assert len(groups[0]["steps"]) == 2


def test_group_by_phase_preserves_all_steps():
    steps = _steps("patient_identification", "clinical_assessment", "post_procedure")
    groups = group_by_phase(steps)
    total = sum(len(g["steps"]) for g in groups)
    assert total == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/cases/test_phase_split.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tools.cases.phase_split'`

- [ ] **Step 3: Write minimal implementation**

```python
# tools/cases/phase_split.py
"""Deterministic 3-phase split of an OSCE checklist.

Phases follow the real clinical arc encoded in step order + category:
  1 Preparation & Identification   2 Clinical Assessment   3 Documentation & Follow-up

Anchor on the clinical_assessment/medication span: steps before -> phase 1,
within -> phase 2, after -> phase 3. If a checklist has no such anchor, fall back
to leading-prep / trailing-post runs. Pure + deterministic — no network, no AI.
"""

PHASE_NAMES = {
    1: "Preparation & Identification",
    2: "Clinical Assessment",
    3: "Documentation & Follow-up",
}

_PROC_CATS = {"clinical_assessment", "medication", "clinical_"}
_PREP_CATS = {"patient_identification", "consent", "patient_education",
              "documentation", "infection_control", "equipment", "safety_check"}
_POST_CATS = {"post_procedure", "documentation", "patient_education", "infection_control"}


def assign_phases(steps: list[dict]) -> list[int]:
    """Return a list of phase ints (1/2/3), one per step, same order as input."""
    proc_idx = [i for i, s in enumerate(steps) if s.get("category") in _PROC_CATS]
    n = len(steps)
    if proc_idx:
        lo, hi = proc_idx[0], proc_idx[-1]
        return [1 if i < lo else (3 if i > hi else 2) for i in range(n)]

    # No procedure anchor: leading prep run -> 1, trailing post run -> 3, rest -> 2.
    lead = 0
    while lead < n and steps[lead].get("category") in _PREP_CATS:
        lead += 1
    tail = n
    while tail > lead and steps[tail - 1].get("category") in _POST_CATS:
        tail -= 1
    return [1 if i < lead else (3 if i >= tail else 2) for i in range(n)]


def group_by_phase(steps: list[dict]) -> list[dict]:
    """Group steps into ordered phase blocks, omitting any phase with no steps.

    Returns: [{"phase": int, "name": str, "steps": [step, ...]}, ...]
    """
    phases = assign_phases(steps)
    buckets: dict[int, list[dict]] = {1: [], 2: [], 3: []}
    for step, ph in zip(steps, phases):
        buckets[ph].append(step)
    return [
        {"phase": ph, "name": PHASE_NAMES[ph], "steps": buckets[ph]}
        for ph in (1, 2, 3)
        if buckets[ph]
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/cases/test_phase_split.py -v`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/cases/phase_split.py tests/cases/test_phase_split.py
git commit -m "feat(cases): deterministic 3-phase checklist split"
```

---

## Task 2: Case → checklist resolver

**Files:**
- Create: `tools/cases/resolve_checklist.py`
- Test: `tests/cases/test_resolve_checklist.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/cases/test_resolve_checklist.py
"""Tests for the case -> checklist resolver and rubric-fallback builder."""
import json
from pathlib import Path

from tools.cases.resolve_checklist import (
    resolve_procedure_name,
    build_rubric_checklist,
    match_procedure,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CASES_DIR = PROJECT_ROOT / "cases"


def test_keyword_maps_nct():
    assert match_procedure("nct_glaucoma_suspect") == "Non-Contact Tonometry"


def test_keyword_maps_biometry_and_oct():
    assert match_procedure("ascan_biometry") == "Basic Biometry"
    assert match_procedure("rnfl_oct_glaucoma_monitoring") == "Cirrus OCT"


def test_dilation_beats_eye_drop():
    # dilation rule is checked before the generic eye-drop rule
    assert match_procedure("pupil_dilation_narrow_angle") == "Eye Drop Instillation and Dilation"


def test_explicit_name_wins():
    case = {"checklist_procedure": "History Taking", "topic": "nct_anything"}
    name, how = resolve_procedure_name(case)
    assert name == "History Taking"
    assert how == "explicit"


def test_ishihara_has_no_checklist():
    case = {"topic": "ishihara_colour_vision", "title": "Colour vision", "rubric": {}}
    name, how = resolve_procedure_name(case)
    assert name is None
    assert how == "rubric_fallback"


def test_build_rubric_checklist_shape():
    case = {
        "topic": "ishihara_colour_vision",
        "rubric": {
            "history": {"key_points": ["Ask about colour difficulty", "Ask occupation"]},
            "investigations": {"key_points": ["Use Ishihara plates in good light"]},
        },
    }
    cl = build_rubric_checklist(case)
    assert cl["source"] == "rubric"
    actions = [s["action"] for s in cl["steps"]]
    assert "Ask about colour difficulty" in actions
    assert len(cl["steps"]) == 3
    assert all("category" in s and "step_number" in s for s in cl["steps"])


def test_coverage_over_all_real_cases():
    """Every real case resolves to a checklist name OR the rubric fallback.
    At least 130 map to a real checklist; the rest must all carry a usable rubric."""
    mapped, fallback = 0, 0
    for cf in CASES_DIR.glob("*.json"):
        case = json.loads(cf.read_text(encoding="utf-8"))
        name, how = resolve_procedure_name(case)
        if name:
            mapped += 1
        else:
            fallback += 1
            assert build_rubric_checklist(case)["steps"], f"{cf.name} has no rubric fallback"
    assert mapped >= 130
    assert mapped + fallback == len(list(CASES_DIR.glob("*.json")))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/cases/test_resolve_checklist.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tools.cases.resolve_checklist'`

- [ ] **Step 3: Write minimal implementation**

```python
# tools/cases/resolve_checklist.py
"""Resolve a case to the right OSCE checklist.

Order: (1) explicit case.checklist_procedure, (2) keyword map -> one of the 20
canonical Supabase checklists, (3) rubric fallback (build a checklist from the
case's embedded rubric.key_points). Pure functions — the endpoint wires the
canonical name to Supabase via get_checklist_by_name and uses build_rubric_checklist
when name is None or the lookup misses.
"""

# Ordered keyword rules — FIRST match wins, so list the more specific rules first.
KEYWORD_RULES: list[tuple[tuple[str, ...], str]] = [
    (("dilation", "mydriasis"), "Eye Drop Instillation and Dilation"),
    (("eye_drop", "eyedrop", "instillation", "drop_instillation"), "Instillation of Eye Drops"),
    (("nct", "tonometry", "non-contact", "non_contact", "iop"), "Non-Contact Tonometry"),
    (("ascan", "a_scan", "biometry"), "Basic Biometry"),
    (("oct", "cirrus", "rnfl", "macular_oct"), "Cirrus OCT"),
    (("topography", "pentacam", "keratoconus", "topo"), "Cornea Topography"),
    (("auto_refraction", "autorefraction", "kerato", "refractometry"), "Auto Kerato-Refractometry (SOP)"),
    (("near_vision", "near_va", "presbyopia"), "Near Vision Testing (SOP)"),
    (("logmar", "snellen", "e_chart", "distance_va", "distance_vision", "pinhole",
      "low_vision", "visual_acuity", "va_testing"), "Distance Vision Testing LogMAR"),
    (("hvf", "humphrey", "visual_field", "gvf", "perimetry", "confrontation"), "Humphrey Visual Field"),
    (("pfaer", "fall_risk"), "PFAER and Fall Risk Assessment"),
    (("dayward", "preop", "postop", "pre_op", "post_op", "preoperative",
      "postoperative", "day_ward"), "Dayward and OT Skills Observation"),
    (("orthoptic", "hirschberg", "krimsky", "cover_uncover", "versions", "ductions",
      "npc", "convergence", "strabismus", "esotropia", "squint"), "Orthoptics Skills Observation"),
    (("endothelial", "specular", "flare_test", "flare", "ecc"), "Ophthalmic Investigations Skills Observation"),
    (("history", "triage", "pain_assessment", "red_eye", "uveitis", "keratitis", "floaters",
      "flashes", "retinal_detachment", "conjunctivitis", "subconjunctival", "foreign_body",
      "chemical_injury", "penetrating", "hyphaema", "glaucoma_triage", "crao", "flash_burn",
      "anticoagulant", "acute_angle_closure", "vision_loss", "counselling"), "History Taking"),
]

# Categories used for rubric-derived steps, by rubric domain.
_RUBRIC_DOMAIN_CATEGORY = {
    "history": "clinical_assessment",
    "investigations": "clinical_assessment",
    "diagnosis": "clinical_assessment",
    "management": "documentation",
}


def match_procedure(text: str) -> str | None:
    """Return the canonical checklist name for a topic/title blob, or None."""
    hay = (text or "").lower()
    for keys, name in KEYWORD_RULES:
        if any(k in hay for k in keys):
            return name
    return None


def resolve_procedure_name(case: dict) -> tuple[str | None, str]:
    """Return (canonical_checklist_name_or_None, how).

    how is one of: "explicit", "keyword", "rubric_fallback".
    """
    explicit = (case.get("checklist_procedure") or "").strip()
    if explicit:
        return explicit, "explicit"
    blob = f"{case.get('topic', '')} {case.get('title', '')}"
    name = match_procedure(blob)
    if name:
        return name, "keyword"
    return None, "rubric_fallback"


def build_rubric_checklist(case: dict) -> dict:
    """Build a checklist dict from the case's embedded rubric.key_points.

    Returns {procedure_name, steps:[{step_number,category,action,critical,notes}],
    total_steps, critical_count, source:"rubric"}.
    """
    rubric = case.get("rubric") or {}
    steps: list[dict] = []
    n = 0
    for domain in ("history", "investigations", "diagnosis", "management"):
        block = rubric.get(domain) or {}
        for point in block.get("key_points", []):
            n += 1
            steps.append({
                "step_number": n,
                "category": _RUBRIC_DOMAIN_CATEGORY.get(domain, "clinical_assessment"),
                "action": str(point),
                "critical": False,
                "notes": None,
            })
    return {
        "procedure_name": case.get("topic", "Case checklist"),
        "steps": steps,
        "total_steps": len(steps),
        "critical_count": 0,
        "source": "rubric",
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/cases/test_resolve_checklist.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/cases/resolve_checklist.py tests/cases/test_resolve_checklist.py
git commit -m "feat(cases): case->checklist resolver with rubric fallback"
```

---

## Task 3: Examination actions builder

**Files:**
- Create: `tools/cases/examination_actions.py`
- Test: `tests/cases/test_examination_actions.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/cases/test_examination_actions.py
from tools.cases.examination_actions import build_actions, FINDING_LABELS


def test_builds_action_per_finding_key():
    findings = {"va": {"right": "6/7.5", "left": "6/9"}, "iop": {"right": "18 mmHg", "left": "20 mmHg"}}
    steps = [
        {"step_number": 5, "action": "Perform distance VA with LogMAR chart"},
        {"step_number": 9, "action": "Measure IOP with non-contact tonometer, 3 readings"},
        {"step_number": 1, "action": "Introduce self to patient"},
    ]
    actions = build_actions(findings, steps)
    keys = {a["key"] for a in actions}
    assert keys == {"va", "iop"}
    va = next(a for a in actions if a["key"] == "va")
    assert va["label"] == FINDING_LABELS["va"]
    assert "6/7.5" in va["reveal_text"] and "6/9" in va["reveal_text"]
    assert 5 in va["satisfies_steps"]
    iop = next(a for a in actions if a["key"] == "iop")
    assert 9 in iop["satisfies_steps"]


def test_string_finding_value():
    actions = build_actions({"anterior_segment": "Normal bilaterally"}, [])
    assert actions[0]["reveal_text"] == "Normal bilaterally"
    assert actions[0]["satisfies_steps"] == []


def test_unknown_finding_key_gets_titlecase_label():
    actions = build_actions({"vital_signs": "BP 130/80"}, [])
    assert actions[0]["label"] == FINDING_LABELS["vital_signs"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/cases/test_examination_actions.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

```python
# tools/cases/examination_actions.py
"""Build the examination tray from a case's examination_findings.

Each finding key becomes a clickable action that, when performed, reveals the
finding value and satisfies (auto-ticks) the checklist steps whose action text
mentions that examination. Pure + deterministic.
"""

FINDING_LABELS: dict[str, str] = {
    "va": "Measure distance VA",
    "va_distance": "Measure distance VA",
    "near_va": "Measure near VA",
    "va_near": "Measure near VA",
    "iop": "Measure IOP",
    "iop_nct": "Measure IOP (NCT)",
    "anterior_segment": "Anterior segment exam",
    "fundus": "Fundus exam",
    "vital_signs": "Vital signs",
    "colour_vision": "Colour vision (Ishihara)",
    "amsler": "Amsler grid",
}

# Keywords that link a finding key to checklist-step action text.
_STEP_KEYWORDS: dict[str, tuple[str, ...]] = {
    "va": ("distance va", "visual acuity", "logmar", "snellen", "distance vision"),
    "near_va": ("near va", "near vision", "n chart", "near acuity"),
    "iop": ("iop", "tonometry", "intraocular pressure", "tonometer"),
    "anterior_segment": ("anterior segment", "slit lamp", "slit-lamp", "cornea"),
    "fundus": ("fundus", "retina", "optic disc", "dilated"),
    "vital_signs": ("blood pressure", "vital", "pulse"),
    "colour_vision": ("ishihara", "colour vision", "color vision"),
    "amsler": ("amsler",),
}

_ALIASES = {"va_distance": "va", "iop_nct": "iop", "va_near": "near_va"}


def _label_for(key: str) -> str:
    if key in FINDING_LABELS:
        return FINDING_LABELS[key]
    return key.replace("_", " ").strip().capitalize()


def _reveal_text(value) -> str:
    if isinstance(value, dict):
        parts = []
        for side in ("right", "left"):
            if side in value:
                parts.append(f"{side[0].upper()}: {value[side]}")
        if parts:
            return " · ".join(parts)
        return " · ".join(f"{k}: {v}" for k, v in value.items())
    return str(value)


def build_actions(examination_findings: dict, steps: list[dict]) -> list[dict]:
    """Return [{key,label,reveal_text,satisfies_steps:[int]}] for each finding."""
    actions: list[dict] = []
    for key, value in (examination_findings or {}).items():
        canon = _ALIASES.get(key, key)
        keywords = _STEP_KEYWORDS.get(canon, (canon.replace("_", " "),))
        satisfies = [
            int(s.get("step_number", 0))
            for s in steps
            if any(kw in str(s.get("action", "")).lower() for kw in keywords)
        ]
        actions.append({
            "key": key,
            "label": _label_for(key),
            "reveal_text": _reveal_text(value),
            "satisfies_steps": satisfies,
        })
    return actions
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/cases/test_examination_actions.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/cases/examination_actions.py tests/cases/test_examination_actions.py
git commit -m "feat(cases): examination tray actions from examination_findings"
```

---

## Task 4: Demographics seeding tool

**Files:**
- Create: `tools/cases/seed_demographics.py`
- Test: `tests/cases/test_seed_demographics.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/cases/test_seed_demographics.py
import copy
from datetime import date

from tools.cases.seed_demographics import seed_case, nric_check_letter

REF = date(2026, 6, 16)


def _case():
    return {"case_id": "case_demo_001", "patient": {"name": "Mr Tan", "age": 55}}


def test_adds_demographics_fields():
    c = _case()
    changed = seed_case(c, ref_date=REF)
    assert changed is True
    p = c["patient"]
    assert set(("nric", "date_of_birth", "address", "contact_number")) <= set(p)


def test_nric_format_and_checksum_valid():
    c = _case()
    seed_case(c, ref_date=REF)
    nric = c["patient"]["nric"]
    assert len(nric) == 9
    assert nric[0] in ("S", "T")
    assert nric[1:8].isdigit()
    assert nric[8] == nric_check_letter(nric[0], nric[1:8])


def test_dob_yields_stated_age():
    c = _case()
    seed_case(c, ref_date=REF)
    dob = date.fromisoformat(c["patient"]["date_of_birth"])
    age = REF.year - dob.year - ((REF.month, REF.day) < (dob.month, dob.day))
    assert age == 55


def test_deterministic_and_idempotent():
    a, b = _case(), _case()
    seed_case(a, ref_date=REF)
    seed_case(b, ref_date=REF)
    assert a["patient"]["nric"] == b["patient"]["nric"]
    assert a["patient"]["address"] == b["patient"]["address"]
    # second run on an already-seeded case makes no change
    again = copy.deepcopy(a)
    assert seed_case(again, ref_date=REF) is False
    assert again == a


def test_phone_is_8_digit_mobile():
    c = _case()
    seed_case(c, ref_date=REF)
    phone = c["patient"]["contact_number"]
    assert len(phone) == 8 and phone[0] in ("8", "9") and phone.isdigit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/cases/test_seed_demographics.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

```python
# tools/cases/seed_demographics.py
"""One-time tool: backfill fixed, internally-consistent Singapore demographics
into every case file so the identity-verification (QnA) step works.

Values are seeded by case_id, so the tool is idempotent (only adds when missing)
and stable across runs. Run:  python tools/cases/seed_demographics.py
"""

import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CASES_DIR = PROJECT_ROOT / "cases"

# Singapore NRIC checksum: weighted sum -> remainder -> letter table.
_NRIC_WEIGHTS = [2, 7, 6, 5, 4, 3, 2]
_ST_LETTERS = ["J", "Z", "I", "H", "G", "F", "E", "D", "C", "B", "A"]

_STREETS = [
    "Ang Mo Kio Ave 3", "Bedok North Rd", "Clementi Ave 2", "Tampines St 21",
    "Toa Payoh Lor 4", "Jurong West St 42", "Hougang Ave 8", "Yishun Ring Rd",
    "Bukit Batok St 25", "Serangoon Central", "Pasir Ris Dr 1", "Woodlands Ave 6",
]


def nric_check_letter(prefix: str, digits: str) -> str:
    """Return the NRIC check letter for an S/T-prefixed 7-digit body."""
    total = sum(int(d) * w for d, w in zip(digits, _NRIC_WEIGHTS))
    if prefix in ("T", "G"):
        total += 4
    return _ST_LETTERS[total % 11]


def generate_nric(rng: random.Random, birth_year: int) -> str:
    prefix = "S" if birth_year < 2000 else "T"
    digits = "".join(str(rng.randint(0, 9)) for _ in range(7))
    return f"{prefix}{digits}{nric_check_letter(prefix, digits)}"


def generate_dob(rng: random.Random, age: int, ref_date: date) -> str:
    """Pick a DOB that yields `age` as of ref_date (birthday already passed)."""
    birth_year = ref_date.year - age
    # Constrain so the birthday is on/before ref_date's month/day this year.
    month = rng.randint(1, ref_date.month)
    max_day = ref_date.day if month == ref_date.month else 28
    day = rng.randint(1, max(1, max_day))
    return date(birth_year, month, day).isoformat()


def generate_address(rng: random.Random) -> str:
    blk = rng.randint(1, 799)
    street = rng.choice(_STREETS)
    unit = f"#{rng.randint(2, 18):02d}-{rng.randint(1, 999):03d}"
    postal = f"{rng.randint(100000, 829999)}"
    return f"Blk {blk} {street}, {unit}, Singapore {postal}"


def generate_phone(rng: random.Random) -> str:
    return rng.choice("89") + "".join(str(rng.randint(0, 9)) for _ in range(7))


def seed_case(case: dict, ref_date: date | None = None) -> bool:
    """Add demographics to case['patient'] if missing. Returns True if changed."""
    ref_date = ref_date or date.today()
    patient = case.get("patient") or {}
    if patient.get("nric"):
        return False
    rng = random.Random(case.get("case_id", "seed"))
    age = int(patient.get("age", 50))
    patient["nric"] = generate_nric(rng, ref_date.year - age)
    patient["date_of_birth"] = generate_dob(rng, age, ref_date)
    patient["address"] = generate_address(rng)
    patient["contact_number"] = generate_phone(rng)
    case["patient"] = patient
    return True


def main() -> int:
    changed = 0
    ref = date(2026, 6, 16)
    for cf in sorted(CASES_DIR.glob("*.json")):
        case = json.loads(cf.read_text(encoding="utf-8"))
        if seed_case(case, ref_date=ref):
            cf.write_text(json.dumps(case, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            changed += 1
    print(f"Seeded demographics into {changed} case files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/cases/test_seed_demographics.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/cases/seed_demographics.py tests/cases/test_seed_demographics.py
git commit -m "feat(cases): demographics seeding tool (NRIC/DOB/address/phone)"
```

---

## Task 5: Run the demographics backfill

**Files:**
- Modify: `cases/*.json` (data backfill — generated by the Task 4 tool)

- [ ] **Step 1: Run the seeding tool**

Run: `python tools/cases/seed_demographics.py`
Expected: `Seeded demographics into <N> case files.` (N ≈ 151)

- [ ] **Step 2: Verify a sample case got valid demographics**

Run: `python -c "import json,glob; p=json.load(open(sorted(glob.glob('cases/*.json'))[0]))['patient']; print(p['nric'], p['date_of_birth'], p['address'])"`
Expected: a line like `S1234567A 1971-03-08 Blk 412 Bedok North Rd, #05-123, Singapore 460412`

- [ ] **Step 3: Re-run to confirm idempotency**

Run: `python tools/cases/seed_demographics.py`
Expected: `Seeded demographics into 0 case files.`

- [ ] **Step 4: Commit the backfilled case files**

```bash
git add cases/
git commit -m "data(cases): backfill fixed patient demographics into all cases"
```

---

## Task 6: Live AI examiner (auto-tick)

**Files:**
- Create: `tools/cases/observe_steps.py`
- Test: `tests/cases/test_observe_steps.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/cases/test_observe_steps.py
from unittest.mock import patch

from tools.cases import observe_steps


def _steps():
    return [
        {"step_number": 1, "action": "Identify patient — name + NRIC", "critical": True},
        {"step_number": 2, "action": "Ask about eye-drop compliance", "critical": False},
        {"step_number": 3, "action": "Explain purpose and procedure", "critical": False},
    ]


def test_mock_mode_returns_empty(monkeypatch):
    monkeypatch.setattr(observe_steps, "MOCK_MODE", True)
    out = observe_steps.observe(_steps(), [{"role": "user", "content": "hi"}], already_ticked=[])
    assert out == []


def test_parses_and_filters_to_unticked_valid_steps(monkeypatch):
    monkeypatch.setattr(observe_steps, "MOCK_MODE", False)
    # model claims steps 2, 3 and a bogus 99; step 3 already ticked -> only 2 returned
    with patch.object(observe_steps, "ask", return_value="[2, 3, 99]"):
        out = observe_steps.observe(_steps(), [{"role": "user", "content": "are you using your drops?"}],
                                    already_ticked=[3])
    assert out == [2]


def test_bad_json_returns_empty(monkeypatch):
    monkeypatch.setattr(observe_steps, "MOCK_MODE", False)
    with patch.object(observe_steps, "ask", return_value="not json"):
        out = observe_steps.observe(_steps(), [{"role": "user", "content": "hello"}], already_ticked=[])
    assert out == []


def test_quota_error_returns_empty(monkeypatch):
    monkeypatch.setattr(observe_steps, "MOCK_MODE", False)
    with patch.object(observe_steps, "ask", side_effect=RuntimeError("quota_exceeded")):
        out = observe_steps.observe(_steps(), [{"role": "user", "content": "hello"}], already_ticked=[])
    assert out == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/cases/test_observe_steps.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

```python
# tools/cases/observe_steps.py
"""Live OSCE examiner: read the consult transcript and return which checklist
steps the student has now satisfied. One cheap Gemini call; resilient — returns
[] in mock mode, on bad JSON, or on any error (manual ticking is the fallback).
"""

import json

from tools.shared.gemini_client import ask, MOCK_MODE, MODEL

_EXAMINER_SYSTEM = (
    "You are an OSCE examiner observing an ophthalmic student's consultation. "
    "Given the remaining checklist steps and the recent transcript, decide which "
    "steps the student has clearly performed or covered. Be strict — only count a "
    "step if the transcript shows it was actually done or asked. "
    "Return ONLY a JSON array of the satisfied step numbers, e.g. [2,5]."
)

_RECENT_TURNS = 10  # cap transcript window to keep the call cheap


def _schema() -> dict:
    return {"type": "array", "items": {"type": "integer"}}


def observe(checklist_steps: list[dict], messages: list[dict], already_ticked: list[int]) -> list[int]:
    """Return newly-satisfied step numbers (excluding already-ticked)."""
    if MOCK_MODE:
        return []

    ticked = set(already_ticked or [])
    remaining = [s for s in checklist_steps if int(s.get("step_number", 0)) not in ticked]
    if not remaining:
        return []

    steps_block = "\n".join(
        f"{int(s.get('step_number', 0))}. {s.get('action', '')}" for s in remaining
    )
    recent = messages[-_RECENT_TURNS:]
    convo = "\n".join(
        f"{'Student' if m.get('role') == 'user' else 'Patient'}: {m.get('content', '')}"
        for m in recent
    )
    prompt = (
        f"## Remaining checklist steps\n{steps_block}\n\n"
        f"## Recent transcript\n{convo}\n\n"
        f"Which step numbers has the student now satisfied? JSON array only."
    )

    try:
        raw = ask(
            system_prompt=_EXAMINER_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=256,
            feature="case_observe",
            model=MODEL,
            thinking_level="LOW",
            response_json_schema=_schema(),
        )
    except Exception:
        return []

    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []

    valid = {int(s.get("step_number", 0)) for s in remaining}
    out: list[int] = []
    for n in parsed:
        try:
            ni = int(n)
        except (ValueError, TypeError):
            continue
        if ni in valid and ni not in out:
            out.append(ni)
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/cases/test_observe_steps.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/cases/observe_steps.py tests/cases/test_observe_steps.py
git commit -m "feat(cases): live OSCE examiner for checklist auto-tick"
```

---

## Task 7: `/station` and `/observe` endpoints

**Files:**
- Modify: `tools/api/routers/cases.py` (add models near the other Pydantic models ~line 110; add endpoints after `get_case_checklist` ~line 362)
- Test: `tests/cases/test_station_endpoints.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/cases/test_station_endpoints.py
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

CASE = {
    "case_id": "case_test_station",
    "title": "Test NCT",
    "difficulty": "beginner",
    "topic": "nct_glaucoma_suspect",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "review"},
    "examination_findings": {"iop": {"right": "18 mmHg", "left": "20 mmHg"}},
    "rubric": {"history": {"key_points": ["Ask compliance"]}},
}

CHECKLIST = {
    "procedure_name": "Non-Contact Tonometry",
    "steps": {"steps": [
        {"step_number": 1, "category": "patient_identification", "action": "Identify patient name NRIC", "critical": True, "notes": None},
        {"step_number": 2, "category": "clinical_assessment", "action": "Measure IOP with tonometer", "critical": True, "notes": None},
        {"step_number": 3, "category": "post_procedure", "action": "Record readings in EMR", "critical": False, "notes": None},
    ]},
}


def _cookie():
    return {"eyebot_token": create_access_token("stu_test", "student", "OA")}


def test_station_returns_phases_and_actions():
    with patch.dict("tools.api.shared._case_cache", {"case_test_station": CASE}, clear=False), \
         patch("tools.api.routers.cases.get_checklist_by_name", return_value=CHECKLIST):
        r = client.get("/api/cases/case_test_station/station", cookies=_cookie())
    assert r.status_code == 200
    data = r.json()
    phase_names = [p["name"] for p in data["checklist"]["phases"]]
    assert "Preparation & Identification" in phase_names
    assert "Clinical Assessment" in phase_names
    # examination action for IOP maps to step 2
    iop = next(a for a in data["examination_actions"] if a["key"] == "iop")
    assert 2 in iop["satisfies_steps"]
    assert "18 mmHg" in iop["reveal_text"]


def test_station_rubric_fallback_when_no_checklist():
    case = {**CASE, "topic": "ishihara_colour_vision", "checklist_procedure": ""}
    with patch.dict("tools.api.shared._case_cache", {"case_ishi": case}, clear=False), \
         patch("tools.api.routers.cases.get_checklist_by_name", return_value=None):
        r = client.get("/api/cases/case_ishi/station", cookies=_cookie())
    assert r.status_code == 200
    assert r.json()["checklist"]["source"] == "rubric"


def test_observe_returns_newly_satisfied():
    with patch.dict("tools.api.shared._case_cache", {"case_test_station": CASE}, clear=False), \
         patch("tools.api.routers.cases.get_checklist_by_name", return_value=CHECKLIST), \
         patch("tools.api.routers.cases.observe", return_value=[1]):
        r = client.post(
            "/api/cases/case_test_station/observe",
            json={"messages": [{"role": "user", "content": "name and NRIC please"}], "already_ticked": []},
            cookies=_cookie(),
        )
    assert r.status_code == 200
    assert r.json()["newly_satisfied"] == [1]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/cases/test_station_endpoints.py -v`
Expected: FAIL (404 — endpoints not defined yet)

- [ ] **Step 3a: Add imports + Pydantic models to `tools/api/routers/cases.py`**

Add to the imports block (top of file, after the existing `from tools.cases...` lines):

```python
from tools.cases.resolve_checklist import resolve_procedure_name, build_rubric_checklist
from tools.cases.phase_split import group_by_phase
from tools.cases.examination_actions import build_actions
from tools.cases.observe_steps import observe
from tools.kb.search import get_checklist_by_name
```

> Note: `get_checklist_by_name` must be imported at module level (not inside the helper) so the test's `patch("tools.api.routers.cases.get_checklist_by_name", ...)` intercepts it.

Add these models after `ChecklistResponse` (around line 121):

```python
class PhaseGroup(BaseModel):
    phase: int
    name: str
    steps: list[ChecklistStepModel]

class ExaminationAction(BaseModel):
    key: str
    label: str
    reveal_text: str
    satisfies_steps: list[int]

class StationChecklist(BaseModel):
    procedure_name: str
    phases: list[PhaseGroup]
    total_steps: int
    critical_count: int
    source: str

class StationResponse(BaseModel):
    case: CaseInfo
    checklist: StationChecklist
    examination_actions: list[ExaminationAction]

class ObserveRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=100)
    already_ticked: list[int] = []

class ObserveResponse(BaseModel):
    newly_satisfied: list[int]
```

- [ ] **Step 3b: Add a helper + the two endpoints after `get_case_checklist` (~line 362)**

```python
def _load_case_or_404(case_id: str) -> dict:
    case = _case_cache.get(case_id)
    if case is None:
        try:
            case = load_case(case_id)
            _case_cache[case["case_id"]] = case
        except (ValueError, FileNotFoundError):
            raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    return case


def _station_checklist(case: dict) -> dict:
    """Resolve the case's checklist (real or rubric fallback) as a flat dict with steps."""
    name, _how = resolve_procedure_name(case)
    if name:
        cl = get_checklist_by_name(name)
        if cl:
            raw = cl.get("steps") or {}
            steps = raw.get("steps", []) if isinstance(raw, dict) else []
            return {
                "procedure_name": cl.get("procedure_name", name),
                "steps": steps,
                "source": "checklist",
            }
    return build_rubric_checklist(case)


@router.get("/api/cases/{case_id}/station", response_model=StationResponse)
def get_case_station(case_id: str):
    """Everything the OSCE station UI needs: case, phased checklist, exam actions."""
    case = _load_case_or_404(case_id)
    cl = _station_checklist(case)
    steps = cl["steps"]

    parsed_steps = [
        ChecklistStepModel(
            step_number=int(s.get("step_number", 0)),
            action=str(s.get("action", "")),
            critical=bool(s.get("critical", False)),
            category=str(s.get("category", "")),
            notes=s.get("notes"),
        )
        for s in steps
    ]
    by_step = {p.step_number: p for p in parsed_steps}
    groups = [
        PhaseGroup(
            phase=g["phase"],
            name=g["name"],
            steps=[by_step[int(s.get("step_number", 0))] for s in g["steps"]
                   if int(s.get("step_number", 0)) in by_step],
        )
        for g in group_by_phase(steps)
    ]
    critical_count = sum(1 for p in parsed_steps if p.critical)
    actions = [ExaminationAction(**a) for a in build_actions(case.get("examination_findings", {}), steps)]

    return StationResponse(
        case=CaseInfo(
            case_id=case["case_id"],
            title=case["title"],
            difficulty=case.get("difficulty", "beginner"),
            topic=case.get("topic", ""),
            estimated_minutes=case.get("estimated_minutes", 15),
            patient=CasePatientInfo(
                name=case["patient"]["name"],
                age=int(case["patient"].get("age", 30)),
                presenting_complaint=case["patient"].get("presenting_complaint", ""),
            ),
        ),
        checklist=StationChecklist(
            procedure_name=cl["procedure_name"],
            phases=groups,
            total_steps=len(parsed_steps),
            critical_count=critical_count,
            source=cl["source"],
        ),
        examination_actions=actions,
    )


@router.post("/api/cases/{case_id}/observe", response_model=ObserveResponse)
@limiter.limit("40/minute")
async def observe_case(case_id: str, request: Request, body: ObserveRequest,
                       current_user: CurrentUser = Depends(get_current_user)):
    """Live examiner: return checklist steps the transcript now satisfies."""
    case = _load_case_or_404(case_id)
    cl = _station_checklist(case)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    newly = await asyncio.to_thread(observe, cl["steps"], messages, body.already_ticked)
    return ObserveResponse(newly_satisfied=newly)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/cases/test_station_endpoints.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/cases.py tests/cases/test_station_endpoints.py
git commit -m "feat(api): /station and /observe endpoints for OSCE station"
```

---

## Task 8: Per-phase summary + encouraging debrief

**Files:**
- Modify: `tools/api/routers/cases.py` (`CaseSubmitResponse` model ~line 103; debrief prompt ~line 486; build `per_phase` before the return ~line 585)
- Test: `tests/cases/test_submit_per_phase.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/cases/test_submit_per_phase.py
from tools.api.routers.cases import _per_phase_summary


def test_per_phase_summary_counts_done_vs_total():
    steps = [
        {"step_number": 1, "category": "patient_identification", "action": "ID patient"},
        {"step_number": 2, "category": "clinical_assessment", "action": "Measure IOP"},
        {"step_number": 3, "category": "clinical_assessment", "action": "Take 3 readings"},
        {"step_number": 4, "category": "post_procedure", "action": "Record in EMR"},
    ]
    out = _per_phase_summary(steps, performed=[1, 2])
    by_name = {p["name"]: p for p in out}
    assert by_name["Preparation & Identification"]["done"] == 1
    assert by_name["Preparation & Identification"]["total"] == 1
    assert by_name["Clinical Assessment"]["done"] == 1
    assert by_name["Clinical Assessment"]["total"] == 2
    assert by_name["Documentation & Follow-up"]["done"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/cases/test_submit_per_phase.py -v`
Expected: FAIL with `ImportError: cannot import name '_per_phase_summary'`

- [ ] **Step 3a: Add the helper + response field**

Add `_per_phase_summary` near `_station_checklist` in `tools/api/routers/cases.py`:

```python
def _per_phase_summary(steps: list[dict], performed: list[int]) -> list[dict]:
    """Return [{phase,name,done,total}] using the same phase grouping as the station."""
    done = set(performed or [])
    out = []
    for g in group_by_phase(steps):
        nums = [int(s.get("step_number", 0)) for s in g["steps"]]
        out.append({
            "phase": g["phase"],
            "name": g["name"],
            "done": sum(1 for n in nums if n in done),
            "total": len(nums),
        })
    return out
```

Add a model after `ChecklistStepResult` (~line 96) and a field to `CaseSubmitResponse`:

```python
class PhaseSummary(BaseModel):
    phase: int
    name: str
    done: int
    total: int
```

In `CaseSubmitResponse` add:

```python
    per_phase: list[PhaseSummary] = []
```

- [ ] **Step 3b: Populate `per_phase` and tune the debrief wording**

In `case_submit`, where `checklist_comparison` is built it already fetches the checklist steps via `get_checklist_by_name`. Replace that resolution with the shared `_station_checklist(case)` so rubric-fallback cases also get a comparison, and compute `per_phase`. Just before the `return CaseSubmitResponse(...)`, add:

```python
    _cl_for_phase = _station_checklist(case)
    per_phase = _per_phase_summary(_cl_for_phase["steps"], body.performed_steps)
```

And add `per_phase=[PhaseSummary(**p) for p in per_phase]` to the `CaseSubmitResponse(...)` call.

Change the debrief prompt's format block (the `"Write a structured debrief..."` string ~line 488) to lead with encouragement:

```python
            "Write a warm, encouraging, specific debrief in exactly this format:\n\n"
            "**What you did really well:** ...\n\n"
            "**Where to grow next time:** ...\n\n"
            "**Why it matters clinically:** ...\n\n"
            "**Focus for next time:** ...\n\n"
            "Be specific and kind. Name concrete strengths first. When pointing out gaps, "
            "tie them to the checklist step and the phase it belongs to, and end on an "
            "encouraging note. Reference the student's role-specific procedures where relevant. "
            "Do not repeat the scores — focus on insight."
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/cases/test_submit_per_phase.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/cases.py tests/cases/test_submit_per_phase.py
git commit -m "feat(cases): per-phase summary + encouraging OSCE-anchored debrief"
```

---

## Task 9: Patient demographics in the prompt

**Files:**
- Modify: `tools/api/shared.py` (`PATIENT_SYSTEM`, ~line 14-25)

- [ ] **Step 1: Update `PATIENT_SYSTEM`**

Add this rule to the `IMPORTANT RULES` list in `PATIENT_SYSTEM` (after the "Stay in character" line):

```
- If the student asks to verify your identity, give your name, NRIC, date of birth,
  address or contact number EXACTLY as recorded in the case details below. Do not
  invent identity details and do not volunteer them unless asked.
```

- [ ] **Step 2: Sanity-check the prompt still formats**

Run: `python -c "from tools.api.shared import PATIENT_SYSTEM; print(PATIENT_SYSTEM.format(case_json='{}')[:120])"`
Expected: prints the opening of the prompt with no `KeyError`.

- [ ] **Step 3: Commit**

```bash
git add tools/api/shared.py
git commit -m "feat(cases): patient gives recorded demographics on identity check"
```

---

## Task 10: Full backend test sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the whole cases test suite**

Run: `python -m pytest tests/cases/ -v`
Expected: PASS — all tests across Tasks 1-8 green.

- [ ] **Step 2: Run the existing suite to confirm no regressions**

Run: `python -m pytest tests/ -q`
Expected: PASS (existing tests still green; `aurora_assert` smoke test untouched — `/checklist` preserved).

- [ ] **Step 3: Commit (only if any test fixups were needed)**

```bash
git add -A
git commit -m "test(cases): backend OSCE station suite green"
```

---

## Self-Review notes

- **Spec coverage:** resolver (Task 2 + §4), phase split (Task 1 + §5), demographics (Tasks 4-5 + §9), examination tray/reveal data (Task 3 + §6), live auto-tick (Task 6 + §7), `/station`+`/observe` (Task 7 + §10), encouraging+per-phase grading (Task 8 + §8), patient prompt (Task 9 + §9). Frontend (§11) and visual redesign are the separate frontend plan.
- **Single-worker safety:** `/observe` and grading use `asyncio.to_thread`; examiner is `thinking_level="LOW"`, 256 tokens, and returns `[]` on any error/quota/mock.
- **Backward compat:** `/checklist` endpoint and `performed_steps` contract are unchanged, so the `aurora_assert` smoke test and the current frontend keep working until the frontend plan lands.
- **Type consistency:** `resolve_procedure_name` → `(name, how)`; `group_by_phase` → `[{phase,name,steps}]`; `build_actions` → `[{key,label,reveal_text,satisfies_steps}]`; `observe(steps, messages, already_ticked)` — all used consistently in Task 7.
