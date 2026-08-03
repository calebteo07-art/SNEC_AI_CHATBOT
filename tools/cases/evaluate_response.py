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


def _evaluate_all_domains(conv_text: str, case_context: str) -> dict[str, dict]:
    """Score all 4 domains in a single Gemini call. Returns dict keyed by domain name."""
    all_few_shots = "\n\n".join(DOMAIN_FEW_SHOTS[d] for d in _DOMAINS)

    prompt = (
        f"You are a senior ophthalmology clinical educator grading a student's case simulation.\n\n"
        f"{all_few_shots}\n\n"
        f"## Case Context\n{case_context}\n\n"
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
) -> dict:
    """Score a completed case simulation using per-domain few-shot rubric.

    Args:
        case:            The full case dict (from load_case).
        conversation:    Full conversation history (list of {role, content} dicts).
        student_id:      Student UUID (for audit logging).
        performed_steps: Checklist step numbers the student marked as performed.

    Returns:
        Dict with per-domain scores/feedback + total_score + checklist compliance.
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

    domain_results = _evaluate_all_domains(conv_text, case_context)

    # Fetch checklist and compute compliance counts
    critical_hit = 0
    critical_total = 0
    checklist_section = ""
    performed = set(performed_steps or [])
    try:
        from tools.kb.search import get_checklist_by_name
        procedure_name = case.get("checklist_procedure") or case.get("topic", "")
        checklist_data = get_checklist_by_name(procedure_name)
        if checklist_data:
            cl = checklist_data.get("steps") or {}
            steps = cl.get("steps", []) if isinstance(cl, dict) else []
            lines = ["\n\nPROCEDURE CHECKLIST:"]
            for s in steps:
                num = s.get("step_number", 0)
                is_crit = bool(s.get("critical"))
                ticked = "✓ PERFORMED" if num in performed else "✗ NOT MARKED"
                mark = "[CRITICAL] " if is_crit else ""
                lines.append(f"{num}. {mark}{s.get('action', '')} [{ticked}]")
                if is_crit:
                    critical_total += 1
                    if num in performed:
                        critical_hit += 1
            checklist_section = "\n".join(lines)  # noqa: F841 — available if needed
    except Exception:
        pass

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
        "overall_feedback":      _build_overall(domain_results, total),
        "total_score":           total,
        "critical_hit":          critical_hit,
        "critical_total":        critical_total,
    }

    audit_log("case_evaluated", student_id=student_id, feature="cases",
              detail=f"case_id={case['case_id']} total={total}/40 checklist={critical_hit}/{critical_total}")

    return result


def _build_overall(domain_results: dict, total: int) -> str:
    """Compose a one-sentence overall summary from domain results."""
    weak = [d for d in _DOMAINS if int(domain_results[d].get("score", 0)) < 6]
    strong = [d for d in _DOMAINS if int(domain_results[d].get("score", 0)) >= 8]
    grade = "Excellent" if total >= 36 else "Good" if total >= 28 else "Satisfactory" if total >= 20 else "Needs improvement"
    summary = f"{grade} overall ({total}/40)."
    if strong:
        summary += f" Strong performance in: {', '.join(strong)}."
    if weak:
        summary += f" Focus revision on: {', '.join(weak)}."
    return summary
