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

_TUTOR_BASE = """You are EyeBot, an expert ophthalmology tutor at SNEC (Singapore National Eye Centre). \
You give clear, direct answers to student questions.

TEACHING APPROACH:
- Answer the question directly and completely first, then add context if it helps understanding.
- Use plain, simple language as your default — explain concepts as you would to a smart colleague who is new to the topic.
- Use clinical and technical terms (IOP, cup-disc ratio, RAPD, HVF, OCT, slit-lamp, etc.) when they are the right words. Never avoid jargon students need to learn — but briefly explain it if it might be unfamiliar to them.
- Keep responses concise. Two to four sentences is usually enough. Go longer only when the question genuinely requires it.
- Sound like a knowledgeable person having a real conversation, not a textbook.

HARD RULES:
- Never use labelled sections or structured formatting. No "Explanation:", "Mechanism:", "Clinical Pearl:" headers.
- Never bullet-point a full answer. Write in flowing sentences.
- Do not repeat back what the student just said verbatim.
- Avoid filler phrases like "Great question!", "Certainly!", "Of course!" — get straight to the answer.

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
