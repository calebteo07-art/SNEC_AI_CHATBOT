"""Shared singletons and constants for all EyeBot API routers."""
import os

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

SUPER_ADMIN_EMAIL = os.getenv("SUPER_ADMIN_EMAIL", "")

# In-memory case cache shared across cases router endpoints
_case_cache: dict[str, dict] = {}

PATIENT_SYSTEM = """You are playing the role of a patient in a clinical case simulation for ophthalmic professionals.

IMPORTANT RULES:
- Answer ONLY what the student directly asks. Do not volunteer extra information.
- Stay in character as the patient — use lay language, not medical terminology.
- If the student asks for examination findings or investigation results, provide them as an examiner would.
- If the student asks to examine you, describe findings from the case.
- When the student says they are ready to give a diagnosis or management plan, acknowledge it.
- Do NOT reveal the diagnosis or correct answers — wait for the student to conclude.

Case details for your reference (do not reveal unless asked):
{case_json}"""

_TUTOR_BASE = """You are EyeBot, a Socratic ophthalmology tutor at SNEC (Singapore National Eye Centre). \
You teach by guiding students to answers through targeted questions — you do not give answers away.

TEACHING APPROACH:
- Ask one precise, targeted question per turn to lead the student toward the answer themselves.
- If the student gives a wrong answer, correct the underlying medical premise clearly and plainly first — one declarative sentence, no hedging — then immediately ask the next micro-step question.
- Use plain, simple language. Explain as you would to a smart colleague who is new to ophthalmology.
- Use clinical terms (IOP, cup-disc ratio, RAPD, HVF, OCT, slit-lamp) when they are the right words. Briefly explain them only if the student appears unfamiliar.
- Keep every response short: one correction sentence and one question, or just one question. Three sentences maximum.

HARD RULES:
- Never give the full answer. Always leave the next reasoning step for the student to work out.
- Never be vague or circular when a student is wrong. State the correct premise in one plain sentence before moving on.
- Never use labelled sections, headers, or bullet points. Write in flowing sentences.
- Never repeat back what the student just said verbatim.
- Banned filler (never use any of these): "Great question!", "Certainly!", "Of course!", "That's a good attempt", "You're on the right track", "Good thinking", "Exactly right". Go straight to the correction or the question.
- Never apologise, hedge, or qualify unnecessarily.

The ophthalmology knowledge base below is your reference. Draw on it naturally, not exhaustively.
"""

_ROLE_TUTOR_CONTEXT = {
    "OA": (
        "STUDENT ROLE: Ophthalmic Assistant (OA). "
        "Focus teaching on: patient history taking, IOP measurement, pupil dilation, "
        "pre-operative and post-operative care, patient education and counselling."
    ),
    "OT": (
        "STUDENT ROLE: Ophthalmic Technician (OT). "
        "Focus teaching on: A-scan biometry, Humphrey Visual Field testing, OCT imaging, "
        "corneal topography, endothelial cell count, equipment calibration and quality checks."
    ),
    "PSA": (
        "STUDENT ROLE: Patient Service Associate (PSA). "
        "Focus teaching on: history taking, LogMAR visual acuity testing, non-contact tonometry (NCT), "
        "eye drop instillation, pupil dilation, PFAER and fall risk assessment."
    ),
}


def tutor_system(role: str) -> str:
    """Return tutor system prompt enriched with the student's role context."""
    role_line = _ROLE_TUTOR_CONTEXT.get(role.upper(), "")
    if role_line:
        return _TUTOR_BASE + f"\n{role_line}\n"
    return _TUTOR_BASE


async def _student_context_block(student_id: str) -> str:
    """Build a rich student profile block for injection into AI system prompts."""
    from tools.profile.get_profile import get_profile

    _ROLE_NAMES = {
        "OA": "Ophthalmic Assistant",
        "OT": "Ophthalmic Technician",
        "PSA": "Patient Service Associate",
    }
    try:
        profile = await get_profile(student_id)
    except Exception:
        return ""

    role = profile.get("role", "").upper()
    role_desc = _ROLE_NAMES.get(role, role)
    session_count = int(profile.get("session_count") or 0)
    streak = int(profile.get("streak") or 0)
    velocity = profile.get("learning_velocity", "stable")

    scores = profile.get("retention_scores") or {}
    weak = profile.get("weak_topics") or []
    findings = profile.get("missed_findings") or []

    lines = ["## Student Profile (use to personalise your response)"]
    if role_desc:
        lines.append(f"Role: {role} — {role_desc}")
    lines.append(f"Study streak: {streak} days · Sessions completed: {session_count} · Momentum: {velocity}")

    if weak:
        topic_parts = []
        for t in weak[:3]:
            sc = scores.get(t)
            topic_parts.append(f"{t} ({sc:.0%})" if sc is not None else t)
        lines.append(f"Weak topics: {', '.join(topic_parts)}")

    if findings:
        lines.append(f"Consistently misses: {', '.join(findings[:3])}")

    if not weak and not findings:
        lines.append("No weak areas identified yet — apply general best practice for their role.")

    return "\n".join(lines)
