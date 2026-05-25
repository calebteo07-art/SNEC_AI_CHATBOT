#!/usr/bin/env python3
"""AI case generator — produces fresh clinical simulation cases from RAG content.

Cases are role-scoped (OA / OT / PSA) and grounded in the Supabase knowledge base.
Called by the /api/cases endpoint; results stored in server-side memory for the session.
"""

import json
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gemini_client import ask, MODEL_SMALL
from tools.kb.search import search as _rag_search, format_context as _rag_format

_ROLE_QUERIES = {
    "OA": "ophthalmic auxiliary history taking IOP dilation pre-operative post-operative care",
    "OT": "ophthalmic technician biometry HVF visual field OCT corneal topography endothelial cell count",
    "PSA": "patient service associate NCT non-contact tonometry LogMAR visual acuity eye drop instillation PFAER fall risk",
}

_ROLE_FOCUS = {
    "OA": (
        "Ophthalmic Auxiliary (OA). Cases should involve: patient triage, history taking, "
        "IOP measurement, pupil dilation, pre-operative preparation, post-operative care, "
        "patient education. Examination and investigation steps should reflect OA scope of practice."
    ),
    "OT": (
        "Ophthalmic Technician (OT). Cases should involve: A-scan biometry, Humphrey Visual Field (HVF), "
        "OCT imaging, corneal topography, endothelial cell count, and other diagnostic imaging procedures. "
        "Steps should reflect proper equipment setup, acquisition, quality checks, and documentation."
    ),
    "PSA": (
        "Patient Service Associate (PSA). Cases should involve: history taking, LogMAR visual acuity testing, "
        "non-contact tonometry (NCT), eye drop instillation, pupil dilation, PFAER and fall risk assessment. "
        "Steps should reflect patient-facing clinical support tasks."
    ),
}

_CASE_SCHEMA = """{
  "case_id": null,
  "title": "<short procedure/scenario title>",
  "difficulty": "<beginner|intermediate|advanced>",
  "topic": "<one lowercase word, e.g. biometry, history, ncт, hvf>",
  "estimated_minutes": <integer 10-20>,
  "patient": {
    "name": "<realistic Singapore name>",
    "age": <integer>,
    "gender": "<Male|Female>",
    "occupation": "<occupation>",
    "presenting_complaint": "<chief complaint in lay language, 1-2 sentences>"
  },
  "history": {
    "hpc": "<history of presenting complaint>",
    "pmhx": "<past medical history>",
    "medications": "<current medications or 'None'>",
    "family_hx": "<family history or 'Not significant'>",
    "social_hx": "<social history>"
  },
  "examination_findings": {
    "<role-relevant finding key>": "<value>",
    "...": "..."
  },
  "investigations": {
    "<investigation name>": "<result or 'Pending'>",
    "...": "..."
  },
  "diagnosis": "<primary diagnosis>",
  "management": {
    "immediate": ["<step 1>", "<step 2>"],
    "follow_up": ["<step 1>"],
    "patient_education": ["<point 1>"]
  },
  "rubric": {
    "history": {"points": 10, "key_points": ["<must-ask question 1>", "<must-ask question 2>"]},
    "investigations": {"points": 10, "key_points": ["<key investigation 1>"]},
    "diagnosis": {"points": 10, "key_points": ["<correct diagnosis>", "<key differential>"]},
    "management": {"points": 10, "key_points": ["<key management step 1>", "<key management step 2>"]}
  }
}"""


def generate_cases(
    role: str,
    weak_topics: list[str] | None = None,
    n: int = 5,
) -> list[dict]:
    """Generate n fresh clinical cases for the given role.

    Args:
        role:         Student role: 'OA', 'OT', or 'PSA'.
        weak_topics:  Student's weak topics to bias case selection (optional).
        n:            Number of cases to generate.

    Returns:
        List of case dicts with generated case_id fields.
    """
    role = role.upper() if role else "OA"
    if role not in _ROLE_FOCUS:
        role = "OA"

    # Build RAG context from role-relevant content
    rag_query = _ROLE_QUERIES.get(role, "ophthalmology clinical procedure")
    if weak_topics:
        rag_query = f"{' '.join(weak_topics[:2])} {rag_query}"

    rag_context = ""
    try:
        chunks = _rag_search(rag_query, top_k=6)
        if chunks:
            rag_context = _rag_format(chunks)
    except Exception:
        pass

    role_description = _ROLE_FOCUS[role]
    weak_note = (
        f"Prioritise cases touching these weak topics: {', '.join(weak_topics[:3])}.\n"
        if weak_topics else ""
    )

    system = (
        f"You are an ophthalmology clinical education designer at SNEC (Singapore National Eye Centre). "
        f"Generate exactly {n} realistic clinical simulation cases for a {role_description}\n\n"
        f"{weak_note}"
        f"Each case must follow this exact JSON schema:\n{_CASE_SCHEMA}\n\n"
        f"Rules:\n"
        f"- Set case_id to null (it will be assigned by the server).\n"
        f"- Make each case clinically distinct from the others.\n"
        f"- Use realistic Singapore patient demographics.\n"
        f"- Rubric key_points should list what the student MUST demonstrate for full marks.\n"
        f"- Groud all clinical content in the knowledge base provided below.\n\n"
        f"Return ONLY a valid JSON array of {n} case objects. No other text.\n\n"
        f"KNOWLEDGE BASE:\n{rag_context or 'Standard ophthalmology clinical guidelines.'}"
    )

    raw = ask(
        system_prompt=system,
        messages=[{"role": "user", "content": f"Generate {n} {role} simulation cases."}],
        max_tokens=8192,
        feature="case_gen",
        model=MODEL_SMALL,
    )

    # Parse JSON
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    cases = json.loads(text)
    if not isinstance(cases, list):
        raise ValueError("Case generation returned non-list JSON")

    # Assign UUIDs and ensure required fields
    result = []
    for c in cases:
        if not isinstance(c, dict):
            continue
        c["case_id"] = str(uuid.uuid4())
        c.setdefault("role", role)
        c.setdefault("difficulty", "intermediate")
        c.setdefault("estimated_minutes", 15)
        if "patient" not in c:
            continue
        result.append(c)

    return result
