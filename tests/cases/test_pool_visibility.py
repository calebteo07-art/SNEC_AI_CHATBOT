from tools.cases.topic_sets import case_pool, case_visible, sets_for, resolve_set


def test_case_pool_maps_oa_psa_together():
    assert case_pool("OA") == "CLINICAL"
    assert case_pool("PSA") == "CLINICAL"
    assert case_pool("OT") == "OT"


def test_oa_and_psa_share_one_taxonomy():
    assert sets_for("OA") == sets_for("PSA")
    keys = {k for k, _ in sets_for("OA")}
    assert {"perioperative", "triage_referral"} <= keys  # union of both old sets


def test_case_visible_by_pool():
    assert case_visible("PSA", "OA") is True    # OA-authored case shown to PSA
    assert case_visible("OA", "PSA") is True
    assert case_visible("OT", "OA") is False
    assert case_visible("OA", "any") is True


def test_resolve_set_is_pool_consistent():
    # OA and PSA bucket the same topic into the same set
    assert resolve_set("OA", "triage_floaters_flashes") == resolve_set("PSA", "triage_floaters_flashes")
    assert resolve_set("OA", "triage_floaters_flashes") == "triage_referral"
