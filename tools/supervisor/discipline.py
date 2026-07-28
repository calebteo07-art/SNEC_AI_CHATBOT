"""Discipline (student role) -> case pool mapping for admin analytics.

The admin console slices cohort analytics by DISCIPLINE: `oa_psa` | `ot` | `all`.
`topic_sets.case_pool()` looks like the mapper for that job and is exactly wrong
here: it is `"OT" if (role or "").upper() == "OT" else "CLINICAL"`, so None, "",
"trainer", "admin" and every typo answer "CLINICAL". Run over STUDENT roles it
would file every unclassifiable student into the oa_psa cohort and inflate its
denominators.

So this module maps EXPLICITLY and fails closed: a role outside the known student
sets is EXCLUDED, and the caller reports the dropped rows as
`totals.unclassified_students` rather than defaulting them into a discipline.

Pool is resolved from the STUDENT, never from the case: `case_visible()` treats a
case authored `role: "any"` as visible to every pool, so keying an attempt on the
case's role would force such a case into one pool. No shipped case uses "any"
today — this keeps that latent hazard from becoming a silent miscount later.

WHAT THIS MODULE DOES NOT DO IS EXCLUDE STAFF, despite the tempting reading of
`pool_for_student_role`. `student_profiles.role` holds only "OA"/"OT"/"PSA" or "":
the two validated writers (onboarding in `auth.py`, and `PATCH /api/profile/role`)
accept exactly that set, and profile creation seeds it blank
(`tools/profile/get_profile.py`). "trainer"/"admin" belong to a DIFFERENT
vocabulary — the JWT `role` claim and the `supervisors` table — and never reach
this column. Worse, `PATCH /api/profile/role` is the staff-only content-pool
toggle, so a staff-owned profile row is the one MOST likely to carry a genuine
"OA"/"OT", which this module will classify as a student.

Staff is a MEMBERSHIP property, not a role. Excluding them therefore belongs to
whoever assembles the population, by subtracting `supervisors` membership (plus
SUPER_ADMIN_EMAIL, who is staff without a supervisors row). Do not assume
`db.get_active_profiles()` has done it: that filters on approved_students
membership alone, and promotion leaves the promoted student's approved_students
row in place, so a promoted trainer stays in the population carrying a real
student role.

Pure: no I/O, no state, no event-loop concerns.
"""
from __future__ import annotations

# Query literal -> pool filter. `all` maps to None, meaning "do not filter".
# Insertion order is the console's switcher order and defines DISCIPLINES below,
# so the accepted literals and the lookup table can never drift apart.
_POOL_BY_DISCIPLINE: dict[str, str | None] = {
    "oa_psa": "CLINICAL",
    "ot": "OT",
    "all": None,
}

DISCIPLINES: tuple[str, ...] = tuple(_POOL_BY_DISCIPLINE)

# Student role -> pool, as explicit membership sets. Deliberately NOT an
# `else CLINICAL` branch: an unrecognised role must fall out of the mapping, not
# inherit a default. This is the whole point of the module.
_OA_PSA_ROLES = frozenset({"OA", "PSA"})
_OT_ROLES = frozenset({"OT"})


def pool_for_student_role(role: str | None) -> str | None:
    """The case pool a STUDENT's role studies, or None when the role is unknown.

    None covers a blank or absent role (the value profile creation seeds) and every
    typo. Callers count those rows as unclassified instead of defaulting them into
    a discipline.

    This does NOT identify staff — see the module docstring. A real trainer's
    profile row carries a genuine "OA"/"OT" and is classified here as a student.
    """
    key = (role or "").strip().upper()
    if key in _OA_PSA_ROLES:
        return "CLINICAL"
    if key in _OT_ROLES:
        return "OT"
    return None


def discipline_to_pool(discipline: str) -> str | None:
    """Query literal -> pool filter; `all` -> None (no filter).

    Raises ValueError on an unknown literal so the endpoint can answer 400 rather
    than silently serving one discipline's slice under an unrecognised name.
    """
    key = (discipline or "").strip().lower()
    if key not in _POOL_BY_DISCIPLINE:
        raise ValueError(f"unknown discipline: {discipline!r}")
    return _POOL_BY_DISCIPLINE[key]


def pool_by_student(profiles: list[dict]) -> dict[str, str]:
    """student_id -> pool, over an already-assembled population of profile rows.

    Rows whose role does not resolve are OMITTED — their count is the caller's
    `totals.unclassified_students`. A row with no student_id is skipped too: it
    can be neither aggregated nor reported against. Keys are `str()`-normalised to
    match how db.py compares the same column.

    Pass a STAFF-FREE population (see the module docstring); this function cannot
    tell a trainer from a student.
    """
    pools: dict[str, str] = {}
    for p in profiles:
        sid = str(p.get("student_id") or "")
        if not sid:
            continue
        pool = pool_for_student_role(p.get("role"))
        if pool is None:
            continue
        pools[sid] = pool
    return pools
