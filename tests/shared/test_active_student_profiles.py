"""Staff must be subtracted from the analytics population by MEMBERSHIP, not role.

get_active_profiles() filters on approved_students membership alone (db.py:274-288).
A promoted trainer keeps their approved_students row (admin.py:290-301) and the
genuine "OA"/"OT" that the staff-only pool toggle writes (student.py:143), so cohort
denominators count them as a student forever. Task 5's pool_for_student_role() cannot
see this — "trainer"/"admin" never appear in student_profiles.role.
"""
from contextlib import ExitStack, contextmanager
from unittest.mock import AsyncMock, patch

import pytest

import tools.shared.db as db

_PROFILES = [
    {"student_id": "s1", "role": "OA"},
    {"student_id": "s2", "role": "OT"},
    {"student_id": "trainer1", "role": "OA"},   # promoted; still roster-approved
    {"student_id": "boss", "role": "OT"},       # super-admin, no supervisors row
]
_CONSENT = [
    {"student_id": "s1", "email": "a@x.edu"},
    {"student_id": "s2", "email": "b@x.edu"},
    {"student_id": "trainer1", "email": "  Trainer@X.edu  "},  # stray case/space
    {"student_id": "boss", "email": "boss@x.edu"},
]


@contextmanager
def _patched(*, supervisors=(), super_admin="", supervisors_error=None):
    """Yields the get_active_profiles mock so a test can prove it was COMPOSED."""
    sup = (AsyncMock(side_effect=supervisors_error) if supervisors_error
           else AsyncMock(return_value=list(supervisors)))
    active = AsyncMock(return_value=list(_PROFILES))
    with ExitStack() as stack:
        for name, mock in (
            ("get_active_profiles", active),
            ("get_all_consent", AsyncMock(return_value=list(_CONSENT))),
            ("get_all_supervisors", sup),
            ("super_admin_email", lambda: super_admin),
        ):
            stack.enter_context(patch.object(db, name, new=mock))
        yield active


@pytest.mark.asyncio
async def test_promoted_trainer_is_subtracted_from_the_cohort():
    with _patched(supervisors=[{"email": "trainer@x.edu", "role": "trainer"}]) as active_read:
        students, excluded = await db.get_active_student_profiles()
    # trainer1's consent email is "  Trainer@X.edu  ": email folding must match how
    # db.py compares emails everywhere else (.strip().lower()), or this row silently
    # survives and the trainer is counted as an OA student forever.
    assert [p["student_id"] for p in students] == ["s1", "s2", "boss"]
    assert excluded == 1
    # The stated design is COMPOSE, don't inline (see the amendment). Without this the
    # whole suite passes over a hand-copied fourth active-student filter that drifts
    # from get_active_profiles the first time the roster rule changes.
    assert active_read.await_count == 1


@pytest.mark.asyncio
async def test_super_admin_is_subtracted_even_without_a_supervisors_row():
    with _patched(supervisors=[], super_admin="boss@x.edu"):
        students, excluded = await db.get_active_student_profiles()
    assert [p["student_id"] for p in students] == ["s1", "s2", "trainer1"]
    assert excluded == 1


@pytest.mark.asyncio
async def test_no_staff_means_nothing_is_dropped():
    with _patched(supervisors=[], super_admin=""):
        students, excluded = await db.get_active_student_profiles()
    assert len(students) == 4
    assert excluded == 0


@pytest.mark.asyncio
async def test_supervisors_that_match_no_consent_row_drop_nobody():
    """The KEEP side of the email fold. test_no_staff_means_nothing_is_dropped exits at
    the `if not staff_emails` short-circuit and never reaches the consent join, so it
    cannot catch a folding regression that over-matches. Here supervisors exist, so the
    join actually runs — and must subtract nobody."""
    with _patched(supervisors=[{"email": "nobody@x.edu", "role": "trainer"}]):
        students, excluded = await db.get_active_student_profiles()
    assert [p["student_id"] for p in students] == ["s1", "s2", "trainer1", "boss"]
    assert excluded == 0


@pytest.mark.asyncio
async def test_supervisors_read_failure_raises_rather_than_inflating():
    """Failing OPEN here would silently restore the exact bug this function fixes —
    an unfiltered cohort reported as if it were filtered. So it RAISES, and the cohort
    endpoint 500s on it: Task 9's population read has no per-source degrade, by
    decision. A legible 500 beats an inflated denominator that looks correct."""
    with _patched(supervisors_error=RuntimeError("supervisors read failed")):
        with pytest.raises(RuntimeError, match="supervisors read failed"):
            await db.get_active_student_profiles()
