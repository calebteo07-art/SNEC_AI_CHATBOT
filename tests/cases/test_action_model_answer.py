"""Phase 16 / ricoe C6 — the OSCE action panel grades a typed technique against a
CRAFTED model answer in real time (deterministic), never a hardcoded "good job".

The model answer is drawn from the case's authored rubric (investigations
key_points) + the checklist step text, and grading is a deterministic keyword
overlap so it is instant, free and reliable (WAT: deterministic execution)."""

import pytest

from tools.cases.action_model_answer import craft_model_answer, grade_technique, grade_action


# A trimmed IOP/VA case fixture mirroring cases/case_oa_002_iop_va.json.
CASE = {
    "case_id": "case_x",
    "title": "Routine Glaucoma Follow-Up",
    "topic": "iop_va_measurement",
    "rubric": {
        "investigations": {
            "points": 10,
            "key_points": [
                "Performs distance VA using LogMAR chart at correct distance (4 metres)",
                "Records VA correctly using LogMAR notation (e.g. 0.1, 0.2)",
                "Performs near VA using N chart at 35cm",
                "Performs NCT correctly: explains to patient, takes 3 readings per eye, records average",
            ],
        },
    },
    "examination_findings": {"iop": {"right": "18 mmHg", "left": "20 mmHg"}},
}

IOP_STEPS = [
    {"step_number": 7, "action": "Measure IOP using non-contact tonometer", "critical": False},
]


# ── craft_model_answer ──────────────────────────────────────────────────────

def test_model_answer_for_iop_selects_the_nct_rubric_point():
    points = craft_model_answer(CASE, "Measure IOP", [7], IOP_STEPS)
    joined = " ".join(points).lower()
    assert "nct" in joined or "readings" in joined
    # It must NOT dump unrelated near-VA / distance-VA points for an IOP action.
    assert not any("n chart" in p.lower() for p in points)


def test_model_answer_for_distance_va_selects_logmar_points():
    points = craft_model_answer(CASE, "Test distance VA", [3], [
        {"step_number": 3, "action": "Measure distance visual acuity with LogMAR chart", "critical": False},
    ])
    joined = " ".join(points).lower()
    assert "logmar" in joined
    assert points, "distance VA must resolve at least one model-answer point"


def test_model_answer_falls_back_to_checklist_step_when_no_rubric_match():
    # A hand-hygiene chip has no investigations rubric point → use the step text.
    steps = [{"step_number": 2, "action": "Perform the 5 moments of hand hygiene", "critical": True}]
    points = craft_model_answer({"rubric": {}}, "Hand hygiene", [2], steps)
    assert points
    assert any("hand" in p.lower() for p in points)


def test_hand_hygiene_model_answer_is_the_moh_seven_steps():
    # Regression (ricoe: "hand hygiene answer is wrong — should be the MOH 7 steps"). The
    # checklist rows only say WHEN to clean (the 5 moments); the graded TECHNIQUE is the
    # 7-step handrub, independent of the case's checklist text.
    points = craft_model_answer(
        {"rubric": {}}, "Hand hygiene", [3, 4, 5],
        [{"step_number": 3, "action": "Performing 5 moments of hand hygiene", "critical": True}],
    )
    assert len(points) == 7
    joined = " ".join(points).lower()
    assert "palm to palm" in joined
    assert "interlaced" in joined
    assert "thumb" in joined


def test_model_answer_is_never_empty():
    points = craft_model_answer({}, "Some Novel Procedure", [99], [])
    assert points, "must always return a non-empty reference so there is something to grade against"


# ── grade_technique ─────────────────────────────────────────────────────────

MODEL = [
    "Performs NCT correctly: explains to patient, takes 3 readings per eye, records average",
    "Records the reading accurately in the patient record",
]


def test_thorough_technique_is_strong_and_covers_points():
    technique = ("I explained the NCT to the patient, took 3 readings per eye, "
                 "recorded the average, and documented the reading in the record.")
    g = grade_technique(MODEL, technique)
    assert g["verdict"] == "strong"
    assert len(g["covered"]) == 2
    assert g["missing"] == []


