# tools/cases/observe_steps.py
"""Live OSCE examiner: read the consult transcript and return which checklist
steps the student has now satisfied. One cheap Gemini call; resilient — returns
[] in mock mode, on bad JSON, or on any error (manual ticking is the fallback).
"""

import json

from tools.cases.examination_actions import dual_kind
from tools.shared.gemini_client import ask, MOCK_MODE, MODEL

_EXAMINER_SYSTEM = (
    "You are a careful OSCE examiner observing an ophthalmic student's consultation with a "
    "patient. Given the remaining checklist steps and the consultation transcript, decide "
    "which steps THE STUDENT has genuinely done — actually asked the question, explained the "
    "thing, gave the instruction, obtained the consent, or confirmed the detail — in their "
    "OWN words.\n"
    "The student may build up a single step across SEVERAL separate messages, so read ALL of "
    "the student's turns together and combine them; paraphrases and synonyms count, exact "
    "wording is not required. For example, a step that requires TWO patient identifiers is "
    "satisfied when the student asks for the name in one message and the NRIC / date of birth "
    "in another — combine them and tick the identification step (and any name / NRIC sub-steps) "
    "once both have been asked, even across different turns.\n"
    "Mark to a COMPETENT standard, not a perfect one. A step that spells out sub-items "
    "(\"…at least 2 identifiers: Patient Name, Patient Identification Number / Address / "
    "Date of Birth\") is satisfied when the student covers its SUBSTANCE — the enumeration "
    "is guidance for you, not a script the student must recite. A step that names a standard "
    "protocol is satisfied when the student names that protocol correctly; do not make them "
    "list its stages. Where a performance sits between two readings, resolve it UPWARD.\n"
    "That leniency is about DEPTH, never about EVIDENCE. "
    "BE STRICT. Do NOT tick a step just because it was mentioned in passing, implied, hinted "
    "at, only tangentially related, or something the student said they 'would' do without "
    "doing it. NEVER tick a step because the PATIENT said it — only the student's own words "
    "and actions count. When there is genuine doubt about whether the student really did the "
    "step, leave it OUT.\n"
    "Return ONLY a JSON array of the clearly-satisfied step numbers, e.g. [2,5]. Return [] if none."
)

# Window the examiner over the whole consult (not just the last few turns) so a step
# the student covered early still gets ticked once enough context accrues. Kept wide so a
# step touched on early — but missed by an earlier (e.g. transient-fail) examiner pass —
# is still in view to be picked up on a later turn.
_RECENT_TURNS = 80


def _schema() -> dict:
    return {"type": "array", "items": {"type": "integer"}}


def observe(checklist_steps: list[dict], messages: list[dict], already_ticked: list[int],
            exclude_steps=None, focus_step: int | None = None,
            record_done: list[int] | None = None) -> list[int]:
    """Return newly-satisfied step numbers (excluding already-ticked and excluded steps).

    exclude_steps: step numbers the conversational examiner must never tick — the case's
    hands-on (manual) procedures, which tick only via the action panel. They are hidden
    from the model AND filtered from its output, so the consult can never auto-tick them.

    focus_step: the student has explicitly claimed they already did this step (the station's
    stuck-valve). Ask for one lenient re-read of THAT step only — strictness everywhere else
    is unchanged, so this can't become a way to tick the whole list.

    record_done: dual-source steps (see examination_actions.dual_kind) whose ACTION-PANEL
    half the student has already done. The examiner sees the consult only, so without this
    a strict reading of "verify with the EMR and ask the patient" can never be satisfied
    from the transcript. It removes exactly one half — the patient-facing half is still
    judged on the student's own words — and only for steps that really are dual.
    """
    if MOCK_MODE:
        return []

    ticked = set(already_ticked or [])
    excluded = {int(n) for n in (exclude_steps or [])}
    remaining = [s for s in checklist_steps
                 if int(s.get("step_number", 0)) not in ticked
                 and int(s.get("step_number", 0)) not in excluded]
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
    focus_note = ""
    if focus_step is not None and int(focus_step) in {int(s.get("step_number", 0)) for s in remaining}:
        focus_note = (
            f"\n\nNOTE: the student believes they have already completed step {int(focus_step)}. "
            "Re-read the WHOLE transcript for that step specifically and include it if their own "
            "words reasonably cover it, even if indirectly. Your strictness for every OTHER step "
            "is unchanged."
        )
    remaining_actions = {int(s.get("step_number", 0)): str(s.get("action", "")) for s in remaining}
    done_halves = sorted({int(n) for n in (record_done or [])} & set(remaining_actions))
    # WHICH half is outstanding depends on the step, so it is read off the step text rather
    # than assumed: telling the examiner to judge "whether they asked the patient" on a
    # hand-hygiene-and-identity step would have it grade the wrong thing — and the wrong
    # thing is a critical step. A step that is not dual at all gets no note, so a stale
    # entry in record_done can never become a free excuse.
    by_kind: dict[str, list[int]] = {}
    for n in done_halves:
        if kind := dual_kind(remaining_actions[n]):
            by_kind.setdefault(kind, []).append(n)
    notes: list[str] = []
    for kind, nums in by_kind.items():
        which = ", ".join(f"step {n}" for n in nums)
        if kind == "ask":
            notes.append(
                f"\n\nNOTE: for {which}, the student has ALREADY checked the medical record / EMR "
                "in the action panel. You cannot see that in the transcript, so do NOT hold the "
                "record half against them. Judge ONLY whether they also asked the patient — "
                "include the step if they did, leave it out if they did not."
            )
        else:
            notes.append(
                f"\n\nNOTE: for {which}, the student has ALREADY done the hands-on half in the "
                "action panel. You cannot see that in the transcript, so do NOT hold it against "
                "them. Judge ONLY whether they confirmed the patient's identity with the patient "
                "— include the step if they did, leave it out if they did not."
            )
    record_note = "".join(notes)
    prompt = (
        f"## Remaining checklist steps\n{steps_block}\n\n"
        f"## Recent transcript\n{convo}\n\n"
        f"Which step numbers has the student now satisfied? JSON array only."
        f"{focus_note}{record_note}"
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
