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

# "clinical_" covers a known truncated-category typo in the ingested DB data
# (one real step is categorised "clinical_" rather than "clinical_assessment").
_PROC_CATS = {"clinical_assessment", "medication", "clinical_"}
_PREP_CATS = {"patient_identification", "consent", "patient_education",
              "documentation", "infection_control", "equipment", "safety_check"}
_POST_CATS = {"post_procedure", "documentation", "patient_education", "infection_control"}

# Some checklists miscategorise genuine PREP steps as "clinical_assessment" — e.g.
# "Check for patient's needs (wheelchair)", "Introduce self", "Obtain requisites" — which
# would fire the phase-2 anchor far too early and drag greeting / identification / hand
# hygiene into the "Clinical Assessment" phase (sequence bug). A step whose wording is
# clearly preparation is never treated as the procedure anchor, so those steps stay in
# Phase 1 "Preparation & Identification" where they belong.
_PREP_OVERRIDE = (
    "introduce", "identify", "identity", "at least 2 identifiers", "at least two identifiers",
    "patient name", "date of birth", "medical record", "consent",
    "hand hygiene", "hand wash", "5 moments", "five moments",
    "doctor", "written order", "electronic order", "medication order",
    "explain the procedure", "explain the purpose", "purpose and procedure",
    "purpose & procedure", "explain to the patient",
    "patient's needs", "patient’s needs", "patients needs", "wheelchair",
    "received the patient", "obtain appropriate requisites", "obtain the appropriate",
    "demonstrates knowledge",
)


def _is_prep_override(action) -> bool:
    a = str(action or "").lower()
    return any(k in a for k in _PREP_OVERRIDE)


def assign_phases(steps: list[dict]) -> list[int]:
    """Return a list of phase ints (1/2/3), one per step, same order as input."""
    proc_idx = [i for i, s in enumerate(steps)
                if s.get("category") in _PROC_CATS and not _is_prep_override(s.get("action", ""))]
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
