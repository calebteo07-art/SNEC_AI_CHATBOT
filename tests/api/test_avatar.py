"""Eyecon avatar endpoint — the config is the single source of truth; the avatar is
composited client-side, so there is no server-rendered portrait surface any more.

Mirrors the TestClient + JWT-cookie fixture pattern from test_leaderboard_endpoint.py.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _cookies(sub: str = "user_001") -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock, return_value={"student_id": "user_001"})
def test_get_avatar_returns_config_axes_customized_no_portrait_fields(mock_get):
    r = client.get("/api/avatar", cookies=_cookies())
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"config", "axes", "customized"}
    assert "portrait_status" not in body
    assert "portrait_url" not in body


def test_portrait_endpoint_removed():
    r = client.post("/api/avatar/portrait", cookies=_cookies())
    assert r.status_code == 404
