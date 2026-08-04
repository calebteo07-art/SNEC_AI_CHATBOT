"""Few-shot examples for the 4-domain clinical rubric engine.

Each example pair (high-score / low-score) calibrates Gemini's grading
so scores are consistent across different evaluations of similar performance.

The anchors calibrate the SCORE DISTRIBUTION. What "complete" means for a given
encounter comes from the case itself — every case ships `rubric.<domain>.key_points`
and an expected `management` plan, and both reach the grader inside `case_context`.
Anchors that read as a fixed wish-list quietly override that: they marked a student
down for skipping a family history on a routine IOP check, and — the one that reached
us — for correctly not escalating a follow-up patient who simply keeps their
appointment (Branda, 2026-08-03). Every anchor therefore says out loud that it is
scored against THIS case. Pinned by tests/cases/test_rubric_applicability.py.

The bands are HIGH / COMPETENT / LOW because two bands were not enough. With only
HIGH (8-10, written as an exhaustive performance) and LOW (1-4), the whole 5-7 range was
undefined and an ordinary competent run — the thing a real station actually produces —
had nowhere to land, so the model drifted toward the low anchor. Trainers testing the app
could not pass their own stations. The COMPETENT anchor is deliberately written as a
PASS, not as a shortfall. Pinned by tests/cases/test_rubric_calibration.py.
"""

# Each domain has three anchors: high-performing, competent (the pass standard), and
# low-performing. Three-shot keeps this small (~350 tokens/domain) yet strongly anchors
# the distribution. becky §3 caches the block, so length costs prefill once, not per call.

