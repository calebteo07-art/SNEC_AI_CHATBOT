"""Discipline (student role) -> case pool mapping for admin analytics.

The admin console slices cohort analytics by DISCIPLINE: `oa_psa` | `ot` | `all`.
`topic_sets.case_pool()` looks like the mapper for that job and is exactly wrong
here: it is `"OT" if (role or "").upper() == "OT" else "CLINICAL"`
(topic_sets.py:171-174), so None, "", "trainer", "admin" and every typo answer
"CLINICAL". Run over STUDENT roles it would file staff and unclassifiable
students into the oa_psa cohort and inflate its denominators.

So this module maps EXPLICITLY and fails closed: a role outside the known student
sets is EXCLUDED, and the caller reports the dropped rows as
`totals.unclassified_students` rather than defaulting them into a discipline.

Pool is resolved from the STUDENT, never from the case: `case_visible()` treats a
case authored `role: "any"` as visible to every pool (topic_sets.py:177-182), so
keying an attempt on the case's role would force such a case into one pool. No
shipped case uses "any" today — this keeps that latent hazard from becoming a
silent miscount later.

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

    None covers staff ("trainer"/"admin"), a blank role (staff carry student_role
    "" — auth.py:96), a missing column, and typos. Callers count those students as
    unclassified instead of defaulting them into a discipline.
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


def student_pools(profiles: list[dict]) -> dict[str, str]:
    """student_id -> pool over `db.get_active_profiles()` rows (D10: student-only,
    never get_active_leaderboard_profiles, which deliberately re-adds staff —
    db.py:282-293).

    Rows whose role does not resolve are OMITTED — their count is the caller's
    `totals.unclassified_students`. A row with no student_id is skipped too: it
    can be neither aggregated nor reported against. Keys are `str()`-normalised to
    match how db.py compares the same column (db.py:273-279).
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
