"""GET /api/admin/performance-trend — cohort quality over time (spec §7.2).

The guard tier (401/403 for student, 200 for trainer/admin) is inherited free by listing
the route in STAFF_READ_ENDPOINTS in test_admin_endpoints.py. What is pinned here is what
that cannot see: the SGT calendar at both ends of the pipe, a staff-free population, and
nulls where there is no data.
"""
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.clock import app_today
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

# s1/s2 are OA (CLINICAL pool), s3 is OT. s9 is deliberately ABSENT from the population —
# it stands in for a trainer or a revoked student whose rows are still in case_progress.
_PROFILES = [
    {"student_id": "s1", "role": "OA"},
    {"student_id": "s2", "role": "PSA"},
    {"student_id": "s3", "role": "OT"},
]


def _cookies(role: str = "trainer") -> dict:
    return {"eyebot_token": create_access_token("user_001", role, "OA")}


def _row(student_id, when, score=80.0, passed=True, safe=True):
    return {"student_id": student_id, "completed_at": when, "case_id": "C001",
            "score_100": score, "passed": passed, "safe": safe}


def _serve(rows, profiles=None, complete=True):
    """Patch both reads. Never leave a db.* call unstubbed — it reads live prod Supabase."""
    return (
        patch("tools.shared.db.get_active_student_profiles",
              new=AsyncMock(return_value=(profiles if profiles is not None else _PROFILES, 0))),
        patch("tools.shared.db.get_case_scores_since",
              new=AsyncMock(return_value=(rows, complete))),
    )


def _get(url, rows, **kw):
    profiles_p, rows_p = _serve(rows, **kw)
    with profiles_p, rows_p:
        return client.get(url, cookies=_cookies())


@pytest.mark.asyncio
async def test_an_empty_window_is_nulls_not_zeros():
    res = _get("/api/admin/performance-trend?days=3", [])

    assert res.status_code == 200
    body = res.json()
    assert len(body["points"]) == 3
    for p in body["points"]:
        assert (p["n"], p["avg_score"], p["pass_rate"], p["safety_fail_rate"]) == (0, None, None, None)


@pytest.mark.asyncio
async def test_a_zero_activity_day_never_renders_as_a_score_of_zero():
    # The defect this exists to prevent: a 0.0 average draws a cliff to the floor and
    # reads as the cohort collapsing, on a day when nobody simply sat a station.
    today = app_today()
    rows = [_row("s1", f"{today.isoformat()}T02:00:00Z", score=90.0)]

    body = _get("/api/admin/performance-trend?days=2", rows).json()

    assert body["points"][0]["avg_score"] is None, "yesterday had no attempts"
    assert body["points"][1]["avg_score"] == 90.0


@pytest.mark.asyncio
async def test_the_last_bucket_is_today_in_SGT_not_utc():
    # Run near a UTC midnight and a UTC-dated window would label its newest column with
    # yesterday's date for eight hours of every day.
    body = _get("/api/admin/performance-trend?days=1", []).json()

    assert body["points"][-1]["date"] == app_today().isoformat()


@pytest.mark.asyncio
async def test_an_attempt_late_in_the_utc_day_lands_on_the_sgt_day_it_belongs_to():
    # 2026-xx-xxT23:00Z is 07:00 the NEXT morning in Singapore. Bucketed by the UTC date
    # prefix it would be credited to the day before — a systematic half-day shear.
    today = app_today()
    yesterday = today - timedelta(days=1)
    rows = [_row("s1", f"{yesterday.isoformat()}T23:00:00Z", score=70.0)]

    body = _get("/api/admin/performance-trend?days=2", rows).json()

    by_date = {p["date"]: p for p in body["points"]}
    assert by_date[today.isoformat()]["n"] == 1, "23:00 UTC is 07:00 SGT the next day"
    assert by_date[yesterday.isoformat()]["n"] == 0


@pytest.mark.asyncio
async def test_the_window_is_read_from_sgt_midnight_expressed_in_utc():
    # The filter handed to the DB must be an instant, not a date: SGT midnight is 16:00Z
    # the previous day, and a plain date bound would silently drop the oldest day's
    # morning.
    profiles_p, rows_p = _serve([])
    with profiles_p, rows_p as scores:
        client.get("/api/admin/performance-trend?days=7", cookies=_cookies())

    since = scores.call_args.args[0]
    assert since.endswith("16:00:00+00:00"), since
    assert since.startswith((app_today() - timedelta(days=7)).isoformat())


@pytest.mark.asyncio
async def test_rows_from_outside_the_population_are_not_counted():
    # s9 is not in the staff-free population — a promoted trainer's demo run, or a revoked
    # student. Their attempts must not move a cohort line (D10).
    today = app_today().isoformat()
    rows = [_row("s1", f"{today}T02:00:00Z", score=50.0),
            _row("s9", f"{today}T03:00:00Z", score=100.0)]

    body = _get("/api/admin/performance-trend?days=1", rows).json()

    assert body["points"][-1]["n"] == 1
    assert body["points"][-1]["avg_score"] == 50.0, "the outsider's 100 must not lift the mean"


@pytest.mark.asyncio
async def test_discipline_filters_on_the_students_pool():
    today = app_today().isoformat()
    rows = [_row("s1", f"{today}T02:00:00Z", score=40.0),   # OA  -> clinical
            _row("s3", f"{today}T03:00:00Z", score=100.0)]  # OT  -> technical

    both = _get("/api/admin/performance-trend?days=1", rows).json()
    oa = _get("/api/admin/performance-trend?days=1&discipline=oa_psa", rows).json()
    ot = _get("/api/admin/performance-trend?days=1&discipline=ot", rows).json()

    assert both["points"][-1]["n"] == 2
    assert oa["points"][-1]["n"] == 1
    assert oa["points"][-1]["avg_score"] == 40.0, "the OT student's 100 is a different curriculum"
    assert oa["discipline"] == "oa_psa"
    assert ot["points"][-1]["avg_score"] == 100.0


@pytest.mark.asyncio
async def test_an_unknown_discipline_is_a_400_not_a_silent_slice():
    res = _get("/api/admin/performance-trend?discipline=ophthalmology", [])

    assert res.status_code == 400
    assert "discipline must be one of" in res.json()["detail"]


@pytest.mark.asyncio
async def test_days_clamps_instead_of_erroring():
    assert len(_get("/api/admin/performance-trend?days=0", []).json()["points"]) == 1
    body = _get("/api/admin/performance-trend?days=9999", []).json()
    assert body["period"] == "week", "a 90-day window rolls up"
    assert len(body["points"]) <= 14


@pytest.mark.asyncio
async def test_a_long_window_reports_weekly_buckets():
    body = _get("/api/admin/performance-trend?days=60", []).json()

    assert body["period"] == "week"
    assert all(len(p["date"]) == 10 for p in body["points"])


@pytest.mark.asyncio
async def test_a_truncated_read_is_flagged_rather_than_passed_off_as_the_record():
    body = _get("/api/admin/performance-trend?days=7", [], complete=False).json()

    assert body["complete"] is False


@pytest.mark.asyncio
async def test_a_failed_read_is_a_500_never_an_empty_series():
    # "The DB is down" and "nobody attempted anything" must not render identically — an
    # empty series is a measurement, and this one would be fiction.
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(side_effect=Exception("boom"))):
        res = client.get("/api/admin/performance-trend", cookies=_cookies())

    assert res.status_code == 500
