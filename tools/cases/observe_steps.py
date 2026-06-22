# tools/cases/observe_steps.py
"""Live OSCE examiner: read the consult transcript and return which checklist
steps the student has now satisfied. One cheap Gemini call; resilient — returns
[] in mock mode, on bad JSON, or on any error (manual ticking is the fallback).
"""

import json

from tools.shared.gemini_client import ask, MOCK_MODE, MODEL

_EXAMINER_SYSTEM = (
    "You are an OSCE examiner observing an ophthalmic student's consultation. "
    "Given the remaining checklist steps and the transcript, decide which steps the "
    "student has addressed — performed, asked about, explained, confirmed, or clearly "
    "covered, even briefly or in passing. Be generous: if the transcript gives any "
    "reasonable evidence the step was attempted or covered, count it as done. Only "
    "leave a step out when there is no sign of it at all. "
    "Return ONLY a JSON array of the satisfied step numbers, e.g. [2,5]."
)

# Window the examiner over the whole consult (not just the last few turns) so a step
# the student covered early still gets ticked once enough context accrues.
_RECENT_TURNS = 40


def _schema() -> dict:
    return {"type": "array", "items": {"type": "integer"}}


def observe(checklist_steps: list[dict], messages: list[dict], already_ticked: list[int]) -> list[int]:
    """Return newly-satisfied step numbers (excluding already-ticked)."""
    if MOCK_MODE:
        return []

    ticked = set(already_ticked or [])
    remaining = [s for s in checklist_steps if int(s.get("step_number", 0)) not in ticked]
    if not remaining:
        return []

    steps_block = "\n".join(
        f"{int(s.get('step_number', 0))}. {s.get('action', '')}" for s in remaining
    )
    recent = messages[-_RECENT_TURNS:]
    convo = "\n".join(
        f"{'Student' if m.get('role') == 'user' else 'Patient'}: {m.get('content', '')}"
        for m in recent
    )
    prompt = (
        f"## Remaining checklist steps\n{steps_block}\n\n"
        f"## Recent transcript\n{convo}\n\n"
        f"Which step numbers has the student now satisfied? JSON array only."
    )

    try:
        raw = ask(
            system_prompt=_EXAMINER_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=256,
            feature="case_observe",
            model=MODEL,
            thinking_level="LOW",
            response_json_schema=_schema(),
        )
    except Exception:
        return []

    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []

    valid = {int(s.get("step_number", 0)) for s in remaining}
    out: list[int] = []
    for n in parsed:
        try:
            ni = int(n)
        except (ValueError, TypeError):
            continue
        if ni in valid and ni not in out:
            out.append(ni)
    return out
