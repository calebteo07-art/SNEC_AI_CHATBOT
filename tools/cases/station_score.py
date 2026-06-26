"""Pure "Station 100" scoring for the OSCE station.

Builds one legible score out of 100 from three traceable components and projects
it back to the legacy /40 used for difficulty progression and staff dashboards:

    Thoroughness (0-40)  critical-weighted checklist coverage  (what you did)
    Technique    (0-30)  history + investigations              (how well)
    Judgment&safety(0-30) recognition + escalation, gated      (the clinical core)

A missed CRITICAL step caps Judgment & safety at SAFETY_CAP (real OSCE "critical
fail", softened for a learning tool) and raises a safety flag. Pure + deterministic.
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
    """Return the Station-100 score dict from LLM domain scores + checklist coverage.

    Args:
        domain_scores: {"history","investigations","diagnosis","management"} each 0-10.
        steps:         resolved checklist steps ({step_number, action, critical}).
        performed:     step numbers the student ticked.
        has_manual:    True if the case has hands-on procedures. When False the
                       Technique bucket is removed and its 30 points split 50/50
                       across Steps-completed and Judgement & safety.
    """
    performed_set = {int(n) for n in (performed or [])}

    earned = possible = 0
    crit_total = crit_done = done_steps = 0
    missed_critical: list[str] = []
    for s in steps:
        n = int(s.get("step_number", 0))
        crit = bool(s.get("critical"))
        w = 2 if crit else 1
        possible += w
        if crit:
            crit_total += 1
        if n in performed_set:
            done_steps += 1
            earned += w
            if crit:
                crit_done += 1
        elif crit:
            missed_critical.append(str(s.get("action", "")))

    # Adaptive caps: Technique (procedure execution) only applies when the case
    # has manual procedures; otherwise its 30 points split 50/50 across the other
    # two buckets (Steps completed -> 50, Judgement & safety -> 50).
    if has_manual:
        thoroughness_max, technique_max, judgment_max = 40, 30, 30
    else:
        thoroughness_max, technique_max, judgment_max = 50, 0, 50

    thoroughness = round(thoroughness_max * earned / possible) if possible else 0

    # Technique = procedure-execution quality only (the investigations domain).
    # History-taking quality lives in Steps-completed (the questions are ticked
    # steps) + Judgement, so it is no longer blended into Technique here.
    inv = int(domain_scores.get("investigations", 0))
    technique = round(technique_max * inv / 10) if technique_max else 0

    dia = int(domain_scores.get("diagnosis", 0))
    mng = int(domain_scores.get("management", 0))
    safe = not missed_critical
    gate = 1.0 if safe else SAFETY_CAP
    judgment = round(judgment_max * (dia + mng) / 20 * gate)

    score_100 = max(0, min(100, thoroughness + technique + judgment))

    if crit_total == 0:
        crit_detail = ""
    elif crit_done == crit_total:
        crit_detail = f"all {crit_total} critical done"
    else:
        crit_detail = f"{crit_total - crit_done} of {crit_total} critical missed"
    total_steps = len([s for s in steps])
    thoroughness_detail = f"{done_steps} of {total_steps} steps" + (f" · {crit_detail}" if crit_detail else "")

    return {
        "score_100": score_100,
        "thoroughness": thoroughness,
        "technique": technique,
        "judgment": judgment,
        "verdict": _verdict(score_100),
        "safe": safe,
        "missed_critical": missed_critical,
        "thoroughness_detail": thoroughness_detail,
        "total_score": round(score_100 * 0.4),
        "critical_hit": crit_done,
        "critical_total": crit_total,
        "technique_applies": has_manual,
        "thoroughness_max": thoroughness_max,
        "technique_max": technique_max,
        "judgment_max": judgment_max,
    }
