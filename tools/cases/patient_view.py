# tools/cases/patient_view.py
"""What the simulated PATIENT is allowed to know.

The patient prompt is built from the case file, and the case file is also the marking
scheme. Two things were leaking across that boundary:

  * `diagnosis` — kept on the theory that the model needs to know what NOT to reveal.
    That is backwards: a patient character has no legitimate use for the diagnosis, and
    the field carries clinical *interpretation* that mirrors the rubric's key points. The
    one key you cannot leak is the one you should not ship.

  * `investigations.key_points` — 16 of 155 cases put the MARKING KEY there ("Wait about
    5 minutes between different drops so the first is not washed out; instil the more
    important drop first…"), and in 15 of them `task` + `key_points` are the ONLY keys, so
    an in-scope question like "what are the investigation results?" could only be answered
    with the answer key. The design already withholds `management` for exactly this reason.

The grader still sees the whole case — `evaluate_case` builds its own context from the
unfiltered dict, so nothing here weakens marking. This is only the patient's view.

`examination_findings` and the measurement half of `investigations` stay: a station whose
findings the student can never obtain is worse than one whose patient is too helpful, and
15 stations already have chips that reveal nothing (their measurements live under
`investigations`). Keeping the measurements while dropping the marking keys is what makes
closing the examiner-disclosure instruction safe.
"""

# Fields the patient must never carry.
#   rubric / management — pure marking meta, already excluded by the caller's allowlist.
#   diagnosis — the answer.
_PATIENT_FIELDS = ("patient", "history", "examination_findings", "investigations")

# Keys inside `investigations` that describe how to MARK the station rather than what was
# measured. `task` is the examiner's instruction to the student; `key_points` and `points`
# are the marking scheme.
_MARKING_KEYS = frozenset({"task", "key_points", "points", "marking", "rubric"})


def strip_marking(block: object) -> object:
    """Drop marking-scheme keys from an investigations/findings block."""
    if not isinstance(block, dict):
        return block
    return {k: v for k, v in block.items() if k.lower() not in _MARKING_KEYS}


def build_patient_view(case: dict) -> dict:
    """The subset of a case the patient persona may be told.

    Empty blocks are dropped rather than sent as `{}` — a case whose `investigations` was
    nothing but marking keys should read as "no investigations", not as an empty object
    inviting the model to invent some.
    """
    view: dict = {}
    for key in _PATIENT_FIELDS:
        if key not in case:
            continue
        value = strip_marking(case[key]) if key in ("investigations", "examination_findings") else case[key]
        if isinstance(value, dict) and not value:
            continue
        view[key] = value
    return view
