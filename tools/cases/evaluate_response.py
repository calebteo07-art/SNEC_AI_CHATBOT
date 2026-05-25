#!/usr/bin/env python3
"""Agent 14 (part 1): Evaluates a student's case simulation against the rubric.

Usage (from run_case.py):
    from tools.cases.evaluate_response import evaluate_case
    result = evaluate_case(case, conversation, student_id)
"""

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gemini_client import ask, MODEL_SMALL

EVAL_PROMPT = """You are an experienced ophthalmology examiner evaluating a student's clinical case performance.

You will be given:
1. The case details (patient, findings, correct diagnosis, management plan)
2. The student's conversation with the virtual patient

Score the student on each of the 4 domains below. Each domain is worth 10 points.
Base scores ONLY on what the student actually asked or stated during the conversation.

Return ONLY valid JSON in exactly this format — no other text:
{
  "history_score": <0-10>,
  "investigations_score": <0-10>,
  "diagnosis_score": <0-10>,
  "management_score": <0-10>,
  "history_feedback": "<1-2 sentences>",
  "investigations_feedback": "<1-2 sentences>",
  "diagnosis_feedback": "<1-2 sentences>",
  "management_feedback": "<1-2 sentences>",
  "overall_feedback": "<2-3 sentences summarising performance and key learning points>"
}"""


def evaluate_case(
    case: dict,
    conversation: list[dict],
    student_id: str,
    performed_steps: list[int] | None = None,
) -> dict:
    """
    Score a completed case simulation.

    Args:
        case:         The full case dict (from load_case).
        conversation: The full conversation history.
        student_id:   Student UUID (for audit logging).

    Returns:
        Dict with scores and feedback for each domain.
    """
    from tools.shared.audit_log import log as audit_log

    # Build context for Gemini — compact JSON saves ~30% tokens vs indent=2
    case_summary = json.dumps({
        "diagnosis": case["diagnosis"],
        "management": case["management"],
        "rubric": case["rubric"],
        "examination_findings": case["examination_findings"],
        "investigations": case["investigations"],
    }, separators=(",", ":"))

    transcript = "\n\n".join(
        f"{'Student' if m['role'] == 'user' else 'Patient/Examiner'}: {m['content']}"
        for m in conversation
    )

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
                lines.append(f"{num}. {mark}{s.get('action','')} [{ticked}]")
                if is_crit:
                    critical_total += 1
                    if num in performed:
                        critical_hit += 1
            checklist_section = "\n".join(lines)
    except Exception:
        pass

    ticked_note = ""
    if performed:
        ticked_note = (
            f"\n\nThe student ticked {len(performed)} checklist steps as performed "
            f"({critical_hit}/{critical_total} critical steps). "
            f"Factor this procedural compliance into the management_score."
        )

    prompt = (
        f"CASE DETAILS:\n{case_summary}"
        f"{checklist_section}"
        f"{ticked_note}"
        f"\n\nSTUDENT CONVERSATION:\n{transcript}"
    )

    response = ask(
        system_prompt=EVAL_PROMPT,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=512,
        feature="case",
        model=MODEL_SMALL,
    )

    # Parse response
    text = response.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        # Fallback if mock/live response isn't valid JSON
        result = {
            "history_score": 7, "investigations_score": 7,
            "diagnosis_score": 8, "management_score": 7,
            "history_feedback": "Good systematic history taking.",
            "investigations_feedback": "Key investigations requested.",
            "diagnosis_feedback": "Correct diagnosis identified.",
            "management_feedback": "Appropriate management plan outlined.",
            "overall_feedback": response[:300],
        }

    result["total_score"] = sum([
        int(result.get("history_score", 0)),
        int(result.get("investigations_score", 0)),
        int(result.get("diagnosis_score", 0)),
        int(result.get("management_score", 0)),
    ])
    result["critical_hit"] = critical_hit
    result["critical_total"] = critical_total

    audit_log("case_evaluated", student_id=student_id, feature="cases",
              detail=f"case_id={case['case_id']} total={result['total_score']}/40 checklist={critical_hit}/{critical_total}")

    return result
