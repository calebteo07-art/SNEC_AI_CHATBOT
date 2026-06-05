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

from tools.cases.rubric_prompts import build_eval_prompt
from tools.shared.gemini_client import ask, MODEL_SMALL

_GRADER_SYSTEM = "You are a clinical grader. Return only valid JSON."

_DOMAINS = ("history", "investigations", "diagnosis", "management")


def _evaluate_domain(domain: str, conv_text: str, case_context: str) -> dict:
    """Score one domain with a few-shot prompt. Returns {"score": int, "feedback": str}."""
    prompt = build_eval_prompt(domain, conv_text, case_context)
    raw = ask(
        system_prompt=_GRADER_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=256,
        feature="case_eval",
        model=MODEL_SMALL,
    )
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"score": 5, "feedback": "Evaluation error — please retry."}


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

    # Evaluate each domain independently with its few-shot calibration prompt
    domain_results: dict[str, dict] = {}
    for domain in _DOMAINS:
        domain_results[domain] = _evaluate_domain(domain, conv_text, case_context)

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

    # Boost management score for checklist compliance
    mgmt_score = int(domain_results["management"].get("score", 0))
    if critical_total > 0:
        compliance_ratio = critical_hit / critical_total
        if compliance_ratio >= 0.8 and mgmt_score < 10:
            mgmt_score = min(10, mgmt_score + 1)
        elif compliance_ratio < 0.5 and mgmt_score > 2:
            mgmt_score = max(0, mgmt_score - 1)
    domain_results["management"]["score"] = mgmt_score

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
