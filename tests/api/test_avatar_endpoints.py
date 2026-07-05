"""Tests for the Selena avatar registry, validation, and endpoints."""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token
from tools.avatar.parts import (
    DEFAULT_AVATAR, AVATAR_AXES, CONFIG_VERSION, validate_config, InvalidAvatarConfig,
)

client = TestClient(app)


def _student_cookies(sub: str = "user_001") -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


# ── pure validator ──────────────────────────────────────────────────────────

def test_default_config_is_valid_and_stable():
    assert validate_config(DEFAULT_AVATAR) == DEFAULT_AVATAR

def test_every_default_value_is_a_listed_option():
    for axis, options in AVATAR_AXES.items():
        assert DEFAULT_AVATAR[axis] in options, f"default {axis} not in options"

def test_validate_fills_missing_axes_from_default():
    clean = validate_config({"bodyColor": "deep"})
    assert clean["bodyColor"] == "deep"
    assert clean["irisColor"] == DEFAULT_AVATAR["irisColor"]
    assert clean["version"] == CONFIG_VERSION

def test_validate_rejects_unknown_option():
    with pytest.raises(InvalidAvatarConfig):
        validate_config({"bodyColor": "neon"})

def test_validate_ignores_unknown_axis():
    clean = validate_config({"bogusAxis": "x"})
    assert "bogusAxis" not in clean

def test_validate_handles_none():
    assert validate_config(None) == DEFAULT_AVATAR


# ── endpoints ───────────────────────────────────────────────────────────────

def test_get_avatar_requires_auth():
    r = client.get("/api/avatar")
    assert r.status_code in (401, 403)

def test_put_avatar_requires_auth():
    r = client.put("/api/avatar", json={"bodyColor": "deep"})
    assert r.status_code in (401, 403)

@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_returns_default_when_unset(mock_get):
    mock_get.return_value = {"student_id": "user_001"}  # no avatar_config key
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.status_code == 200
    body = r.json()
    assert body["config"] == DEFAULT_AVATAR
    assert body["axes"] == AVATAR_AXES

@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_returns_saved_config(mock_get):
    saved = dict(DEFAULT_AVATAR, bodyColor="ebony", irisColor="galaxy")
    mock_get.return_value = {"student_id": "user_001", "avatar_config": saved}
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.json()["config"]["bodyColor"] == "ebony"
    assert r.json()["config"]["irisColor"] == "galaxy"

@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_falls_back_to_default_on_corrupt_saved(mock_get):
    mock_get.return_value = {"avatar_config": {"irisColor": "neon"}}  # invalid stored value
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.status_code == 200
    assert r.json()["config"] == DEFAULT_AVATAR

@patch("tools.api.routers.avatar.update_profile", new_callable=AsyncMock)
def test_put_avatar_persists_valid_config(mock_update):
    payload = {"bodyColor": "deep", "topper": "crown", "irisColor": "green"}
    r = client.put("/api/avatar", json=payload, cookies=_student_cookies("user_042"))
    assert r.status_code == 200
    clean = r.json()["config"]
    assert clean["bodyColor"] == "deep" and clean["irisColor"] == "green"
    mock_update.assert_awaited_once()
    args, kwargs = mock_update.call_args
    assert args[0] == "user_042"                       # identity from JWT sub, not body
    assert kwargs["avatar_config"]["topper"] == "crown"

@patch("tools.api.routers.avatar.update_profile", new_callable=AsyncMock)
def test_put_avatar_rejects_unknown_option(mock_update):
    r = client.put("/api/avatar", json={"bodyColor": "neon"}, cookies=_student_cookies())
    assert r.status_code == 422
    mock_update.assert_not_awaited()
