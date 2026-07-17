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
#
# ORDER IS LOAD-BEARING. A step names the procedure it documents ("Record the date /
# time / DISTANCE VISION readings onto EMR"), so the documentation rules MUST sit above
# the procedure rules — otherwise that step labels as "Test distance VA", collides with
# the real VA step, and merge_by_label silently swallows it. Same reason "Check doctor's
# order to perform NON-CONTACT TONOMETRY" must outrank the IOP rule. Keep specific
# rules above general ones; the completeness test
# (tests/cases/test_action_panel_completeness.py) pins the resulting labels.
_LABEL_RULES: list[tuple[tuple[str, ...], str]] = [
    # ── Infection control / housekeeping (most specific — an "otherwise X" step whose
    #    primary action is hand hygiene is a hand-hygiene step).
    (("hand hygiene", "hand wash", "hand rub", "5 moments", "five moments", "moments of hand",
      "before touching", "after touching", "before clean procedure", "after body fluid",
      "patient surroundings"), "Hand hygiene"),
    (("wipe occluder", "wipe the occluder", "occluder with alcohol", "occluder with an alcohol"), "Wipe occluder"),
    (("disinfect", "wipe the essential parts", "wipe the parts", "parts of the machine",
      "disinfection of equipment"), "Disinfect equipment"),
    # NOT a bare "discard": the drop-preparation step lists "Date of discard" among the
    # label checks, and a bare match hijacked that CRITICAL medication check into
    # "Discard waste" — which deleted "Prepare eye drops" from both drop checklists.
    (("discard all waste", "discard sharps", "waste bag", "dispose of"), "Discard waste"),
    (("care and maintenance", "care & maintenance", "maintenance of the"), "Care & maintenance"),

    # ── Chart / order checks. "Doctor to examine" first: it merely MENTIONS a doctor and
    #    must not be mistaken for checking an order.
    (("doctor to examine",), "Doctor to examine"),
    (("not allergic", "allerg"), "Check allergy"),
    (("doctor’s order", "doctor's order", "written order", "electronic order",
      "medication order", "ordered by the doctor", "order to perform"), "Check doctor's order"),

    # ── Documentation. ABOVE the procedure rules — see the ORDER note above. The
    #    record/document VERB forms are matched by prefix in match_label, not here.
    (("print",), "Print results"),
    (("captured into", "activity is recorded"), "Document results"),

    # ── Identification / conversation (verbal — no chip, but must classify explicitly).
    (("at least 2 identifiers", "2 identifiers", "identity against", "identify the correct patient",
      "identify patient"), "Identify patient"),
    (("patient name",), "Confirm name"),
    (("identification number", "date of birth", "address"), "Confirm NRIC / DOB"),
    (("introduce",), "Introduce self"),
    (("explain the procedure", "explain the purpose", "purpose and procedure",
      "purpose & procedure", "explain to the patient", "explain purpose",
      "give clear explanation", "clear explanation to patient"), "Explain procedure"),
    (("consent",), "Take consent"),
    (("received the patient", "patient with respect", "patient’s needs", "patient's needs",
      "directed to waiting room", "wheelchair"), "Patient care"),
    (("demonstrates knowledge", "demonstrate knowledge"), "Demonstrate knowledge"),
    (("focused history", "take a history", "history of any"), "Take history"),
    # PFAER screens are questions put to the patient, so they stay verbal (answered in
    # the live consult); only SCORING the scale below is form work.
    (("screen for", "screen if"), "Screen patient"),
    (("learning barrier",), "Learning barriers"),
    (("falls precaution education", "provide falls precaution"), "Falls education"),

    # ── Preparation / equipment.
    (("obtain appropriate requisites", "obtain the requisites", "requisites"), "Prepare equipment"),
    (("correct occluder", "general occluder", "occluder with orange"), "Select occluder"),
    (("information sheet",), "Give info sheet"),
    (("remove glasses", "contact lenses if worn"), "Remove glasses / CL"),
    # Only steps whose PURPOSE is confirming the correction. Not "corrective lenses" —
    # the VA steps say "Check patient's distant vision WITH corrective lenses…", and that
    # step is the vision test itself.
    (("usual near/reading correction", "appropriate correction is worn", "normally wears",
      "wears their usual"), "Check correction worn"),
    (("daylight-equivalent", "good natural daylight", "adequately illuminated",
      "illumination"), "Check lighting"),
    (("prepare the appropriate eye drops", "prepare the eye drop"), "Prepare eye drops"),
    (("instil", "pull the lower lid"), "Instill drops"),

    # ── Procedures.
    (("pinhole",), "Pinhole test"),
    (("near vision", "near va"), "Test near VA"),
    # NOT "largest character": the NEAR test also reads "from the largest characters".
    (("distance vision", "distant vision", "distance va", "visual acuity", "logmar",
      "snellen", "read all 5 letters", "read all the 5 letters",
      "stop the test when"), "Test distance VA"),
    (("iop", "tonometry", "intraocular pressure"), "Measure IOP"),
    (("anterior segment", "slit lamp", "slit-lamp"), "Anterior segment"),
    (("fundus", "optic disc"), "Fundus exam"),
    (("ishihara", "colour vision", "color vision", "each plate", "demonstration plate",
      "plates correctly"), "Colour vision"),
    (("amsler", "central dot"), "Amsler grid"),
    (("test the right eye", "test each eye", "test one eye", "repeat the test for",
      "occluding the left eye", "other eye occluded"), "Test each eye"),
    (("verbal or non-verbal cue", "without giving any cue"), "Avoid cueing"),

    # ── Machine handling.
    (("position", "chin and forehead", "chin rest"), "Position patient"),
    (("align", "focus the target", "acquisition"), "Align & focus"),
    (("control lever", "control knob", "joystick", "machine body", "move the machine", "pull the machine"), "Operate joystick"),
    (("sharpest image", "image is captured", "capture the image", "acquire the image",
      "image acquisition", "take the image", "take the scan"), "Capture image"),
    (("measurement switch", "three readings", "average reading", "readings accuracy",
      "obtain the average", "measurement value"), "Take readings"),
    (("choose the correct lens", "correct lens and refractive", "refractive status",
      "correct formula", "area of scanning", "macular cut", "rnfl", "trial lens",
      "reading mode", "measurement mode", "auto start mode", "test pattern",
      "threshold parameters", "phakic", "aphakic", "post refractive surgery",
      "select appropriate legend", "appropriate legend"), "Select settings"),
    (("validate the measurement", "validate the reading"), "Validate reading"),
    (("perform the auto kerato", "perform the airpuff", "perform the icare"), "Operate machine"),
    (("monitor patient", "fixation loss", "monitor patient’s progress"), "Monitor patient"),

    # ── Safety / closing.
    (("mental status", "transfer score", "mobility score", "weighted risk score",
      "total weighted"), "Score fall risk"),
    (("correct eye", "coloured sticker", "fall risk", "red flag", "recognise that new"), "Safety check"),
    (("ensure patient is comfortable", "patient is comfortable"), "Patient comfortable"),
    (("look upwards", "do not blink", "gaze at", "open both eyes", "look at the",
      "inform patient of the", "clear and proper instruction", "request patient to"), "Instruct patient"),
    (("listens attentively", "opening statement"), "Listen actively"),
]

