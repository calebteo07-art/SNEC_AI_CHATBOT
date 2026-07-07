# tools/cases/examination_actions.py
"""Build the OSCE exam actions — every checklist step, classified manual vs verbal.

build_actions emits an entry for EVERY non-blank step (nothing dropped), tagging each
with `kind` so the frontend can show the right affordance:
  - `kind="manual"` — a recognised HANDS-ON procedure (hand hygiene, VA, IOP, slit-lamp,
    drop instillation…). Only these get a chip in the action panel; the student clicks it
    and describes/performs the technique, which reveals a finding if the step maps to an
    examination_finding.
  - `kind="verbal"` — everything else: history/"say" steps, identification, consent,
    documentation, and any UNRECOGNISED step. Verbal steps carry NO chip — the student
    does them by talking to the patient in the consult (auto-ticked by the examiner) or by
    tapping the current checklist row. "say" steps also carry a patient-directed
    `prompt_text`.
Consecutive chips that share the same (label, mode) merge, so split runs (e.g. the
"5 moments of hand hygiene" sub-rows) collapse into one chip that ticks them all.
Pure + deterministic.
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

# The action panel lists ONLY genuine hands-on procedures (ricoe C1). This is an
# ALLOW-list of the recognised manual procedures — every "do" step whose canonical
# label is in this set gets a chip; EVERYTHING ELSE is verbal and stays in the live
# consult (no chip). Talking / identification / consent / documentation steps and any
# UNRECOGNISED step therefore default to verbal — the student does them by talking to
# the patient (auto-ticked from the consult) or by tapping the current checklist row.
# A verbal step never needs a chip, so the panel never lists "every single action" and
# never shows a generically-clipped label.
_MANUAL_LABELS = {
    "Hand hygiene", "Wipe occluder", "Disinfect equipment", "Discard waste",
    "Remove glasses / CL", "Prepare eye drops", "Instill drops", "Pinhole test",
    "Test near VA", "Test distance VA", "Measure IOP", "Anterior segment",
    "Fundus exam", "Colour vision", "Amsler grid", "Position patient",
    "Align & focus", "Validate reading", "Print results", "Document results",
    "Safety check",
}

# Manual chips that are a single mechanical confirmation — no assessable technique to
# describe — tick on ONE click with no typed explanation (ricoe C5, "some actions no need
# to type explanation"). Skill procedures (VA, IOP, slit-lamp, drops instillation, hand
# hygiene's WHO moments…) are the assessment itself and stay non-quick.
_QUICK_LABELS = {
    "Wipe occluder", "Disinfect equipment", "Discard waste",
    "Print results", "Document results", "Remove glasses / CL",
}


def _clip_words(text: str, max_chars: int) -> str:
    """Trim to whole words within max_chars — never cut a word mid-character so chip
    labels never read as truncated garble (ricoe C1: "words cut off")."""
    text = text.strip()
    if len(text) <= max_chars:
        return text
    out: list[str] = []
    total = 0
    for w in text.split():
        add = (1 if out else 0) + len(w)
        if total + add > max_chars:
            break
        out.append(w)
        total += add
    return " ".join(out) if out else text[:max_chars]


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
    return _clip_words(short, 30) or "Ask"


def _do_label(action: str, category: str) -> str:
    low = action.lower()
    for keywords, label in _LABEL_RULES:
        if any(kw in low for kw in keywords):
            return label
    head = action.split(":")[0].strip()
    short = _clip_words(" ".join(head.split()[:4]).rstrip(".,;:"), 34)
    return short or (category.replace("_", " ").title() if category else "Step")


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
            chip = {"label": _say_label(prompt), "mode": "say", "reveal_text": "", "prompt_text": prompt, "kind": "verbal", "quick": False}
        else:
            label = _do_label(action, str(s.get("category", "")))
            kind = "manual" if label in _MANUAL_LABELS else "verbal"
            chip = {
                "label": label,
                "mode": "do",
                "reveal_text": _finding_for_step(action, examination_findings),
                "prompt_text": "",
                "kind": kind,
                "quick": kind == "manual" and label in _QUICK_LABELS,
            }
        chip.update({
            "step_number": n,
            "satisfies_steps": [n],
            "phase": int(phase),
            "critical": bool(s.get("critical", False)),
        })
        raw.append(chip)

    # Collapse EVERY same-(label, mode) chip into one — not just consecutive runs — so a
    # recurring procedure (hand hygiene before AND after a step in between) is a single chip,
    # never a duplicate (ricoe C1). The step-gate ticks only the in-order run from the current
    # step, so the one chip re-locks until the later occurrence is reached; first appearance
    # keeps its position.
    merged: list[dict] = []
    by_key: dict[tuple[str, str], dict] = {}
    for a in raw:
        key = (a["label"], a["mode"])
        prev = by_key.get(key)
        if prev is not None:
            prev["satisfies_steps"] = sorted(set(prev["satisfies_steps"]) | set(a["satisfies_steps"]))
            prev["critical"] = prev["critical"] or a["critical"]
            if not prev["reveal_text"] and a["reveal_text"]:
                prev["reveal_text"] = a["reveal_text"]
        else:
            by_key[key] = a
            merged.append(a)

    for a in merged:
        a["key"] = f"s{a['satisfies_steps'][0]}"
    return merged


def has_manual_actions(examination_findings: dict, steps: list[dict]) -> bool:
    """True if any resolved checklist step is a hands-on (manual) procedure.

    Reuses build_actions' manual/verbal classification, so "no action panel" and
    "no Technique bucket" stay perfectly in sync.
    """
    return any(a["kind"] == "manual" for a in build_actions(examination_findings, steps))