def test_generic_technique_is_not_rewarded_as_good_job():
    g = grade_technique(MODEL, "I did the pressure test.")
    assert g["verdict"] in ("developing", "partial")
    # The distinctive NCT technique point must be flagged as missing, not praised.
    assert any("nct" in m.lower() or "readings" in m.lower() for m in g["missing"])


def test_partial_technique_lists_both_covered_and_missing():
    g = grade_technique(MODEL, "I explained it to the patient and took 3 readings per eye and averaged them.")
    assert g["verdict"] == "partial"
    assert g["covered"], "the NCT point should be covered"
    assert g["missing"], "the documentation point should be missing"


def test_empty_technique_is_developing():
    g = grade_technique(MODEL, "")
    assert g["verdict"] == "developing"
    assert g["covered"] == []


# ── Leniency: a competent answer, not a recitation ──────────────────────────
# User-reported: "some procedures that require steps are too strict and hard (eg: not
# realistic for student to list down all 7 steps of hand hygiene, so if student just types
# something like 7 steps hand hygiene they should be able to get the full marks)".

HYGIENE = craft_model_answer({}, "Hand hygiene", [1], [])


def test_the_hand_hygiene_model_answer_is_the_seven_step_standard():
    # The premise of everything below: this is a long, fixed, NAMED protocol.
    assert len(HYGIENE) == 7


@pytest.mark.parametrize("technique", [
    "7 steps of hand hygiene",
    "I performed the 7 steps hand hygiene",
    "Performed the seven-step handrub for 20 seconds",
    "MOH 7 steps of handrub before touching the patient",
])
def test_naming_the_standard_earns_full_marks(technique):
    """Naming the protocol is competence. Retyping all seven steps is typing."""
    g = grade_technique(HYGIENE, technique, "Hand hygiene")
    assert g["verdict"] == "strong", technique
    assert g["missing"] == [], technique


def test_naming_the_standard_does_not_rescue_an_unrelated_procedure():
    """Only a CURATED standard can be claimed by name. A case-specific model answer has no
    name to invoke, so "7 steps" must not become a universal skeleton key."""
    g = grade_technique(MODEL, "I did the 7 steps", "Measure IOP")
    assert g["verdict"] != "strong"


def test_describing_most_of_the_standard_is_competent():
    """Five of the seven, in the student's own words — a pass, and the coaching line still
    names what is outstanding rather than claiming full coverage."""
    technique = ("Rubbed palm to palm, then right palm over the back of the left hand with "
                 "fingers interlaced and swapped, palm to palm with fingers interlaced, "
                 "backs of the fingers to opposing palms interlocked, then each thumb "
                 "clasped and rotated in the opposite palm.")
    g = grade_technique(HYGIENE, technique, "Hand hygiene")
    assert g["verdict"] == "strong"
    assert len(g["covered"]) >= 5


def test_a_bare_claim_is_still_not_a_technique():
    """Leniency must not dissolve the bottom of the scale (the 40/30/30 acceptance rule)."""
    for technique in ("I washed my hands.", "I did hand hygiene properly.", ""):
        g = grade_technique(HYGIENE, technique, "Hand hygiene")
        assert g["verdict"] != "strong", technique


def test_step_numbering_is_not_counted_as_content():
    """"Step 4:" is scaffolding for the reader. Counting "step" and "4" as salient made
    every point of a numbered protocol two tokens harder to cover than it should be."""
    point = "Step 5: Rotational rubbing of each thumb clasped in the opposite palm."
    g = grade_technique([point], "rotational rubbing of each thumb clasped in the opposite palm")
    assert g["verdict"] == "strong"
    # …and the scaffolding alone earns nothing.
    assert grade_technique([point], "step 5")["verdict"] == "developing"


# ── grade_action (end to end, deterministic) ────────────────────────────────

def test_grade_action_returns_structured_grade_without_ai():
    out = grade_action(
        CASE, "Measure IOP", [7], IOP_STEPS,
        technique="I explained the NCT, took 3 readings per eye and recorded the average.",
    )
    assert out["verdict"] in ("strong", "partial", "developing")
    assert out["model_answer"], "the crafted model answer must be surfaced to the learner"
    assert isinstance(out["covered"], list) and isinstance(out["missing"], list)
    # The coaching line must be grounded, never a hardcoded 'good job'.
    assert "good job" not in out["coaching"].lower()
