#!/usr/bin/env python3
"""Agent 14 (part 1): Evaluates a student's case simulation against the 4-domain rubric.

Uses per-domain few-shot prompts (rubric_prompts.py) for consistent, calibrated scoring.
4 separate Gemini calls (one per domain) — each at max_tokens=200 — replace the previous
single monolithic call, improving score precision at the cost of ~3x more tokens.

Usage (from cases.py):
    from tools.cases.evaluate_response import evaluate_case
    result = evaluate_case(case, conversation, student_id, performed_steps)
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.cases.rubric_prompts import DOMAIN_FEW_SHOTS
from tools.shared.gemini_client import ask, MODEL

_GRADER_SYSTEM = "You are a clinical grader. Return only valid JSON."

_DOMAINS = ("history", "investigations", "diagnosis", "management")

_ALL_DOMAINS_SCHEMA = {
    "type": "object",
    "properties": {
        "history":        {"type": "object", "properties": {"score": {"type": "integer"}, "feedback": {"type": "string"}}, "required": ["score", "feedback"]},
        "investigations": {"type": "object", "properties": {"score": {"type": "integer"}, "feedback": {"type": "string"}}, "required": ["score", "feedback"]},
        "diagnosis":      {"type": "object", "properties": {"score": {"type": "integer"}, "feedback": {"type": "string"}}, "required": ["score", "feedback"]},
        "management":     {"type": "object", "properties": {"score": {"type": "integer"}, "feedback": {"type": "string"}}, "required": ["score", "feedback"]},
    },
    "required": ["history", "investigations", "diagnosis", "management"],
}


def procedure_block(steps: list[dict], performed: set[int]) -> str:
    """Render the station's SNEC checklist as the technique standard for the AI calls.

    Shared by the domain grader and the debrief coach (tools/api/routers/cases.py) so both
    argue from the SAME procedure text — a second rendering would drift the first time one
    of them changed.

    Each line carries the step's own `notes` — SNEC's reason the step exists ("Shared
    occluders transmit adenoviral conjunctivitis"). That rationale is the part a model
    cannot reconstruct from general ophthalmology, and it is exactly the judgement the
    grader is being asked to make, so it must be in the prompt rather than assumed.
    """
    lines = []
    for s in steps:
        num = int(s.get("step_number", 0))
        mark = "[CRITICAL] " if s.get("critical") else ""
        state = "[DONE]" if num in performed else "[NOT DONE]"
        lines.append(f"{num}. {mark}{s.get('action', '')}  {state}")
        if s.get("notes"):
            lines.append(f"   why it matters: {s['notes']}")
    return "\n".join(lines)


def _evaluate_all_domains(conv_text: str, case_context: str,
                          procedure_block: str = "") -> dict[str, dict]:
    """Score all 4 domains in a single Gemini call. Returns dict keyed by domain name."""
    all_few_shots = "\n\n".join(DOMAIN_FEW_SHOTS[d] for d in _DOMAINS)

    # Reported 2026-08-04: the 60 AI-graded points were argued from the generic anchors and
    # the model's own priors — "open graded against internet, instead of SNEC procedure".
    # The station's SNEC checklist was already being FETCHED here and dropped on the floor.
    # It is the institution's own standard, so it leads the prompt's authority order.
    snec_section = (
        f"## SNEC Procedure Standard — this station's checklist\n{procedure_block}\n\n"
        if procedure_block else ""
    )

    prompt = (
        f"You are a senior ophthalmology clinical educator grading a student's case simulation.\n\n"
        f"{all_few_shots}\n\n"
        f"## Case Context\n{case_context}\n\n"
        f"{snec_section}"
        f"## Student Conversation\n{conv_text}\n\n"
        f"## Task\n"
        f"Score the student's performance in ALL FOUR domains (history, investigations, diagnosis, management) from 0-10.\n"
        f"This is an allied-health (OA/OT/PSA) OSCE station — the student is NOT a doctor. Score 'diagnosis' as "
        f"clinical RECOGNITION (spotting the pattern, red flags and urgency, and triaging correctly — without making a "
        f"medical diagnosis) and 'management' as ESCALATION & CARE (escalating/referring to the right person, clear "
        f"documentation/handover, and correct within-scope patient advice and safety-netting). Do NOT reward — and "
        f"lightly penalise — medical diagnosis or prescribing, which are outside their role.\n"
        # Branda (2026-08-03): the generic anchors read as a wish-list, so students lost marks for
        # items this encounter never called for. The case already holds the answer —
        # `rubric.<domain>.key_points` and `management` are in the Case Context above — so say
        # they are the standard. Pinned by tests/cases/test_rubric_applicability.py.
        f"Grade against THIS case. The Case Context above carries this case's own "
        f"`rubric.<domain>.key_points` and its expected `management` plan; together they define "
        f"what a complete performance looks like HERE. An item this scenario never called for is "
        f"not an omission and must not cost marks. In particular, where this case needs no "
        f"escalation, a correct routine plan — \"routine, patient keeps their appointment time\", "
        f"with the findings recorded for the doctor — earns full marks for management; never mark "
        f"it down for the absence of an urgency this case never had.\n"
        # The grader is for SNEC (Singapore National Eye Centre). Its checklists differ from
        # general practice on real details — reading direction, test distance, how many
        # readings to average — so an unanchored grader marks correct SNEC technique wrong.
        f"SNEC IS THE STANDARD. This is Singapore National Eye Centre. Where the SNEC "
        f"Procedure Standard above (SNEC's own steps, in SNEC's order, each with SNEC's "
        f"reason for it) differs from general or textbook practice, SNEC wins — grade "
        f"technique against those steps and that case rubric, and never against how the "
        f"procedure is done elsewhere. A step SNEC's checklist does not ask for is not a "
        f"gap, and correct SNEC technique is never wrong. Each step is marked [DONE] or "
        f"[NOT DONE]: judge HOW WELL the done ones were performed and explained in the "
        f"transcript — the count itself is scored separately, so do not re-punish it here.\n"
        # The trainers who tested the app could not pass their own stations. With only a
        # HIGH (8-10) and a LOW (1-4) anchor the 5-7 band was undefined and ordinary
        # competent work drifted downward. The COMPETENT anchors above fill the hole; this
        # says out loud what standard to hold. Pinned by tests/cases/test_rubric_calibration.py.
        f"CALIBRATION — grade to a COMPETENT standard, not a perfect one. This is a formative "
        f"training station and the student is still learning the role, so a safe, competent "
        f"performance that covers what this case turns on is a 7; it does not have to be "
        f"exhaustive or elegant to score well. Reserve 0-4 for work that was unsafe, outside "
        f"their scope, or that missed what this case actually turned on. Where a performance "
        f"sits between two bands, award the HIGHER band — give the student the benefit of the "
        f"doubt.\n"
        f"Base scores ONLY on what appears in the student conversation above — do not infer actions not mentioned.\n"
        f"Return ONLY valid JSON:\n"
        f'{{"history": {{"score": <int 0-10>, "feedback": "<2-3 sentences>"}}, '
        f'"investigations": {{"score": <int 0-10>, "feedback": "<2-3 sentences>"}}, '
        f'"diagnosis": {{"score": <int 0-10>, "feedback": "<2-3 sentences>"}}, '
        f'"management": {{"score": <int 0-10>, "feedback": "<2-3 sentences>"}}}}'
    )

    raw = ask(
        system_prompt=_GRADER_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2048,
        feature="case_eval",
        model=MODEL,
        # becky §6: HIGH(16k)→MEDIUM(8k) thinking. The per-domain few-shot anchors
        # carry the calibration; MEDIUM holds the score with far less reasoning latency.
        thinking_level="MEDIUM",
        response_json_schema=_ALL_DOMAINS_SCHEMA,
    )

    _fallback = {d: {"score": 5, "feedback": "Evaluation error — please retry."} for d in _DOMAINS}
    try:
        text = raw.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        result = json.loads(text)
        return {d: result.get(d, _fallback[d]) for d in _DOMAINS}
    except (json.JSONDecodeError, AttributeError):
        return _fallback


def evaluate_case(
    case: dict,
    conversation: list[dict],
    student_id: str,
    performed_steps: list[int] | None = None,
    steps: list[dict] | None = None,
) -> dict:
    """Score a completed case simulation using per-domain few-shot rubric.

    Args:
        case:            The full case dict (from load_case).
        conversation:    Full conversation history (list of {role, content} dicts).
        student_id:      Student UUID (for audit logging).
        performed_steps: Checklist step numbers the student marked as performed.
        steps:           The STATION-RESOLVED SNEC checklist steps — the same list the
                         student saw tick. Passed in rather than re-fetched: the endpoint
                         resolves through resolve_procedure_name (superseded rows remapped,
                         tally sheets excluded, rubric fallback), and a second raw name
                         lookup here could grade them against a checklist they never saw.
    """
    from tools.shared.audit_log import log as audit_log

    # Compact case context — saves ~30% tokens vs indent=2
    case_context = json.dumps({
        "diagnosis": case.get("diagnosis", ""),
        "management": case.get("management", ""),
        "rubric": case.get("rubric", {}),
        "examination_findings": case.get("examination_findings", {}),
        "investigations": case.get("investigations", {}),
    }, separators=(",", ":"))

    conv_text = "\n\n".join(
        f"{'Student' if m['role'] == 'user' else 'Patient/Examiner'}: {m['content']}"
        for m in conversation
    )

    performed = {int(n) for n in (performed_steps or [])}
    resolved = steps or []

    domain_results = _evaluate_all_domains(
        conv_text, case_context, procedure_block(resolved, performed)
    )

    critical_total = sum(1 for s in resolved if s.get("critical"))
    critical_hit = sum(1 for s in resolved
                       if s.get("critical") and int(s.get("step_number", 0)) in performed)

    # Checklist compliance now drives Station-100 (Thoroughness + safety gate) in
    # tools/cases/station_score.py — no hidden per-domain nudge here.
    mgmt_score = int(domain_results["management"].get("score", 0))

    total = sum(int(domain_results[d].get("score", 0)) for d in _DOMAINS)

    result = {
        "history_score":         int(domain_results["history"].get("score", 0)),
        "investigations_score":  int(domain_results["investigations"].get("score", 0)),
        "diagnosis_score":       int(domain_results["diagnosis"].get("score", 0)),
        "management_score":      mgmt_score,
        "history_feedback":      domain_results["history"].get("feedback", ""),
        "investigations_feedback": domain_results["investigations"].get("feedback", ""),
        "diagnosis_feedback":    domain_results["diagnosis"].get("feedback", ""),
        "management_feedback":   domain_results["management"].get("feedback", ""),
        "total_score":           total,
        "critical_hit":          critical_hit,
        "critical_total":        critical_total,
    }

    audit_log("case_evaluated", student_id=student_id, feature="cases",
              detail=f"case_id={case['case_id']} total={total}/40 checklist={critical_hit}/{critical_total}")

    return result
