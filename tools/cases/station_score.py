"""Two-scheme scoring for the OSCE station.

The student-facing /100 is built from two AI-graded schemes, each out of 50 — the
checklist is NOT part of the grade (coverage awards no points):

    Consultation & Technique (0-50)   history-taking, plus examination/procedure
                                      technique on cases that have manual procedures
    Clinical Judgement & Safety (0-50) recognition + escalation/handover, safety-gated

A missed CRITICAL step still raises the safety flag and caps Judgement & Safety at
SAFETY_CAP (real OSCE "critical fail", softened for a learning tool). Pure + deterministic.
The legacy /40 (total_score) is kept for difficulty progression and staff dashboards.
`breakdown` explains both schemes to the student — the sub-scores behind each total and the
safety cap when it fires — so every number in the debrief is traceable to an input.
"""

SAFETY_CAP = 0.6

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
    """Return the two-scheme score dict from LLM domain scores + critical-safety.

    Args:
        domain_scores: {"history","investigations","diagnosis","management"} each 0-10.
        steps:         resolved checklist steps ({step_number, action, critical}) — used
                       ONLY for the critical-miss safety flag, never for coverage points.
        performed:     step numbers the student ticked.
        has_manual:    True if the case has hands-on procedures. When True, Consultation &
                       Technique blends history + investigations (procedure execution);
                       when False, there is no procedure to grade so it is history alone.
    """
    performed_set = {int(n) for n in (performed or [])}

    # Critical-miss safety flag only — no coverage scoring.
    crit_total = crit_done = 0
    missed_critical: list[str] = []
    for s in steps:
        if not bool(s.get("critical")):
            continue
        crit_total += 1
        if int(s.get("step_number", 0)) in performed_set:
            crit_done += 1
        else:
            missed_critical.append(str(s.get("action", "")))

    hist = int(domain_scores.get("history", 0))
    inv = int(domain_scores.get("investigations", 0))
    dia = int(domain_scores.get("diagnosis", 0))
    mng = int(domain_scores.get("management", 0))

    # Scheme 1 — Consultation & Technique (0-50). Procedure execution (investigations)
    # only weighs in when the case actually has procedures; otherwise history alone.
    if has_manual:
        consult_technique = round(50 * (hist + inv) / 20)
    else:
        consult_technique = round(50 * hist / 10)
    consult_technique = max(0, min(50, consult_technique))

    # Scheme 2 — Clinical Judgement & Safety (0-50), gated by the critical-miss safety flag.
    safe = not missed_critical
    gate = 1.0 if safe else SAFETY_CAP
    judgement_safety = max(0, min(50, round(50 * (dia + mng) / 20 * gate)))

    score_100 = max(0, min(100, consult_technique + judgement_safety))

    # The explanation of the two schemes, emitted HERE because this function owns the
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
        "consult": {
            "parts": consult_parts, "total": consult_technique, "max": 50,
            "capped": False, "cap_reason": "",
        },
        "judgement": {
            "parts": [
                {"label": "Recognition", "pts": dia, "max": 10},
                {"label": "Handover & escalation", "pts": mng, "max": 10},
            ],
            "total": judgement_safety, "max": 50,
            "capped": not safe, "cap_reason": cap_reason,
        },
    }

    return {
        "score_100": score_100,
        "consult_technique": consult_technique,
        "consult_technique_max": 50,
        "judgement_safety": judgement_safety,
        "judgement_safety_max": 50,
        "verdict": _verdict(score_100),
        "safe": safe,
        "missed_critical": missed_critical,
        "total_score": round(score_100 * 0.4),
        "critical_hit": crit_done,
        "critical_total": crit_total,
        "breakdown": breakdown,
    }
