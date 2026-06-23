# tools/cases/examination_actions.py
"""Build the OSCE action palette — one clickable chip for EVERY checklist step.

Each step becomes an action the student can click above the composer:
  - "do" steps (hand hygiene, identify patient, measure VA…) tick + post a
    performed note, and reveal a finding if the step maps to an examination_finding.
  - "say" steps (history questions) carry a patient-directed `prompt_text` the UI
    sends so the patient actually responds.
Consecutive chips that share the same (label, mode) merge, so split runs (e.g. the
"5 moments of hand hygiene" sub-rows) collapse into one chip that ticks them all.
Every non-blank step is covered — nothing is dropped. Pure + deterministic.
"""

FINDING_LABELS: dict[str, str] = {
    "va": "Test distance VA", "va_distance": "Test distance VA",
    "near_va": "Test near VA", "va_near": "Test near VA",
    "iop": "Measure IOP", "iop_nct": "Measure IOP",
    "anterior_segment": "Anterior segment", "fundus": "Fundus exam",
    "vital_signs": "Vital signs", "colour_vision": "Colour vision", "amsler": "Amsler grid",
}

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

# Canonical short chip labels for "do" steps (first keyword match wins).
_LABEL_RULES: list[tuple[tuple[str, ...], str]] = [
    (("hand hygiene", "hand wash", "5 moments", "five moments", "moments of hand",
      "before touching", "after touching", "before clean procedure", "after body fluid",
      "patient surroundings"), "Hand hygiene"),
    (("wipe occluder", "occluder with alcohol"), "Wipe occluder"),
    (("disinfect", "wipe the essential parts", "disinfection of equipment"), "Disinfect equipment"),
    (("discard", "waste bag"), "Discard waste"),
    (("not allergic", "allerg"), "Check allergy"),
    (("doctor’s order", "doctor's order", "written order", "electronic order", "medication order", "doctor"), "Check doctor's order"),
    (("at least 2 identifiers", "identity against", "identify the correct patient", "identify patient"), "Identify patient"),
    (("patient name",), "Confirm name"),
    (("identification number", "date of birth", "address"), "Confirm NRIC / DOB"),
    (("introduce",), "Introduce self"),
    (("explain the procedure", "explain the purpose", "purpose and procedure", "purpose & procedure", "explain to the patient"), "Explain procedure"),
    (("consent",), "Take consent"),
    (("remove glasses", "contact lenses if worn"), "Remove glasses / CL"),
    (("prepare the appropriate eye drops", "prepare the eye drop"), "Prepare eye drops"),
    (("instil", "pull the lower lid"), "Instill drops"),
    (("pinhole",), "Pinhole test"),
    (("near vision", "near va"), "Test near VA"),
    (("distance vision", "distance va", "visual acuity", "logmar", "snellen"), "Test distance VA"),
    (("iop", "tonometry", "intraocular pressure"), "Measure IOP"),
    (("anterior segment", "slit lamp", "slit-lamp"), "Anterior segment"),
    (("fundus", "optic disc"), "Fundus exam"),
    (("ishihara", "colour vision", "color vision"), "Colour vision"),
    (("amsler",), "Amsler grid"),
    (("position", "chin and forehead", "chin rest"), "Position patient"),
    (("align", "focus the target", "acquisition"), "Align & focus"),
    (("validate the measurement", "validate the reading"), "Validate reading"),
    (("print",), "Print results"),
    (("record the date", "document the reading", "captured into", "record the"), "Document results"),
    (("monitor patient", "fixation loss"), "Monitor patient"),
    (("correct eye", "coloured sticker", "fall risk"), "Safety check"),
    (("ensure patient is comfortable", "patient is comfortable"), "Patient comfortable"),
    (("doctor to examine",), "Doctor to examine"),
    (("look upwards", "do not blink", "gaze at", "open both eyes", "look at the"), "Instruct patient"),
    (("listens attentively", "opening statement"), "Listen actively"),
]

_ASK_PREFIXES = ("ask", "asks", "enquire", "enquires")


def _reveal_text(value) -> str:
    if isinstance(value, dict):
        parts = [f"{s[0].upper()}: {value[s]}" for s in ("right", "left") if s in value]
        if parts:
            return " · ".join(parts)
        return " · ".join(f"{k}: {v}" for k, v in value.items())
    return str(value)


def _is_say(action: str) -> bool:
    a = action.strip().lower()
    return a.startswith(_ASK_PREFIXES) or "?" in a


def _say_prompt(action: str) -> str:
    if ":" in action:
        tail = action.rsplit(":", 1)[1].strip()
        if tail:
            return tail
    return action.strip()


def _say_label(prompt: str) -> str:
    p = prompt.strip().rstrip("?").strip()
    short = " ".join(p.split()[:5])
    return short[:30] or "Ask"


def _do_label(action: str, category: str) -> str:
    low = action.lower()
    for keywords, label in _LABEL_RULES:
        if any(kw in low for kw in keywords):
            return label
    head = action.split(":")[0].strip()
    short = " ".join(head.split()[:4]).rstrip(".,;:")
    return short[:34] or (category.replace("_", " ").title() if category else "Step")


def _finding_for_step(action: str, findings: dict) -> str:
    low = str(action).lower()
    for key, value in (findings or {}).items():
        canon = _ALIASES.get(key, key)
        keywords = _STEP_KEYWORDS.get(canon, (canon.replace("_", " "),))
        if any(kw in low for kw in keywords):
            return _reveal_text(value)
    return ""


def build_actions(examination_findings: dict, steps: list[dict]) -> list[dict]:
    """One chip per non-blank step; consecutive same-(label,mode) chips merge."""
    from tools.cases.phase_split import assign_phases

    phases = assign_phases(steps)
    raw: list[dict] = []
    for s, phase in zip(steps, phases):
        action = str(s.get("action", "")).strip()
        if not action:
            continue
        n = int(s.get("step_number", 0))
        if _is_say(action):
            prompt = _say_prompt(action)
            chip = {"label": _say_label(prompt), "mode": "say", "reveal_text": "", "prompt_text": prompt}
        else:
            chip = {
                "label": _do_label(action, str(s.get("category", ""))),
                "mode": "do",
                "reveal_text": _finding_for_step(action, examination_findings),
                "prompt_text": "",
            }
        chip.update({
            "step_number": n,
            "satisfies_steps": [n],
            "phase": int(phase),
            "critical": bool(s.get("critical", False)),
        })
        raw.append(chip)

    merged: list[dict] = []
    for a in raw:
        prev = merged[-1] if merged else None
        if prev and prev["label"] == a["label"] and prev["mode"] == a["mode"]:
            prev["satisfies_steps"] = sorted(set(prev["satisfies_steps"]) | set(a["satisfies_steps"]))
            prev["critical"] = prev["critical"] or a["critical"]
            if not prev["reveal_text"] and a["reveal_text"]:
                prev["reveal_text"] = a["reveal_text"]
        else:
            merged.append(a)

    for a in merged:
        a["key"] = f"s{a['satisfies_steps'][0]}"
    return merged
