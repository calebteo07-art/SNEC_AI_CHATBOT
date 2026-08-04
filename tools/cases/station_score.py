"""Three-bucket scoring for the OSCE station — 40/30/30.

The student-facing /100 weights the checklist heaviest, because for an allied-health
role (OA/OT/PSA) doing the procedure correctly and completely IS the competency:

    Checklist coverage (0-40)         steps performed ÷ steps total, deterministic
    Consultation & Technique (0-30)   history-taking, plus examination/procedure
                                      technique on cases that have manual procedures
    Clinical Judgement & Safety (0-30) recognition + escalation/handover, safety-gated

Coverage is PLAIN: a critical step is worth the same one step as any other. Missing one
is punished a second time — and only a second time — by the safety gate, which raises the
flag and caps Judgement & Safety at SAFETY_CAP (real OSCE "critical fail", softened for a
learning tool). Pure + deterministic.

History: coverage scored under ricoe C7, was dropped entirely on 2026-06-26 in favour of
two AI schemes ×50, and is restored here. Dropping it meant a student needed 6/10 from the
grader on all four domains just to reach the 60 pass line — trainers testing the app could
not pass their own stations. See tests/cases/test_rubric_calibration.py for the other half
of that fix.

The legacy /40 (total_score) is kept for difficulty progression and staff dashboards.
`breakdown` explains all three buckets to the student — the sub-scores behind each total
and the safety cap when it fires — so every number in the debrief is traceable to an input.
"""

SAFETY_CAP = 0.6

CHECKLIST_MAX = 40
SCHEME_MAX = 30

_VERDICTS = (
    (85, "Exam-ready"),
    (70, "Solid"),
    (60, "Developing"),
    (0, "Keep practising"),
)


def _verdict(score_100: int) -> str:
    for threshold, label in _VERDICTS:
        if score_100 >= threshold:
            return label
    return "Keep practising"


def compute_station_score(domain_scores: dict, steps: list[dict], performed,
                          has_manual: bool = True) -> dict:
    """Return the three-bucket score dict from LLM domain scores + checklist coverage.

    Args:
        domain_scores: {"history","investigations","diagnosis","management"} each 0-10.
        steps:         resolved checklist steps ({step_number, action, critical}) — the
                       coverage bucket AND the critical-miss safety flag.
        performed:     step numbers the student ticked (the endpoint has already removed
                       any the student skipped).
        has_manual:    True if the case has hands-on procedures. When True, Consultation &
                       Technique blends history + investigations (procedure execution);
                       when False, there is no procedure to grade so it is history alone.
    """
    performed_set = {int(n) for n in (performed or [])}

    # Bucket 1 — checklist coverage, plus the critical-miss safety flag.
    steps_total = len(steps)
    steps_done = 0
    crit_total = crit_done = 0
    missed_critical: list[str] = []
    for s in steps:
        done = int(s.get("step_number", 0)) in performed_set
        steps_done += done
        if not bool(s.get("critical")):
            continue
        crit_total += 1
        if done:
            crit_done += 1
        else:
            missed_critical.append(str(s.get("action", "")))

    # A case with no resolved checklist has nothing to be thorough about — award the bucket
    # rather than capping the student at 60 for a data gap (0 of 155 cases hit this today).
    coverage = (round(CHECKLIST_MAX * steps_done / steps_total) if steps_total
                else CHECKLIST_MAX)
    coverage = max(0, min(CHECKLIST_MAX, coverage))

    hist = int(domain_scores.get("history", 0))
    inv = int(domain_scores.get("investigations", 0))
    dia = int(domain_scores.get("diagnosis", 0))
    mng = int(domain_scores.get("management", 0))

    # Bucket 2 — Consultation & Technique (0-30). Procedure execution (investigations)
    # only weighs in when the case actually has procedures; otherwise history alone.
    if has_manual:
        consult_technique = round(SCHEME_MAX * (hist + inv) / 20)
    else:
        consult_technique = round(SCHEME_MAX * hist / 10)
    consult_technique = max(0, min(SCHEME_MAX, consult_technique))

    # Bucket 3 — Clinical Judgement & Safety (0-30), gated by the critical-miss safety flag.
    safe = not missed_critical
    gate = 1.0 if safe else SAFETY_CAP
    judgement_safety = max(0, min(SCHEME_MAX, round(SCHEME_MAX * (dia + mng) / 20 * gate)))

    score_100 = max(0, min(100, coverage + consult_technique + judgement_safety))

    # The explanation of the three buckets, emitted HERE because this function owns the
    # formula — a duplicate in the frontend would drift the first time weighting changed.
    # Branda (2026-07-29): students couldn't tell why each domain scored what it did.
    consult_parts = [{"label": "History-taking", "pts": hist, "max": 10}]
    if has_manual:
        consult_parts.append({"label": "Examination technique", "pts": inv, "max": 10})
    cap_reason = (
        f"×{SAFETY_CAP} safety cap — critical step missed: {missed_critical[0]}"
        if missed_critical else ""
    )
    breakdown = {
        # No steps ⇒ no arithmetic to show; "0/0 → 40/40" would read as a bug.
        "checklist": {
            "parts": ([{"label": "Steps performed", "pts": steps_done, "max": steps_total}]
                      if steps_total else []),
            "total": coverage, "max": CHECKLIST_MAX,
            "capped": False, "cap_reason": "",
        },
        "consult": {
            "parts": consult_parts, "total": consult_technique, "max": SCHEME_MAX,
            "capped": False, "cap_reason": "",
        },
        "judgement": {
            "parts": [
                {"label": "Recognition", "pts": dia, "max": 10},
                {"label": "Handover & escalation", "pts": mng, "max": 10},
            ],
            "total": judgement_safety, "max": SCHEME_MAX,
            "capped": not safe, "cap_reason": cap_reason,
        },
    }

    return {
        "score_100": score_100,
        "checklist_coverage": coverage,
        "checklist_coverage_max": CHECKLIST_MAX,
        "consult_technique": consult_technique,
        "consult_technique_max": SCHEME_MAX,
        "judgement_safety": judgement_safety,
        "judgement_safety_max": SCHEME_MAX,
        "verdict": _verdict(score_100),
        "safe": safe,
        "missed_critical": missed_critical,
        "total_score": round(score_100 * 0.4),
        "critical_hit": crit_done,
        "critical_total": crit_total,
        "steps_done": steps_done,
        "steps_total": steps_total,
        "breakdown": breakdown,
    }
