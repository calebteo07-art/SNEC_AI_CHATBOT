from tools.cases.examination_actions import build_actions

STEPS = [
    {"step_number": 1, "action": "Introduce self to patient", "category": "patient_education", "critical": False},
    {"step_number": 2, "action": "Identify the correct patient and check identity against 2 identifiers", "category": "patient_identification", "critical": True},
    {"step_number": 3, "action": "Performing 5 moments of hand hygiene", "category": "infection_control", "critical": True},
    {"step_number": 4, "action": "Before touching a patient", "category": "infection_control", "critical": True},
    {"step_number": 5, "action": "After touching a patient", "category": "infection_control", "critical": True},
    {"step_number": 6, "action": "Measure distance visual acuity with LogMAR", "category": "clinical_assessment", "critical": False},
    {"step_number": 7, "action": "Ask about patient complaints: Any trauma to the eye?", "category": "clinical_assessment", "critical": False},
]


def test_every_step_becomes_a_chip_nothing_missing():
    actions = build_actions({}, STEPS)
    covered = set()
    for a in actions:
        covered.update(a["satisfies_steps"])
    assert covered == {1, 2, 3, 4, 5, 6, 7}


def test_consecutive_same_label_steps_merge():
    actions = build_actions({}, STEPS)
    hh = next(a for a in actions if a["label"] == "Hand hygiene")
    # The "5 moments" parent + its two sub-rows collapse into one chip.
    assert set(hh["satisfies_steps"]) == {3, 4, 5}
    assert hh["mode"] == "do"


def test_process_steps_are_clickable_do_chips():
    actions = build_actions({}, STEPS)
    labels = {a["label"] for a in actions}
    assert "Introduce self" in labels
    assert "Identify patient" in labels


def test_history_question_is_a_say_chip_with_prompt():
    actions = build_actions({}, STEPS)
    ask = next(a for a in actions if a["mode"] == "say")
    assert ask["prompt_text"] == "Any trauma to the eye?"
    assert 7 in ask["satisfies_steps"]


def test_exam_step_reveals_its_finding():
    actions = build_actions({"va": {"right": "6/9", "left": "6/12"}}, STEPS)
    va = next(a for a in actions if 6 in a["satisfies_steps"])
    assert "6/9" in va["reveal_text"] and "6/12" in va["reveal_text"]


def test_blank_action_is_skipped():
    actions = build_actions({}, [{"step_number": 9, "action": "  ", "category": "clinical_", "critical": False}])
    assert actions == []
