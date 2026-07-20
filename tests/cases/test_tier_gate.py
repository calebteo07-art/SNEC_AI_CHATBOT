# tests/cases/test_tier_gate.py
"""Unit tests for the per-topic difficulty-unlock model (tools/cases/tier_gate.py).

Model (2026-07-20): a Developing case in topic T unlocks once the student has completed
min(2, #Foundational in T) Foundational cases IN T (or, when T has no Foundational case,
any 3 cases in any topic). Advanced mirrors it over Developing. "Complete" = any attempt.
"""
from tools.cases.tier_gate import build_census, evaluate, ANY_TOPIC_FALLBACK


def test_foundational_is_never_locked():
    census = build_census([("visual_acuity", "beginner", False)])
    assert evaluate("beginner", "visual_acuity", census) == (False, "")


def test_unknown_difficulty_is_open():
    assert evaluate("expert", "whatever", build_census([])) == (False, "")


def test_developing_locked_until_two_foundational_in_same_topic():
    items = [("red_eye", "beginner", False)] * 3 + [("red_eye", "intermediate", False)]
    locked, hint = evaluate("intermediate", "red_eye", build_census(items))
    assert locked is True
    assert hint == "Complete 2 Foundational cases in this topic to unlock."


def test_developing_unlocked_by_two_foundational_completed_in_topic():
    items = [
        ("red_eye", "beginner", True), ("red_eye", "beginner", True),
        ("red_eye", "beginner", False), ("red_eye", "intermediate", False),
    ]
    assert evaluate("intermediate", "red_eye", build_census(items)) == (False, "")


def test_foundational_completed_in_another_topic_does_not_count():
    items = [
        ("visual_acuity", "beginner", True), ("visual_acuity", "beginner", True),
        ("red_eye", "beginner", False), ("red_eye", "beginner", False),
        ("red_eye", "intermediate", False),
    ]
    locked, hint = evaluate("intermediate", "red_eye", build_census(items))
    assert locked is True
    assert "this topic" in hint


def test_one_foundational_topic_requires_only_that_one():
    locked, hint = evaluate(
        "intermediate", "history_taking",
        build_census([("history_taking", "beginner", False), ("history_taking", "intermediate", False)]),
    )
    assert locked is True
    assert hint == "Complete 1 Foundational case in this topic to unlock."
    done = build_census([("history_taking", "beginner", True), ("history_taking", "intermediate", False)])
    assert evaluate("intermediate", "history_taking", done) == (False, "")


def test_no_foundational_topic_developing_uses_any_three_fallback():
    items = (
        [("ocular_emergencies", "intermediate", False)]
        + [("ocular_emergencies", "advanced", False)] * 9
        + [("visual_acuity", "beginner", True), ("visual_acuity", "beginner", True)]  # 2 done < 3
    )
    locked, hint = evaluate("intermediate", "ocular_emergencies", build_census(items))
    assert locked is True
    assert hint == "Complete any 3 cases in any topic to unlock."
    assert evaluate(  # a 3rd completion anywhere unlocks it
        "intermediate", "ocular_emergencies",
        build_census(items + [("visual_acuity", "beginner", True)]),
    ) == (False, "")


def test_advanced_locked_until_two_developing_in_same_topic():
    items = [("triage_referral", "intermediate", False)] * 4 + [("triage_referral", "advanced", False)] * 4
    locked, hint = evaluate("advanced", "triage_referral", build_census(items))
    assert locked is True
    assert hint == "Complete 2 Developing cases in this topic to unlock."
    done = build_census(
        [("triage_referral", "intermediate", True), ("triage_referral", "intermediate", True),
         ("triage_referral", "intermediate", False)] + [("triage_referral", "advanced", False)] * 4
    )
    assert evaluate("advanced", "triage_referral", done) == (False, "")


def test_advanced_one_developing_topic_requires_only_that_one():
    open_items = [("ocular_emergencies", "intermediate", True)] + [("ocular_emergencies", "advanced", False)] * 9
    assert evaluate("advanced", "ocular_emergencies", build_census(open_items)) == (False, "")
    locked, hint = evaluate(
        "advanced", "ocular_emergencies",
        build_census([("ocular_emergencies", "intermediate", False)] + [("ocular_emergencies", "advanced", False)] * 9),
    )
    assert locked is True
    assert hint == "Complete 1 Developing case in this topic to unlock."


def test_advanced_no_developing_topic_uses_any_three_fallback():
    items = [
        ("biometry", "beginner", True), ("biometry", "beginner", True),
        ("biometry", "beginner", False), ("biometry", "beginner", False),
        ("biometry", "advanced", False),
    ]  # total completed = 2 < 3
    locked, hint = evaluate("advanced", "biometry", build_census(items))
    assert locked is True
    assert hint == "Complete any 3 cases in any topic to unlock."
    assert evaluate(
        "advanced", "biometry", build_census(items + [("orthoptics", "beginner", True)]),
    ) == (False, "")


def test_any_topic_fallback_threshold_is_three():
    assert ANY_TOPIC_FALLBACK == 3
