# tools/cases/action_model_answer.py
"""Craft a per-procedure model answer and grade a student's typed technique against
it in real time — the OSCE action panel's grade (ricoe C6).

The model answer is drawn from the case's AUTHORED rubric (investigations
key_points) plus the checklist step text — human-authored, so it is a real
reference, never a hardcoded "good job". Grading is a deterministic keyword
overlap so the panel responds instantly, for free, and reliably (WAT: probabilistic
AI reasons, deterministic code executes). An optional AI tip may be layered on top
by the caller, but the verdict/covered/missing here are the source of truth.
"""

# Richer keyword families than examination_actions' label rules, tuned to match the
# authored `rubric.investigations.key_points` for each hands-on procedure. First entry
# whose keys appear in the action label wins; the label's own words are a fallback.
_FAMILY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Measure IOP": ("iop", "tonometry", "tonometer", "nct", "non-contact", "intraocular", "pressure", "mmhg"),
    "Test distance VA": ("distance va", "distance vision", "distance", "logmar", "snellen", "acuity chart"),
    "Test near VA": ("near va", "near vision", "near", "n chart", "n8", "35cm", "35 cm"),
    "Anterior segment": ("anterior", "slit lamp", "slit-lamp", "cornea"),
    "Fundus exam": ("fundus", "optic disc", "retina", "dilat"),
    "Colour vision": ("ishihara", "colour vision", "color vision", "colour plate"),
    "Amsler grid": ("amsler",),
    "Pinhole test": ("pinhole",),
    "Instill drops": ("instil", "instill", "eye drop", "lower lid"),
    "Prepare eye drops": ("eye drop", "prepare the appropriate"),
    "Auto refraction": ("auto refraction", "autorefract", "refract"),
}

_STOPWORDS = {
    "the", "a", "an", "to", "of", "and", "in", "on", "for", "with", "at", "is",
    "are", "be", "by", "per", "as", "or", "e.g", "eg", "using", "use",
}

_GENERIC_FALLBACK = [
    "Explain the procedure to the patient before starting",
    "Perform the technique correctly and safely",
    "Record or validate the result accurately",
]


def _label_keywords(action_label: str) -> tuple[str, ...]:
    """Keywords that identify this procedure's family. Curated family first, then the
    label's own significant words so an unlisted label still has something to match on."""
    low = action_label.lower().strip()
    for label, kws in _FAMILY_KEYWORDS.items():
        if label.lower() == low:
            return kws
    words = tuple(w for w in low.split() if len(w) >= 3 and w not in _STOPWORDS)
    return words or (low,)


def _rubric_points(case: dict) -> list[str]:
    rubric = (case or {}).get("rubric") or {}
    inv = rubric.get("investigations") or {}
    pts = inv.get("key_points") or []
    return [str(p).strip() for p in pts if str(p).strip()]


def _step_points(satisfies_steps, checklist_steps) -> list[str]:
    wanted = {int(n) for n in (satisfies_steps or [])}
    out: list[str] = []
    for s in (checklist_steps or []):
        if int(s.get("step_number", 0)) in wanted:
            action = str(s.get("action", "")).strip()
            if action:
                note = str(s.get("notes") or "").strip()
                out.append(f"{action} — {note}" if note else action)
    return out


def craft_model_answer(case: dict, action_label: str, satisfies_steps,
                       checklist_steps=None) -> list[str]:
    """Return the ordered model-answer points for one manual procedure.

    Priority: authored investigations rubric points matching this procedure →
    the checklist step text the action satisfies → a generic safe reference.
    Never empty, so there is always something concrete to grade against."""
    keywords = _label_keywords(action_label)
    matched = [
        p for p in _rubric_points(case)
        if any(kw in p.lower() for kw in keywords)
    ]
    if matched:
        return matched
    steps = _step_points(satisfies_steps, checklist_steps)
    if steps:
        return steps
    return list(_GENERIC_FALLBACK)


def _salient(text: str) -> list[str]:
    tokens = []
    tok = ""
    for ch in text.lower():
        if ch.isalnum():
            tok += ch
        else:
            if tok:
                tokens.append(tok)
            tok = ""
    if tok:
        tokens.append(tok)
    return [t for t in tokens if t.isdigit() or (len(t) >= 3 and t not in _STOPWORDS)]


def _all_tokens(text: str) -> set[str]:
    out: set[str] = set()
    tok = ""
    for ch in text.lower():
        if ch.isalnum():
            tok += ch
        else:
            if tok:
                out.add(tok)
            tok = ""
    if tok:
        out.add(tok)
    return out


def _covered(point: str, technique_tokens: set[str]) -> bool:
    salient = _salient(point)
    if not salient:
        return False
    shared = sum(1 for t in salient if t in technique_tokens)
    return (shared / len(salient) >= 0.34) or (shared >= 3)


def grade_technique(model_points: list[str], technique: str) -> dict:
    """Deterministically grade a typed technique against the model-answer points.

    Returns {verdict, covered, missing}:
      strong      — every model point covered (and there is at least one)
      partial     — some points covered
      developing  — no point convincingly covered
    """
    tokens = _all_tokens(technique or "")
    covered: list[str] = []
    missing: list[str] = []
    for p in model_points:
        (covered if _covered(p, tokens) else missing).append(p)

    if model_points and not missing:
        verdict = "strong"
    elif covered:
        verdict = "partial"
    else:
        verdict = "developing"
    return {"verdict": verdict, "covered": covered, "missing": missing}


def _coaching_line(grade: dict) -> str:
    """A grounded, deterministic coaching line — never a hardcoded 'good job'."""
    verdict, covered, missing = grade["verdict"], grade["covered"], grade["missing"]
    if verdict == "strong":
        return "Strong technique — you covered the key points of the model answer."
    if verdict == "partial":
        tip = missing[0] if missing else ""
        return f"Good coverage so far. To match the model answer, also: {tip}" if tip \
            else "Good coverage — close to the full model answer."
    tip = missing[0] if missing else (covered[0] if covered else "")
    return f"Key technique to include next time: {tip}" if tip \
        else "Describe the specific steps, safety checks and how you record the result."


def grade_action(case: dict, action_label: str, satisfies_steps, checklist_steps,
                 technique: str) -> dict:
    """End-to-end deterministic grade for one action-panel procedure.

    Returns {verdict, covered, missing, model_answer, coaching}. Pure — no AI, so it
    is instant and works keyless in MOCK_MODE. The caller may replace `coaching` with
    a grounded AI tip, but must keep the deterministic verdict/covered/missing."""
    model_points = craft_model_answer(case, action_label, satisfies_steps, checklist_steps)
    grade = grade_technique(model_points, technique)
    return {
        "verdict": grade["verdict"],
        "covered": grade["covered"],
        "missing": grade["missing"],
        "model_answer": " · ".join(model_points),
        "model_points": model_points,
        "coaching": _coaching_line(grade),
    }
