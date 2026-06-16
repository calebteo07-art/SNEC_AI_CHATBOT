from tools.cases.examination_actions import build_actions, FINDING_LABELS


def test_builds_action_per_finding_key():
    findings = {"va": {"right": "6/7.5", "left": "6/9"}, "iop": {"right": "18 mmHg", "left": "20 mmHg"}}
    steps = [
        {"step_number": 5, "action": "Perform distance VA with LogMAR chart"},
        {"step_number": 9, "action": "Measure IOP with non-contact tonometer, 3 readings"},
        {"step_number": 1, "action": "Introduce self to patient"},
    ]
    actions = build_actions(findings, steps)
    keys = {a["key"] for a in actions}
    assert keys == {"va", "iop"}
    va = next(a for a in actions if a["key"] == "va")
    assert va["label"] == FINDING_LABELS["va"]
    assert "6/7.5" in va["reveal_text"] and "6/9" in va["reveal_text"]
    assert 5 in va["satisfies_steps"]
    iop = next(a for a in actions if a["key"] == "iop")
    assert 9 in iop["satisfies_steps"]


def test_string_finding_value():
    actions = build_actions({"anterior_segment": "Normal bilaterally"}, [])
    assert actions[0]["reveal_text"] == "Normal bilaterally"
    assert actions[0]["satisfies_steps"] == []


def test_unknown_finding_key_gets_titlecase_label():
    actions = build_actions({"vital_signs": "BP 130/80"}, [])
    assert actions[0]["label"] == FINDING_LABELS["vital_signs"]
