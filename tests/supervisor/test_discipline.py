"""Discipline mapping must fail closed on any role that isn't a known student role.

`topic_sets.case_pool()` is the tempting mapper and it is the defect: it returns
"CLINICAL" for None, "", "trainer", "admin" and every typo (topic_sets.py:171-174).
Pointed at a STUDENT role it silently files every unclassifiable student into the
oa_psa cohort — inflating exactly the denominators P2 exists to make honest.

These tests pin three things: the query literal -> pool map (with a raise, not a
default, on an unknown literal so the endpoint can answer 400), the
excluded-not-defaulted rule for unresolvable roles, and the guarantee that an
unrecognised role literal never inherits a default pool.

They deliberately do NOT claim staff are excluded. `student_profiles.role` holds only
"OA"/"OT"/"PSA" or "" — the two validated writers accept exactly that set
(auth.py:340-343, student.py:145-149) and profile creation seeds it blank
(tools/profile/get_profile.py:23-24,66) — so the "trainer"/"admin" literals below are
JWT/`supervisors` vocabulary that never actually reaches this column. A staff member
who used the staff-only pool toggle (student.py:143) carries a genuine "OA"/"OT" that
this module classifies as a student. Staff exclusion is a supervisors-membership test
owned by whoever assembles the population.
"""
import pytest

from tools.cases.topic_sets import case_pool
from tools.supervisor.discipline import (
    DISCIPLINES,
    discipline_to_pool,
    pool_by_student,
    pool_for_student_role,
)


def test_discipline_param_maps_to_pool():
    assert DISCIPLINES == ("oa_psa", "ot", "all")
    assert discipline_to_pool("oa_psa") == "CLINICAL"
    assert discipline_to_pool("ot") == "OT"
    # "all" means "do not filter", NOT a third pool. If this ever returned a string
    # the aggregators would filter every attempt out and the all-disciplines view
    # would render empty rather than complete.
    assert discipline_to_pool("all") is None
    # Query strings arrive however the client typed them; normalise case/whitespace
    # rather than 400 on a cosmetic difference.
    assert discipline_to_pool("  OA_PSA  ") == "CLINICAL"
    # Everything else raises, so the endpoint answers 400 instead of quietly
    # serving one slice under an unrecognised name. Note the CODE literals
    # ("CLINICAL"/"OT") are not accepted as QUERY literals — the two namespaces
    # stay separate.
    for bad in ("", "clinical", "CLINICAL", "oa", "psa", "everyone", "oa_psa_ot"):
        with pytest.raises(ValueError):
            discipline_to_pool(bad)


def test_unknown_role_excluded_from_pool_map():
    profiles = [
        {"student_id": "s_oa", "role": "OA"},
        {"student_id": "s_psa", "role": "psa"},       # stored lowercase
        {"student_id": "s_ot", "role": " OT "},       # stray whitespace
        {"student_id": "s_blank", "role": ""},
        {"student_id": "s_none", "role": None},
        {"student_id": "s_missing"},                  # column absent entirely
        {"student_id": "s_typo", "role": "O A"},
        {"role": "OA"},                               # no student_id at all
    ]
    pools = pool_by_student(profiles)
    assert pools == {"s_oa": "CLINICAL", "s_psa": "CLINICAL", "s_ot": "OT"}
    # The five dropped rows become the endpoint's `totals.unclassified_students`.
    # They must be COUNTABLE by their absence, not absorbed into CLINICAL the way
    # case_pool() would absorb every one of them.
    assert len(profiles) - len(pools) == 5


def test_unrecognised_role_literal_never_defaults_into_a_pool():
    # The precise defect this module exists to prevent: case_pool() answers
    # "CLINICAL" for all of these, so mapping a student's discipline through it
    # would file every unset or unrecognised role into oa_psa.
    for unknown_role in ("trainer", "admin", "supervisor", "student", ""):
        assert case_pool(unknown_role) == "CLINICAL"
        assert pool_for_student_role(unknown_role) is None

    # These literals are JWT/`supervisors` vocabulary — they do NOT appear in
    # student_profiles.role, which holds only OA/OT/PSA or "". So this pins the
    # no-default rule, NOT a staff guarantee: a real trainer's profile row carries a
    # genuine "OA"/"OT" (the staff-only pool toggle, student.py:143) and IS classified
    # here. Staff must be subtracted by supervisors membership before this runs.
    unresolvable = [
        {"student_id": "sup1", "role": "trainer"},
        {"student_id": "sup2", "role": "admin"},
    ]
    assert pool_by_student(unresolvable) == {}

    # ...and the real student roles still resolve, so the guard isn't over-broad.
    assert pool_for_student_role("OA") == "CLINICAL"
    assert pool_for_student_role("PSA") == "CLINICAL"
    assert pool_for_student_role("OT") == "OT"
