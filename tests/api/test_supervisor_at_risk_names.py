# tests/api/test_supervisor_at_risk_names.py
"""Regression: the at-risk panel must name the students it flags.

Reported from production. Every row of the console's "Needs attention" panel rendered a
truncated UUID — "6393d988-0b6…" — because `get_at_risk()` projects `student_id` and
nothing else. A trainer could see that thirteen students needed attention and could not
tell which thirteen. The panel's entire purpose is "go and talk to these people", so a
flag nobody can act on is decoration, which is exactly the complaint this pass exists to
answer.

The name is decorated HERE, at the endpoint, not inside `at_risk.py`:

* it is a presentation concern, and `admin_activity` already resolves names this way
  from the same table (`admin.py`'s `name_map`);
* `at_risk.py` is shared with `weekly_digest`, whose rows are indexed directly — adding
  a key is a superset, moving the read is not;
* `student_consent` is not one of the three tables `cohort_reads` caches, and putting it
  there would make the name read fail-closed alongside the population read. A missing
  NAME must never blank a panel that is telling a trainer someone is in trouble.

So the read degrades: a dead `student_consent` costs the names and keeps the flags.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

_FLAGGED = [
    {"student_id": "6393d988-0b6f-4a11-9e2c-1d7a55c30011", "risk_score": 80,
     "band": "high", "reasons": [], "last_active": "2026-06-01",
     "days_inactive": 83, "weak_topics": [], "weak_count": 0},
    {"student_id": "no-consent-row", "risk_score": 62, "band": "high",
     "reasons": [], "last_active": "", "days_inactive": None,
     "weak_topics": [], "weak_count": 0},
]

_CONSENT = [
    {"student_id": "6393d988-0b6f-4a11-9e2c-1d7a55c30011",
     "student_name": "Alex Tan", "email": "alex.tan@example.com"},
    {"student_id": "someone-else", "student_name": "Wei Ling", "email": "wl@example.com"},
]


def _staff_cookie(sub: str = "stu_atrisk"):
    return {"eyebot_token": create_access_token(sub, "trainer", "OA")}


def _rows(consent=_CONSENT, flagged=None, sub="stu_atrisk"):
    with patch("tools.api.routers.supervisor._get_at_risk",
               new=AsyncMock(return_value=[dict(r) for r in (flagged or _FLAGGED)])), \
         patch("tools.shared.db.get_all_consent",
               new=AsyncMock(return_value=consent) if not isinstance(consent, Exception)
               else AsyncMock(side_effect=consent)):
        r = client.get("/api/supervisor/at-risk", cookies=_staff_cookie(sub))
    assert r.status_code == 200, r.text
    return r.json()["students"]


def test_flagged_rows_carry_the_student_name():
    """THE BUG: the payload had no name at all, so the UI had nothing to render."""
    by_id = {r["student_id"]: r for r in _rows()}
    assert by_id["6393d988-0b6f-4a11-9e2c-1d7a55c30011"]["full_name"] == "Alex Tan"


def test_a_student_with_no_consent_row_still_appears():
    """Fail closed on the FLAG, open on the name: an unnamed student is still at risk.

    Dropping the row, or 500ing, would hide a flagged student because of a missing
    cosmetic field — the one direction this panel must never fail in.
    """
    rows = _rows()
    assert len(rows) == 2
    assert rows[1]["student_id"] == "no-consent-row"
    assert rows[1].get("full_name", "") == ""


def test_a_dead_consent_read_costs_the_names_and_keeps_the_flags():
    """`student_consent` is decoration here. The population read is what may fail closed."""
    rows = _rows(consent=Exception("consent table down"), sub="stu_atrisk2")
    assert [r["student_id"] for r in rows] == [r["student_id"] for r in _FLAGGED]
    assert all(r.get("full_name", "") == "" for r in rows)


def test_the_name_read_does_not_swallow_a_population_failure():
    """The degrade must sit around the CONSENT read only.

    Wrapping both in one `except` is how a 500-guard becomes dead code: an at-risk read
    that dies would render as a healthy cohort with nobody flagged.
    """
    with patch("tools.api.routers.supervisor._get_at_risk",
               new=AsyncMock(side_effect=Exception("population read failed"))), \
         patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=_CONSENT)):
        r = client.get("/api/supervisor/at-risk", cookies=_staff_cookie("stu_atrisk3"))
    assert r.status_code == 500


def test_no_flagged_students_skips_the_consent_read_entirely():
    """Nobody to name — do not scan a table to decorate an empty list."""
    with patch("tools.api.routers.supervisor._get_at_risk", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=_CONSENT)) as m:
        r = client.get("/api/supervisor/at-risk", cookies=_staff_cookie("stu_atrisk4"))
    assert r.status_code == 200
    assert r.json()["students"] == []
    m.assert_not_awaited()
