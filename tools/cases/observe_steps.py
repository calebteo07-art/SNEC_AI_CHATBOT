# tools/cases/observe_steps.py
"""Live OSCE examiner: read the consult transcript and return which checklist
steps the student has now satisfied. One cheap Gemini call; resilient — returns
[] in mock mode, on bad JSON, or on any error (manual ticking is the fallback).
"""

import json

from tools.shared.gemini_client import ask, MOCK_MODE, MODEL

_EXAMINER_SYSTEM = (
    "You are an OSCE examiner observing an ophthalmic student's consultation with a "
    "patient. Given the remaining checklist steps and the consultation transcript, decide "
    "which steps the student has now satisfied — performed, asked about, explained, "
    "confirmed, mentioned, or covered in any way, even briefly, indirectly, or in passing.\n"
    "IMPORTANT: the student usually covers a single step across SEVERAL separate messages, "
    "not all at once. Read ALL of the student's turns together and combine them — a step "
    "counts as satisfied if the student covered it at ANY point in the conversation, even "
    "when it was split across multiple messages or asked a little at a time.\n"
    "Be generous: if there is any reasonable evidence a step was attempted or touched on, "
    "count it as done. Only leave a step out when there is genuinely no sign of it anywhere "
    "in the transcript.\n"
    "Return ONLY a JSON array of the satisfied step numbers, e.g. [2,5]. Return [] if none."
)

# Window the examiner over the whole consult (not just the last few turns) so a step
# the student covered early still gets ticked once enough context accrues. Kept wide so a
# step touched on early — but missed by an earlier (e.g. transient-fail) examiner pass —
# is still in view to be picked up on a later turn.
_RECENT_TURNS = 80


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
            # Headroom so the JSON array is NEVER silently truncated: ask() only treats a
            # MAX_TOKENS finish as an error above 512, so a tight 256 cap could return a
            # half-written array that fails to parse → step never ticked. The output here is
            # tiny (a list of ints) and you only pay for tokens actually generated, so a
            # generous cap is free insurance against truncation. (becky reliability rule.)
            max_tokens=1024,
            feature="case_observe",
            model=MODEL,
            # becky §9: per-turn auto-tick is a constrained classification — MINIMAL
            # thinking. Fires once per student turn, so its latency rides every message.
            thinking_level="MINIMAL",
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
