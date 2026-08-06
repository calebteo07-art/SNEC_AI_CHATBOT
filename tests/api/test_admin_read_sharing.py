"""One read of each cohort-wide table serves every admin consumer inside the TTL.

/api/admin/cohort-analytics and /api/admin/student/{id}/detail each read
get_active_student_profiles + get_all_case_scores + get_all_flashcard_attempts, and the
detail endpoint had no cache at all while its query background-refetches
(frontend/src/hooks/useAdmin.ts:9). A trainer reviewing ten students cost ~60 whole-table
scans on Render's SINGLE worker, against flashcard_attempts — the highest-volume table.

This is the only file that exercises the read cache THROUGH the endpoints, so it is the
only one that does not disable it.
"""
import contextlib
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

_PROFILES = [{"student_id": "s1", "role": "OA", "retention_scores": {"red_eye": 0.8}}]
_CASES = [{"student_id": "s1", "case_id": "c1", "score_100": 90, "passed": True, "safe": True}]
_CARDS = [{"student_id": "s1", "topic_tag": "red_eye", "correct": True}]


def _cookies():
    # Unique sub per test FILE: slowapi keys the per-minute buckets on the JWT sub, so a
    # shared sub would let another file's requests rate-limit these.
    return {"eyebot_token": create_access_token("stu_read_sharing", "admin", "OA")}


def _shared_read_stubs(profiles_read, cases_read, cards_read):
    """Every db call BOTH endpoints make. Leaving one unstubbed reaches live production
    Supabase (tests/conftest.py::_forbid_real_supabase)."""
    return [
        patch("tools.shared.db.get_active_student_profiles", new=profiles_read),
        patch("tools.shared.db.get_all_case_scores", new=cases_read),
        patch("tools.shared.db.get_all_flashcard_attempts", new=cards_read),
        # Per-student reads for the detail endpoint — deliberately NOT cached.
        patch("tools.api.routers.admin.get_profile",
              new=AsyncMock(return_value={"student_id": "s1", "role": "OA",
                                          "retention_scores": {"red_eye": 0.8}})),
        patch("tools.shared.db.get_consent_by_student_id",
              new=AsyncMock(return_value={"student_name": "A B", "email": "a@b.c"})),
        patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=list(_CASES))),
        patch("tools.shared.db.get_flashcard_attempts", new=AsyncMock(return_value=[])),
        # /cohort-analytics globs 155 case files for its index; stand it in.
        patch("tools.api.routers.admin.get_case_index", new=AsyncMock(return_value={})),
    ]


def test_one_scan_serves_both_endpoints_inside_the_ttl():
    profiles_read = AsyncMock(return_value=(_PROFILES, 0))
    cases_read = AsyncMock(return_value=(_CASES, True))
    cards_read = AsyncMock(return_value=(_CARDS, True))
    with contextlib.ExitStack() as es:
        for p in _shared_read_stubs(profiles_read, cases_read, cards_read):
            es.enter_context(p)
        a = client.get("/api/admin/cohort-analytics?discipline=all&days=90", cookies=_cookies())
        b = client.get("/api/admin/student/s1/detail", cookies=_cookies())
    assert a.status_code == 200 and b.status_code == 200
    assert profiles_read.await_count == 1
    assert cases_read.await_count == 1
    assert cards_read.await_count == 1, "flashcard_attempts is the highest-volume table"


def test_walking_students_does_not_rescan_per_student():
    # The reported shape: a trainer opening ten students in a row. The rows are identical
    # for every student, so they must be read once, not once per click.
    profiles_read = AsyncMock(return_value=(_PROFILES, 0))
    cases_read = AsyncMock(return_value=(_CASES, True))
    cards_read = AsyncMock(return_value=(_CARDS, True))
    with contextlib.ExitStack() as es:
        for p in _shared_read_stubs(profiles_read, cases_read, cards_read):
            es.enter_context(p)
        for i in range(10):
            assert client.get(f"/api/admin/student/s{i}/detail",
                              cookies=_cookies()).status_code == 200
    assert cards_read.await_count == 1, "ten students cost ten scans of the biggest table"
