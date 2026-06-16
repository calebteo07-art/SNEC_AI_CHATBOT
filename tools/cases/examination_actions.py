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