_ASK_PREFIXES = ("ask", "asks", "enquire", "enquires")

# A documentation step is recognised by its LEADING VERB, never by a substring: the
# phrase "medical record notes" sits inside every identification step, so a bare
# "record" substring would hijack them. Checked before _LABEL_RULES — a step that
# STARTS with record/document is documenting, whatever else it names.
_DOC_PREFIXES = ("record ", "document ", "tally and record")

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
    "Align & focus", "Operate joystick", "Capture image", "Take readings",
    "Select settings", "Validate reading", "Print results", "Document results",
    "Safety check",
    # Chart-side procedures. Reading the EMR before you act is a hands-on step the
    # student DOES at the screen — not something they say to the patient — so it needs a
    # chip. "Check doctor's order" was missing here, which silently dropped a CRITICAL
    # step from 109 of 155 cases (the reported bug).
    "Check doctor's order", "Check allergy",
    # Equipment / setup procedures.
    "Prepare equipment", "Select occluder", "Give info sheet", "Care & maintenance",
    "Check correction worn", "Check lighting",
    # Technique procedures.
    "Test each eye", "Avoid cueing", "Operate machine", "Monitor patient",
    # Scoring the fall-risk scale is form work the student does, not a question they ask.
    "Score fall risk",
}

# Manual chips that are a single mechanical confirmation — a machine-handling / equipment
# step with no assessable typed technique — tick on ONE click with no typed explanation
# (ricoe C5). Marking every operational step quick also keeps grading CONSISTENT: doing
# exactly what the checklist step says can never be scored "partial" for an un-tasked extra
# (e.g. positioning the head correctly is complete on its own). Only the genuine skill
# procedures below (VA, IOP, drops, colour vision, Amsler, hand-hygiene technique…) stay
# non-quick, because performing them well IS the assessment.
_QUICK_LABELS = {
    "Wipe occluder", "Disinfect equipment", "Discard waste",
    "Print results", "Document results", "Remove glasses / CL",
    "Position patient", "Align & focus", "Operate joystick", "Capture image",
    "Take readings", "Select settings", "Validate reading", "Safety check",
    # Chart / setup confirmations — you either checked the order, the allergy, the
    # lighting and the correction, or you didn't. There's no technique to grade, so
    # these tick on one click (same consistency rule as the machine steps above).
    "Check doctor's order", "Check allergy", "Check correction worn", "Check lighting",
    "Prepare equipment", "Select occluder", "Give info sheet", "Care & maintenance",
    "Monitor patient", "Score fall risk",
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


def match_label(action: str) -> str | None:
    """The canonical label for a "do" step, or None if NO rule recognises it.

    The None case is the one that matters: an unrecognised step gets a generically-clipped
    label and defaults to verbal, so it silently vanishes from the action panel — nobody
    ever DECIDED it should be absent. tests/cases/test_action_panel_completeness.py asserts
    this returns non-None for every step of every real procedure checklist, so a new or
    re-ingested step can't quietly disappear.
    """
    low = action.strip().lower()
    if low.startswith(_DOC_PREFIXES):
        return "Document results"
    for keywords, label in _LABEL_RULES:
        if any(kw in low for kw in keywords):
            return label
    return None


def _do_label(action: str, category: str) -> str:
    label = match_label(action)
    if label is not None:
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
