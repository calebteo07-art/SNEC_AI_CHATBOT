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

# Which set of maxima produced a score, stamped onto every stored row (migration 017).
# The sub-scores persist as bare INTEGERs, so when this scheme rescaled them from /50 to
# /30 the stored rows of the two eras became indistinguishable and staff read the rescale
# as a performance drop. Scale 1 was the two schemes ×50; scale 2 is these three buckets.
# A NULL column means scale 1 — it predates the stamp. Bump this when the maxima move.
GRADE_SCALE = 2

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


# How many missed steps the coverage remark names before summarising the rest. Two keeps
# the remark a sentence; a student who missed nine steps needs the pattern, not the list.
_NOTE_MAX_MISSES = 2


def _checklist_note(steps: list[dict], performed: set[int],
                    steps_done: int, steps_total: int) -> str:
    """The 40-point bucket's remark — the one bucket with no AI feedback of its own.

    The report gave Consultation & Technique and Judgement & Safety two examiner paragraphs
    each and the LARGEST bucket nothing (reported 2026-08-04). It is written here, beside
    the formula, for the same reason `breakdown` is: a note composed in the frontend would
    drift the first time the weighting moved.

    A missed step is named with its `notes` — SNEC's own reason the step exists. Without
    that the remark only restates the ✓/✗ list the student is already looking at.
    """
    if not steps_total:
        return ""
    if steps_done >= steps_total:
        return (f"All {steps_total} steps performed — full coverage of this station's "
                f"SNEC procedure.")
    missed = [s for s in steps if int(s.get("step_number", 0)) not in performed]
    # Criticals first: if one was missed it is the reason for the safety cap on Judgement,
    # so it must be the first thing this remark names.
    missed.sort(key=lambda s: not bool(s.get("critical")))
    named = [f"{s.get('action', '')}" + (f" — {s['notes']}" if s.get("notes") else "")
             for s in missed[:_NOTE_MAX_MISSES]]
    rest = len(missed) - len(named)
    return (f"{steps_done} of {steps_total} steps performed. Not done: "
            + "; ".join(named)
            + (f" (+{rest} more)" if rest > 0 else "") + ".")


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
    coverage_exact = (CHECKLIST_MAX * steps_done / steps_total) if steps_total else float(CHECKLIST_MAX)

    hist = int(domain_scores.get("history", 0))
    inv = int(domain_scores.get("investigations", 0))
    dia = int(domain_scores.get("diagnosis", 0))
    mng = int(domain_scores.get("management", 0))

    # Bucket 2 — Consultation & Technique (0-30). Procedure execution (investigations)
    # only weighs in when the case actually has procedures; otherwise history alone.
    consult_exact = (SCHEME_MAX * (hist + inv) / 20) if has_manual else (SCHEME_MAX * hist / 10)

    # Bucket 3 — Clinical Judgement & Safety (0-30), gated by the critical-miss safety flag.
    safe = not missed_critical
    gate = 1.0 if safe else SAFETY_CAP
    judgement_exact = SCHEME_MAX * (dia + mng) / 20 * gate

    # ── Round ONCE, on the total. ────────────────────────────────────────────────
    # Each bucket used to be rounded independently and the roundings then summed, so up to
    # three half-point errors could stack: measured exhaustively over 150,381 reachable
    # combinations, 81 students were under-marked ACROSS THE PASS LINE (0.054%) and 1,340
    # were over-marked (0.89%). The tie-break was never the defect and switching to half-up
    # is not the fix — it raises false passes to 2,704.
    #
    # The buckets are also displayed and persisted individually, so they must stay whole
    # numbers that ADD UP to the total the student is shown. Largest-remainder apportionment
    # is what gives both: floor every bucket, then hand the leftover points to the buckets
    # with the largest fractional parts.
    exact = [
        max(0.0, min(float(CHECKLIST_MAX), coverage_exact)),
        max(0.0, min(float(SCHEME_MAX), consult_exact)),
        max(0.0, min(float(SCHEME_MAX), judgement_exact)),
    ]
    caps = [CHECKLIST_MAX, SCHEME_MAX, SCHEME_MAX]
    parts = [int(v) for v in exact]                      # floor
    leftover = int(round(sum(exact))) - sum(parts)
    # Largest fractional remainder first; ties fall to the earlier (higher-weighted) bucket.
    order = sorted(range(3), key=lambda i: (-(exact[i] - parts[i]), i))
    for i in order:
        if leftover <= 0:
            break
        if parts[i] < caps[i]:
            parts[i] += 1
            leftover -= 1
    coverage, consult_technique, judgement_safety = parts
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
            # The only bucket with no examiner paragraph of its own — see _checklist_note.
            "note": _checklist_note(steps, performed_set, steps_done, steps_total),
        },
        "consult": {
            "parts": consult_parts, "total": consult_technique, "max": SCHEME_MAX,
            "capped": False, "cap_reason": "", "note": "",
        },
        "judgement": {
            "parts": [
                {"label": "Recognition", "pts": dia, "max": 10},
                {"label": "Handover & escalation", "pts": mng, "max": 10},
            ],
            "total": judgement_safety, "max": SCHEME_MAX,
            "capped": not safe, "cap_reason": cap_reason, "note": "",
        },
    }

    return {
        "score_100": score_100,
        "grade_scale": GRADE_SCALE,
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
