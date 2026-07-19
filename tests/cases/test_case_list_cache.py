"""Case-list endpoints must serve from the per-worker _case_cache.

get_cases / get_case_topics loop over every case file. On a warm worker the parsed
cases already live in _case_cache (populated by station loads and prior calls), so
re-reading + re-parsing ~150 JSON files from disk on EVERY request needlessly blocks
the single Render worker. They must read the cache first (like _load_case_or_404 does)
and only hit disk on a miss. Filename stem == internal case_id for every case, so the
cache key is consistent.
"""
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

_FAKE = {
    "case_id": "case_cache_x", "title": "Cached Case", "difficulty": "beginner",
    "topic": "iop_va_measurement", "estimated_minutes": 15, "role": "any",
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "review"},
}


def _cookie():
    return {"eyebot_token": create_access_token("stu_cache", "student", "OA")}


def test_get_cases_serves_warm_cache_without_disk_read():
    calls = {"n": 0}

    def _spy(cid):
        calls["n"] += 1
        return _FAKE

    with patch.dict("tools.api.shared._case_cache", {"case_cache_x": _FAKE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_cache_x"]), \
         patch("tools.api.routers.cases.get_profile", new=AsyncMock(return_value={"role": "OA"})), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases.load_case", side_effect=_spy):
        r = client.get("/api/cases", cookies=_cookie())

    assert r.status_code == 200, r.text
    assert calls["n"] == 0, "get_cases re-read from disk despite a warm _case_cache"


def test_get_case_topics_serves_warm_cache_without_disk_read():
    calls = {"n": 0}

    def _spy(cid):
        calls["n"] += 1
        return _FAKE

    with patch.dict("tools.api.shared._case_cache", {"case_cache_x": _FAKE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_cache_x"]), \
         patch("tools.api.routers.cases.get_profile", new=AsyncMock(return_value={"role": "OA"})), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases.load_case", side_effect=_spy):
        r = client.get("/api/cases/topics", cookies=_cookie())

    assert r.status_code == 200, r.text
    assert calls["n"] == 0, "get_case_topics re-read from disk despite a warm _case_cache"
