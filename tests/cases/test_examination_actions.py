from tools.cases.examination_actions import build_actions, has_manual_actions

STEPS = [
    {"step_number": 1, "action": "Introduce self to patient", "category": "patient_education", "critical": False},
    {"step_number": 2, "action": "Identify the correct patient and check identity against 2 identifiers", "category": "patient_identification", "critical": True},
    {"step_number": 3, "action": "Performing 5 moments of hand hygiene", "category": "infection_control", "critical": True},
    {"step_number": 4, "action": "Before touching a patient", "category": "infection_control", "critical": True},
    {"step_number": 5, "action": "After touching a patient", "category": "infection_control", "critical": True},
    {"step_number": 6, "action": "Measure distance visual acuity with LogMAR", "category": "clinical_assessment", "critical": False},
    {"step_number": 7, "action": "Ask about patient complaints: Any trauma to the eye?", "category": "clinical_assessment", "critical": False},
]


def test_all_steps_still_covered_nothing_dropped():
    # build_actions still emits one (merged) action per step — the FRONTEND filters
    # to manual; the backend keeps the full set so the data model loses nothing.
    actions = build_actions({}, STEPS)
    covered = set()
    for a in actions:
        covered.update(a["satisfies_steps"])
    assert covered == {1, 2, 3, 4, 5, 6, 7}


def test_history_question_is_verbal_with_prompt():
    actions = build_actions({}, STEPS)
    ask = next(a for a in actions if a["mode"] == "say")
    assert ask["kind"] == "verbal"
    assert ask["prompt_text"] == "Any trauma to the eye?"
    assert 7 in ask["satisfies_steps"]


def test_conversational_do_steps_are_verbal():
    by_label = {a["label"]: a for a in build_actions({}, STEPS)}
    assert by_label["Introduce self"]["kind"] == "verbal"
    assert by_label["Identify patient"]["kind"] == "verbal"


def test_manual_procedures_are_manual():
    by_label = {a["label"]: a for a in build_actions({}, STEPS)}
    assert by_label["Hand hygiene"]["kind"] == "manual"
    assert by_label["Test distance VA"]["kind"] == "manual"


def test_hand_hygiene_steps_merge_into_one_manual_chip():
    actions = build_actions({}, STEPS)
    hh = next(a for a in actions if a["label"] == "Hand hygiene")
    assert set(hh["satisfies_steps"]) == {3, 4, 5}
    assert hh["kind"] == "manual"


def test_exam_step_reveals_finding_and_is_manual():
    actions = build_actions({"va": {"right": "6/9", "left": "6/12"}}, STEPS)
    va = next(a for a in actions if 6 in a["satisfies_steps"])
    assert "6/9" in va["reveal_text"] and "6/12" in va["reveal_text"]
    assert va["kind"] == "manual"


def test_unknown_do_step_defaults_to_verbal():
    # The action panel lists ONLY recognised hands-on procedures (ricoe C1: "only manual
    # ones"). An unrecognised step is not a known hands-on procedure, so it defaults to
    # verbal — no chip clutter, no generically-clipped label. It's still completable from
    # the checklist (tap the current row) and auto-ticks from the consult.
    actions = build_actions({}, [{"step_number": 9, "action": "Calibrate the widget array", "category": "equipment", "critical": False}])
    assert actions[0]["kind"] == "verbal"


def test_documentation_do_step_is_verbal_not_a_chip():
    # A "record/document" style step that isn't a recognised hands-on procedure must NOT
    # become a manual chip (ricoe C1: "talking / non-manual actions removed from the panel").
    actions = build_actions({}, [{"step_number": 3, "action": "Record readings in EMR", "category": "post_procedure", "critical": False}])
    assert actions[0]["kind"] == "verbal"


def test_blank_action_is_skipped():
    actions = build_actions({}, [{"step_number": 9, "action": "  ", "category": "clinical_", "critical": False}])
    assert actions == []


def test_has_manual_actions_true_for_procedure_steps():
    steps = [
        {"step_number": 1, "action": "Introduce yourself to the patient", "critical": False},
        {"step_number": 2, "action": "Measure IOP with the non-contact tonometer", "critical": True},
    ]
    assert has_manual_actions({}, steps) is True


def test_recurring_label_merges_even_when_not_consecutive():
    # ricoe C1 (duplicate buttons): a recurring procedure — hand hygiene BEFORE and
    # AFTER a step in between — must collapse to ONE chip, not two identical ones. The
    # gate ticks only the in-order run from the current step, so the single chip re-locks
    # until the later occurrence is reached (recurring-button UX).
    steps = [
        {"step_number": 1, "action": "Perform hand hygiene", "category": "infection_control", "critical": True},
        {"step_number": 2, "action": "Measure distance visual acuity with LogMAR", "category": "clinical_assessment", "critical": False},
        {"step_number": 3, "action": "Perform hand hygiene", "category": "infection_control", "critical": True},
    ]
    hh = [a for a in build_actions({}, steps) if a["label"] == "Hand hygiene"]
    assert len(hh) == 1
    assert set(hh[0]["satisfies_steps"]) == {1, 3}


def test_long_unknown_do_label_never_cuts_mid_word():
    # ricoe C1 (words cut off): an unknown long procedure must trim on a WORD boundary,
    # never mid-character — every word in the chip label is a whole word from the source.
    long_action = "Perform comprehensive ophthalmoscopic examination thoroughly"
    label = build_actions({}, [{"step_number": 1, "action": long_action, "category": "clinical", "critical": False}])[0]["label"]
    assert len(label) <= 34
    assert all(word in long_action.split() for word in label.split())


def test_clerical_manual_action_is_quick_no_typing():
    # ricoe C5: a mechanical confirmation (no assessable technique) ticks on one click —
    # marked quick so the UI skips procedure mode.
    disc = build_actions({}, [{"step_number": 1, "action": "Discard sharps into the waste bag", "category": "infection_control", "critical": False}])[0]
    assert disc["kind"] == "manual"
    assert disc["quick"] is True


def test_skill_procedure_still_requires_explanation():
    # A real technique (IOP, VA, slit-lamp…) is the assessment — must stay non-quick.
    iop = build_actions({}, [{"step_number": 1, "action": "Measure IOP with the non-contact tonometer", "category": "clinical", "critical": True}])[0]
    assert iop["kind"] == "manual"
    assert iop["quick"] is False


def test_verbal_action_is_never_quick():
    intro = next(a for a in build_actions({}, STEPS) if a["label"] == "Introduce self")
    assert intro["kind"] == "verbal"
    assert intro["quick"] is False


def test_has_manual_actions_false_for_all_verbal_steps():
    steps = [
        {"step_number": 1, "action": "Introduce yourself to the patient", "critical": True},
        {"step_number": 2, "action": "Ask the patient about onset and duration", "critical": False},
        {"step_number": 3, "action": "Take consent before proceeding", "critical": False},
    ]
    assert has_manual_actions({}, steps) is False
