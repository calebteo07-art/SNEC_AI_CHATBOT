"""Few-shot examples for the 4-domain clinical rubric engine.

Each example pair (high-score / low-score) calibrates Gemini's grading
so scores are consistent across different evaluations of similar performance.
"""

# Each domain has two anchors: a high-performing and a low-performing example.
# This two-shot approach is efficient (≤200 tokens per domain) yet strongly
# anchors the score distribution.

DOMAIN_FEW_SHOTS: dict[str, str] = {

    "history": """
## History-Taking Calibration Examples

HIGH SCORE (8-10) — Systematic, covers all red flags:
  Student asked onset, duration, laterality, character of visual disturbance,
  associated symptoms (pain, flashes, floaters), past ocular history,
  family history of glaucoma or AMD, current systemic medications and
  allergies, and occupational visual requirements.
  → Score 9. Minor gap: no specific trauma history.

LOW SCORE (1-4) — Superficial or skipped:
  Student asked only "Can you describe your vision problem?" then jumped
  to ordering investigations without exploring past history or red flags.
  → Score 3. Critical omissions: laterality, duration, family history, medications.
""",

    "investigations": """
## Investigations Calibration Examples

HIGH SCORE (8-10) — Complete, correctly performed and recorded:
  Student performed and recorded the appropriate tests for the encounter —
  e.g. visual acuity (LogMAR/Snellen), IOP, anterior-segment observation,
  and any role-specific imaging (fundus photos, OCT, visual fields, biometry)
  — with correct technique and clear documentation.
  → Score 10. Comprehensive, accurate, well-documented.

LOW SCORE (1-4) — Missing or poorly performed tests:
  Student measured only IOP and skipped visual acuity, or recorded readings
  without checking quality/repeatability, leaving the record incomplete for
  the doctor to act on.
  → Score 4. Structurally incomplete — key measurements missing.
""",

    "diagnosis": """
## Clinical Recognition Calibration Examples
(Allied health DO NOT make a medical diagnosis — score pattern recognition,
red-flag detection and triage/urgency judgement.)

HIGH SCORE (8-10) — Recognised the pattern and triaged correctly:
  Student recognised the clinical picture (e.g. discharge + no pain + normal
  vision → likely conjunctivitis pattern; or pain + haloes + reduced vision →
  possible acute angle closure), correctly identified whether red flags were
  present, judged the urgency/triage category appropriately, and understood
  this needs the doctor to confirm — without stating a definitive medical
  diagnosis.
  → Score 10. Accurate recognition and triage, stayed within role.

LOW SCORE (1-4) — Missed red flags, mis-triaged, or over-reached:
  Student failed to spot red flags (treated a painful red eye with vision loss
  as routine), badly mis-judged urgency, OR over-stepped their role by
  asserting a definitive medical diagnosis instead of recognising and routing.
  → Score 2. Unsafe recognition/triage or outside scope of practice.
""",

    "management": """
## Escalation & Care Calibration Examples
(Allied health DO NOT prescribe or decide treatment — score escalation,
documentation/handover and within-scope patient advice.)

HIGH SCORE (8-10) — Escalated, documented, and advised correctly:
  Student escalated/referred to the right person with the right urgency
  (e.g. flag to the doctor today for a suspected sight-threatening cause, or
  route as routine for a minor one), documented the findings clearly for
  handover, and gave correct within-scope advice and safety-netting (hygiene
  measures, what to do, and to return promptly if pain/vision change).
  → Score 10. Complete: escalation, documentation, and patient education.

LOW SCORE (1-4) — Failed to escalate or document, or stepped out of role:
  Student did not escalate/refer or gave no clear handover/documentation, OR
  over-stepped by prescribing medication or starting treatment that is the
  doctor's decision.
  → Score 4. Incomplete escalation, or outside scope of practice.

VERY LOW SCORE (0-2) — No recommendation at all:
  Student gave no escalation, documentation, or patient advice after the
  encounter.
  → Score 0. No handover or recommendation attempted.
""",
}


def build_eval_prompt(domain: str, conversation: str, case_context: str) -> str:
    """Build a few-shot evaluation prompt for a single domain.

    Args:
        domain:       One of: history, investigations, diagnosis, management.
        conversation: Full student-patient transcript as a string.
        case_context: Compact case summary (diagnosis, management, rubric).

    Returns:
        System prompt string ready for `ask()`.
    """
    few_shot = DOMAIN_FEW_SHOTS.get(domain, "")
    domain_title = domain.replace("_", " ").title()
    return f"""You are a senior ophthalmology clinical educator grading a student's case simulation.

{few_shot}
## Case Context
{case_context}

## Student Conversation
{conversation}

## Task
Score the student's **{domain_title}** performance from 0-10.
Base your score ONLY on what appears in the student conversation above — do not infer or give benefit of the doubt for actions not mentioned.
Return ONLY valid JSON, no other text:
{{"score": <int 0-10>, "feedback": "<2-3 sentences: what they did well, what they missed, one clinical tip>"}}"""
