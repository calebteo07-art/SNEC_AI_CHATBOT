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

HIGH SCORE (8-10) — Complete, logical panel:
  Student requested: visual acuity (LogMAR/Snellen), IOP measurement,
  dilated fundus examination, cup-disc ratio, Humphrey Visual Field (24-2),
  and OCT RNFL — all appropriate and necessary for a glaucoma workup.
  → Score 10. Comprehensive and correctly prioritised.

LOW SCORE (1-4) — Missing critical tests:
  Student requested only IOP measurement and fundus photo. Did not order
  visual field testing or OCT, which are mandatory for glaucoma staging.
  → Score 4. Structurally incomplete — cannot stage disease without VF.
""",

    "diagnosis": """
## Diagnosis Calibration Examples

HIGH SCORE (8-10) — Specific, differential included:
  Student correctly identified Primary Open-Angle Glaucoma (POAG) and
  provided differential diagnoses of Normal-Tension Glaucoma and Ocular
  Hypertension. Referenced ICD-10-level specificity (H40.1).
  → Score 10. Specific, evidence-based, differential appropriate.

LOW SCORE (1-4) — Incorrect or vague:
  Student stated "the patient has some eye disease causing vision loss"
  without naming a specific condition, or incorrectly diagnosed cataract
  in the face of unambiguous POAG findings.
  → Score 2. Unacceptable — no specific diagnosis reached.
""",

    "management": """
## Management Calibration Examples

HIGH SCORE (8-10) — Pharmacological + follow-up + patient education:
  Student initiated first-line prostaglandin analogue (latanoprost 0.005%
  once nightly), arranged 4-week IOP recheck, ordered baseline HVF and
  OCT, counselled on drop technique/compliance, and discussed the
  importance of lifelong monitoring.
  → Score 10. Complete: pharmacological, monitoring, and counselling.

LOW SCORE (1-4) — Initiated treatment but no follow-up or counselling:
  Student prescribed eye drops but did not specify follow-up interval,
  did not counsel on technique, and made no plan for visual field
  monitoring.
  → Score 5. Partial — treatment started but management plan incomplete.

VERY LOW SCORE (0-2) — No management plan:
  Student did not offer any treatment or follow-up after reaching a diagnosis.
  → Score 0. No management attempted.
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
