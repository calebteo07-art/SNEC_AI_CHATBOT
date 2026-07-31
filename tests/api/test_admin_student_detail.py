"""GET /api/admin/student/{id}/detail — mastery block and rate limit (spec §6.2)."""
import contextlib
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

_PROFILES = [
    {"student_id": "s1", "role": "OA", "retention_scores": {"red_eye": 0.8}},
    {"student_id": "s2", "role": "OA", "retention_scores": {"red_eye": 0.4}},
    {"student_id": "s3", "role": "OA", "retention_scores": {"red_eye": 0.6}},
]
_CASES = [
    {"student_id": "s1", "case_id": "c1", "score_100": 90, "passed": True, "safe": True},
    {"student_id": "s2", "case_id": "c1", "score_100": 60, "passed": True, "safe": True},
    {"student_id": "s3", "case_id": "c1", "score_100": 30, "passed": False, "safe": False},
]
_CARDS = [{"student_id": "s2", "topic_tag": "red_eye", "correct": True}]


def _staff_cookies():
    return {"eyebot_token": create_access_token("user_001", "admin", "OA")}


def _detail_patches():
    """Every db call the endpoint makes. An unstubbed one reads and WRITES prod Supabase.

    get_profile patches on the ROUTER's namespace, not tools.profile: admin.py binds it
    with `from tools.profile.get_profile import get_profile` at import time, so patching
    the source module is inert. It also never raises — it swallows the db failure and
    returns a default profile — so the leak would be invisible without conftest's guard.
    Same target `_stub_admin_db` uses (tests/api/test_admin_endpoints.py:109).
    """
    return [
        patch("tools.api.routers.admin.get_profile",
              new=AsyncMock(return_value={"student_id": "s1", "role": "OA",
                                          "retention_scores": {"red_eye": 0.8}})),
        patch("tools.shared.db.get_consent_by_student_id",
              new=AsyncMock(return_value={"student_name": "A B", "email": "a@b.c"})),
        patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_topic_accuracy", new=AsyncMock(return_value={})),
        patch("tools.shared.db.get_active_student_profiles",
              new=AsyncMock(return_value=(_PROFILES, 0))),
        patch("tools.shared.db.get_all_case_scores",
              new=AsyncMock(return_value=(_CASES, True))),
        patch("tools.shared.db.get_all_flashcard_attempts",
              new=AsyncMock(return_value=(_CARDS, True))),
    ]


def _get(path="/api/admin/student/s1/detail", extra=()):
    stack = _detail_patches() + list(extra)
    with contextlib.ExitStack() as es:
        for p in stack:
            es.enter_context(p)
        return client.get(path, cookies=_staff_cookies())


def test_detail_returns_three_named_mastery_scales():
    r = _get()
    assert r.status_code == 200
    mastery = r.json()["mastery"]
    assert set(mastery) == {"osce_mastery", "flashcard_mastery", "retention_mastery"}
    assert mastery["osce_mastery"]["value"] == 90.0
    # Leave-one-out over s2/s3: (60+30)/2 = 45.
    assert mastery["osce_mastery"]["cohort_avg"] == 45.0
    assert mastery["osce_mastery"]["delta"] == 45.0
    assert mastery["osce_mastery"]["cohort_n"] == 3


def test_scale_the_student_lacks_is_null_with_the_cohort_still_shown():
    # s1 has no flashcard attempts; s2 does. value null, cohort_avg populated.
    fc = _get().json()["mastery"]["flashcard_mastery"]
    assert fc["value"] is None
    assert fc["delta"] is None
    assert fc["cohort_avg"] == 100.0
    assert fc["cohort_n"] == 1


def test_mastery_degrades_to_null_without_taking_out_the_page():
    # Mastery is an ADDITION to a page that already works. A 500 here would blank the
    # sessions, cases and findings a trainer came for.
    extra = [patch("tools.shared.db.get_all_case_scores",
                   new=AsyncMock(side_effect=RuntimeError("supabase down")))]
    r = _get(extra=extra)
    assert r.status_code == 200
    assert r.json()["mastery"] is None
    assert "sessions" in r.json() and "cases" in r.json()


def test_core_reads_still_500():
    # Unchanged behaviour: a detail page with no identity is not a detail page.
    extra = [patch("tools.shared.db.get_consent_by_student_id",
                   new=AsyncMock(side_effect=RuntimeError("supabase down")))]
    assert _get(extra=extra).status_code == 500


def test_the_endpoint_is_rate_limited_on_a_fixed_scope():
    # slowapi defaults to key_style="url", so a plain @limiter.limit would put
    # {student_id} in the bucket key and let a caller dodge the cap by looping ids.
    # Walking DIFFERENT ids must still exhaust one shared bucket.
    codes = []
    for i in range(35):
        codes.append(_get(path=f"/api/admin/student/s{i}/detail").status_code)
    assert 429 in codes, "different ids must share one rate-limit bucket"


def test_mastery_is_absent_for_an_unknown_student_rather_than_fabricated():
    extra = [patch("tools.shared.db.get_active_student_profiles",
                   new=AsyncMock(return_value=([], 0)))]
    mastery = _get(extra=extra).json()["mastery"]
    assert mastery["osce_mastery"]["value"] is None
    assert mastery["osce_mastery"]["cohort_n"] == 0