DOMAIN_FEW_SHOTS: dict[str, str] = {

    "history": """
## History-Taking Calibration Examples
(Judge coverage against THIS case's `rubric.history.key_points` — they are what a
complete history means for this scenario. A question the scenario never called for
is not a gap.)

HIGH SCORE (8-10) — Covered what this case turns on, systematically:
  Student worked through the history this encounter actually needs. For an acute red
  eye that is onset, duration, laterality, character of the disturbance, associated
  symptoms (pain, flashes, floaters), past ocular and family history and medications;
  for a routine follow-up it may be no more than symptoms since the last visit, drop
  compliance and any change in vision.
  → Score 9. Minor gap: one key_point for this case left unasked.

COMPETENT PASS (5-7) — Got what this case turns on, without being exhaustive:
  Student asked the questions this encounter actually depends on and built a usable
  picture, but did not chase every avenue — a couple of this case's key_points went
  unexplored, or the questioning wandered rather than following a clear order. Nothing
  the presentation depended on was missed. This is a safe, competent history and a pass.
  → Score 7. Sufficient and sound; depth and structure are what separate it from a 9.

LOW SCORE (1-4) — Superficial, or missed what this case turned on:
  Student asked only "Can you describe your vision problem?" then jumped to ordering
  investigations, leaving most of this case's key_points unexplored — including the
  ones the presentation depended on.
  → Score 3. Critical omissions against this case's key_points.
""",

    "investigations": """
## Investigations Calibration Examples
(Score only the tests THIS case calls for, per `rubric.investigations.key_points` and
the case's own `investigations`. A test this scenario does not require is not a
missing test, and some encounters call for none at all.)

HIGH SCORE (8-10) — Complete for this encounter, correctly performed and recorded:
  Student performed and recorded the tests this case requires — e.g. visual acuity
  (LogMAR/Snellen), IOP, anterior-segment observation, or a role-specific investigation
  (fundus photos, OCT, visual fields, biometry) — with correct technique, quality checks
  and clear documentation.
  → Score 10. Comprehensive for this case, accurate, well-documented.

COMPETENT PASS (5-7) — Did the tests this case needed, adequately:
  Student performed and recorded the measurements this case turns on with sound
  technique, but the documentation was thin, a quality/repeatability check went
  unstated, or one secondary test the case lists was not reached. The record the
  doctor receives is usable and nothing unsafe was done.
  → Score 7. Competent and safe; polish and completeness separate it from a 9-10.

LOW SCORE (1-4) — Skipped or poorly performed the tests this case needed:
  Student measured only IOP when this case also turned on visual acuity, or recorded
  readings without checking quality/repeatability, leaving the record incomplete for
  the doctor to act on.
  → Score 4. Structurally incomplete — key measurements for this case missing.
""",

    "diagnosis": """
## Clinical Recognition Calibration Examples
(Allied health DO NOT make a medical diagnosis — score pattern recognition,
red-flag detection and triage/urgency judgement, against THIS case's
`rubric.diagnosis.key_points`.)

HIGH SCORE (8-10) — Recognised the pattern and triaged correctly:
  Student recognised the clinical picture (e.g. discharge + no pain + normal
  vision → likely conjunctivitis pattern; or pain + haloes + reduced vision →
  possible acute angle closure), correctly identified whether red flags were
  present, judged the urgency/triage category appropriately, and understood
  this needs the doctor to confirm — without stating a definitive medical
  diagnosis. Concluding that there are no red flags, when there are none, is
  correct recognition and scores here.
  → Score 10. Accurate recognition and triage, stayed within role.

COMPETENT PASS (5-7) — Read the picture correctly and triaged safely:
  Student recognised the pattern this case presents and judged the urgency correctly —
  or correctly concluded there were no red flags — but described it loosely and did not
  spell out what pointed them there. Safe recognition, thinly reasoned, within role.
  → Score 7. Competent triage; explicit reasoning is what separates it from a 9-10.

LOW SCORE (1-4) — Missed red flags, mis-triaged, or over-reached:
  Student failed to spot red flags (treated a painful red eye with vision loss
  as routine), badly mis-judged urgency, OR over-stepped their role by
  asserting a definitive medical diagnosis instead of recognising and routing.
  → Score 2. Unsafe recognition/triage or outside scope of practice.
""",

    "management": """
## Escalation & Care Calibration Examples
(Allied health DO NOT prescribe or decide treatment — score escalation,
documentation/handover and within-scope patient advice, against THIS case's own
`management` plan and `rubric.management.key_points`. Many encounters correctly
require no escalation at all; on those, the plan the case expects IS the routine one.)

HIGH SCORE (8-10) — Routed the patient correctly for this encounter, and documented it:
  Escalation case — student flagged a suspected sight-threatening cause to the doctor
  with the right urgency, documented the findings clearly for handover, and gave correct
  within-scope advice and safety-netting (hygiene measures, what to do, and to return
  promptly if pain/vision change).
  → Score 10. Right urgency, clear handover, patient advised.

  Routine case — nothing needed escalating (a stable follow-up whose VA and IOP were
  recorded for the doctor's review at the appointment). Student said so plainly —
  "routine, patient keeps their appointment time" — recorded the findings for the
  doctor and gave the relevant within-scope advice.
  → Score 10 as well. Correctly declining to escalate is the right plan here; a routine
  handover is a complete answer, and must not be marked down for the absence of an
  urgency this case never had.

COMPETENT PASS (5-7) — Routed the patient correctly, documented adequately:
  Student reached the right destination for this encounter — escalated what genuinely
  needed escalating, or correctly left a routine patient on their routine pathway — and
  left a handover the next clinician can act on, but the documentation was sparse or the
  within-scope advice and safety-netting were brief. Stayed within role throughout.
  → Score 7. Competent and safe routing; a fuller handover separates it from a 9-10.

LOW SCORE (1-4) — Mis-routed, undocumented, or out of role:
  Student missed an escalation this case needed (a red flag routed as routine), or
  pushed a routine patient up as urgent, or left no clear handover/documentation for the
  next clinician, OR over-stepped by prescribing medication or starting treatment that
  is the doctor's decision.
  → Score 4. Wrong urgency, or no usable handover, or outside scope of practice.

VERY LOW SCORE (0-2) — No plan at all:
  Student ended the encounter with no handover, no documentation and no patient advice
  — nothing said about what happens next, either way.
  → Score 0. No recommendation attempted.
""",
}
