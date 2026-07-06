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

@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock, return_value=None)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_returns_default_when_unset(mock_get, _mock_img):
    mock_get.return_value = {"student_id": "user_001"}  # no avatar_config key
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.status_code == 200
    body = r.json()
    assert body["config"] == DEFAULT_AVATAR
    assert body["axes"] == AVATAR_AXES

@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock, return_value=None)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_returns_saved_config(mock_get, _mock_img):
    saved = dict(DEFAULT_AVATAR, bodyColor="ebony", irisColor="galaxy")
    mock_get.return_value = {"student_id": "user_001", "avatar_config": saved}
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.json()["config"]["bodyColor"] == "ebony"
    assert r.json()["config"]["irisColor"] == "galaxy"

@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock, return_value=None)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_falls_back_to_default_on_corrupt_saved(mock_get, _mock_img):
    mock_get.return_value = {"avatar_config": {"irisColor": "neon"}}  # invalid stored value
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.status_code == 200
    assert r.json()["config"] == DEFAULT_AVATAR


# ── `customized` flag — drives the first-run onboarding gate (ricoe §7) ────────
# A student who has never saved a config is routed once into the Studio to build
# their Selena. The gate keys off `customized`, so it MUST be false only when unset.

@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock, return_value=None)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_customized_false_when_never_saved(mock_get, _mock_img):
    mock_get.return_value = {"student_id": "user_001"}      # no avatar_config key
    assert client.get("/api/avatar", cookies=_student_cookies()).json()["customized"] is False

@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock, return_value=None)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_customized_true_when_saved(mock_get, _mock_img):
    mock_get.return_value = {"avatar_config": dict(DEFAULT_AVATAR, bodyColor="ebony")}
    assert client.get("/api/avatar", cookies=_student_cookies()).json()["customized"] is True

@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock, return_value=None)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_customized_true_even_when_stored_is_corrupt(mock_get, _mock_img):
    # They DID customize once; a since-retired option id shouldn't re-trigger onboarding.
    mock_get.return_value = {"avatar_config": {"irisColor": "neon"}}
    body = client.get("/api/avatar", cookies=_student_cookies()).json()
    assert body["customized"] is True
    assert body["config"] == DEFAULT_AVATAR

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


# ── 3D portrait endpoints (Task 3) ────────────────────────────────────────────
# The portrait is generated on save, cached by config hash. Generation is paid +
# slow, so it runs off the event loop and never fires in tests (render is patched).

from datetime import datetime, timezone
from unittest.mock import MagicMock


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def test_portrait_post_requires_auth():
    r = client.post("/api/avatar/portrait")
    assert r.status_code in (401, 403)


@patch("tools.api.routers.avatar.render_portrait")
@patch("tools.api.routers.avatar.upsert_avatar_image", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_portrait_post_cache_hit_returns_url_without_generating(mock_prof, mock_get, mock_upsert, mock_render):
    mock_prof.return_value = {"student_id": "user_001", "avatar_config": dict(DEFAULT_AVATAR)}
    mock_get.return_value = {"status": "ready", "image_url": "https://cdn/x.png"}
    r = client.post("/api/avatar/portrait", cookies=_student_cookies())
    assert r.status_code == 200
    body = r.json()
    assert body["portrait_status"] == "ready"
    assert body["portrait_url"] == "https://cdn/x.png"
    mock_render.assert_not_called()          # a cache hit never generates
    mock_upsert.assert_not_awaited()         # nor writes


@patch("tools.api.routers.avatar.store_portrait", return_value="https://cdn/new.png")
@patch("tools.api.routers.avatar.render_portrait", return_value=b"IMG")
@patch("tools.api.routers.avatar.upsert_avatar_image", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_portrait_post_miss_enqueues_and_marks_ready(mock_prof, mock_get, mock_upsert, mock_render, mock_store):
    mock_prof.return_value = {"student_id": "user_001", "avatar_config": dict(DEFAULT_AVATAR)}
    mock_get.return_value = None                          # cache miss
    r = client.post("/api/avatar/portrait", cookies=_student_cookies())
    assert r.status_code == 200
    assert r.json()["portrait_status"] == "pending"       # returns immediately as pending
    # Background task ran (TestClient drains it): generated once, stored, marked ready.
    mock_render.assert_called_once()
    mock_store.assert_called_once()
    statuses = [c.args[1] for c in mock_upsert.await_args_list]
    assert "pending" in statuses and "ready" in statuses


@patch("tools.api.routers.avatar.render_portrait")
@patch("tools.api.routers.avatar.upsert_avatar_image", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_portrait_post_pending_recent_does_not_regenerate(mock_prof, mock_get, mock_upsert, mock_render):
    mock_prof.return_value = {"student_id": "user_001", "avatar_config": dict(DEFAULT_AVATAR)}
    mock_get.return_value = {"status": "pending", "updated_at": _now_iso()}
    r = client.post("/api/avatar/portrait", cookies=_student_cookies())
    assert r.status_code == 200
    assert r.json()["portrait_status"] == "pending"
    mock_render.assert_not_called()          # an in-flight recent render is not duplicated
    mock_upsert.assert_not_awaited()


@patch("tools.api.routers.avatar.render_portrait")
@patch("tools.api.routers.avatar.upsert_avatar_image", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_portrait_post_identity_from_jwt(mock_prof, mock_get, mock_upsert, mock_render):
    mock_prof.return_value = {"student_id": "user_042", "avatar_config": dict(DEFAULT_AVATAR)}
    mock_get.return_value = {"status": "ready", "image_url": "https://cdn/x.png"}
    client.post("/api/avatar/portrait", cookies=_student_cookies("user_042"))
    mock_prof.assert_awaited_once_with("user_042")   # hash derives from the caller's saved config


@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_includes_portrait_fields(mock_prof, mock_get):
    mock_prof.return_value = {"student_id": "user_001", "avatar_config": dict(DEFAULT_AVATAR)}
    mock_get.return_value = {"status": "ready", "image_url": "https://cdn/x.png"}
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.status_code == 200
    body = r.json()
    assert body["portrait_status"] == "ready"
    assert body["portrait_url"] == "https://cdn/x.png"


@patch("tools.api.routers.avatar.get_avatar_image", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_portrait_unavailable_when_table_missing(mock_prof, mock_get):
    mock_prof.return_value = {"student_id": "user_001", "avatar_config": dict(DEFAULT_AVATAR)}
    mock_get.side_effect = Exception("relation avatar_images does not exist")
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.status_code == 200                       # never 500 on a missing cache table
    assert r.json()["portrait_status"] == "unavailable"
