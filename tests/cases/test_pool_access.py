"""Regression: the case gate must check the student's ROLE POOL, not only the tier.

`_check_case_access` enforced difficulty and nothing else, and it returned early for
beginner cases before reading anything at all. `case_visible` — the predicate the case
LIST uses to bucket content by role — was imported into the same module and applied to
the list, to the topics count, and to the census loop *inside* the gate, but never to the
target case. So an OA/PSA student who navigated to an OT case id got the station served,
graded, paid and persisted against content their roster says they should never see. 15 of
the 54 OT cases are beginner, so this needed no progress at all to reach.

Every station route funnels through this one function (`/station`, `/observe`, `/action`,
`/chat`, `/submit`), which is why the gap was uniform.

404, not 403: a case outside the student's pool should not be enumerable. 403 confirms
the id exists and tells them what they're missing; the tier gate's 403 is different
because a locked case IS theirs, just not yet.

Staff keep full access — a trainer previewing an OT station is the feature working.
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from tools.api.routers.cases import _check_case_access
from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

_OT_BEGINNER = {
    "case_id": "case_ot_pool", "title": "A-scan biometry", "difficulty": "beginner",
    "topic": "ascan_biometry", "role": "OT", "estimated_minutes": 12,
    "patient": {"name": "Mdm Lee", "age": 68, "presenting_complaint": "pre-op"},
    "examination_findings": {}, "rubric": {},
}
_OA_BEGINNER = {**_OT_BEGINNER, "case_id": "case_oa_pool", "role": "OA",
                "topic": "history_triage"}


@pytest.mark.asyncio
async def test_a_beginner_case_outside_the_pool_is_404_for_a_student():
    with pytest.raises(HTTPException) as exc:
        await _check_case_access("stu-1", _OT_BEGINNER, "OA")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_a_case_inside_the_pool_still_passes():
    await _check_case_access("stu-1", _OA_BEGINNER, "OA")  # must not raise


@pytest.mark.asyncio
async def test_psa_shares_the_oa_pool():
    """OA and PSA are one content pool (only the job title differs), so this must pass."""
    await _check_case_access("stu-1", _OA_BEGINNER, "PSA")


@pytest.mark.asyncio
async def test_a_role_neutral_case_is_open_to_everyone():
    await _check_case_access("stu-1", {**_OT_BEGINNER, "role": "any"}, "OA")


@pytest.mark.asyncio
async def test_staff_keep_cross_pool_access():
    """A trainer previewing an OT station is the feature working, not a leak."""
    await _check_case_access("staff-1", _OT_BEGINNER, "OA", account_role="trainer")
    await _check_case_access("staff-1", _OT_BEGINNER, "OA", account_role="admin")


def test_the_station_route_refuses_an_out_of_pool_case():
    """End-to-end through the real route, so the gate can't be correct in isolation only."""
    with patch.dict("tools.api.shared._case_cache", {"case_ot_pool": _OT_BEGINNER},
                    clear=False), \
         patch("tools.api.routers.cases.load_case", return_value=_OT_BEGINNER), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.shared.db.get_profile", new=AsyncMock(return_value={"role": "OA"})):
        r = TestClient(app).get(
            "/api/cases/case_ot_pool/station",
            cookies={"eyebot_token": create_access_token("stu-1", "student", "OA")},
        )
    assert r.status_code == 404, r.text
