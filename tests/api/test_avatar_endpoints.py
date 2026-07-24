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


# ── `customized` flag — drives the first-run onboarding gate (ricoe §7) ────────
# A student who has never saved a config is routed once into the Studio to build
# their Selena. The gate keys off `customized`, so it MUST be false only when unset.

@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_customized_false_when_never_saved(mock_get):
    mock_get.return_value = {"student_id": "user_001"}      # no avatar_config key
    assert client.get("/api/avatar", cookies=_student_cookies()).json()["customized"] is False

@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_customized_true_when_saved(mock_get):
    mock_get.return_value = {"avatar_config": dict(DEFAULT_AVATAR, bodyColor="ebony")}
    assert client.get("/api/avatar", cookies=_student_cookies()).json()["customized"] is True

@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_customized_true_even_when_stored_is_corrupt(mock_get):
    # They DID customize once; a since-retired option id shouldn't re-trigger onboarding.
    mock_get.return_value = {"avatar_config": {"irisColor": "neon"}}
    body = client.get("/api/avatar", cookies=_student_cookies()).json()
    assert body["customized"] is True
    assert body["config"] == DEFAULT_AVATAR

@patch("tools.api.routers.avatar.insert_audit_event", new_callable=AsyncMock)
@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_fails_open_when_profile_read_errors(mock_get, mock_audit):
    """A transient profile-read failure must NOT masquerade as "never customized" — that
    reports customized=false and traps an established student in the mandatory first-run
    Studio (the reported bug: the Studio re-pops for old users, sometimes). Identity is
    stable, so an intermittent false is a swallowed read error. Fail OPEN: customized=true
    (returning-user) with a safe default config the client repaints on the next good read;
    a durable audit event records the fail-open so it is observable in prod."""
    mock_get.side_effect = Exception("read timed out")
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.status_code == 200
    body = r.json()
    assert body["customized"] is True          # returning-user path, NOT the Studio gate
    assert body["config"] == DEFAULT_AVATAR
    mock_audit.assert_awaited_once()           # durable signal fired (prod-observable)
    assert mock_audit.await_args[1]["action"] == "avatar_read_error"

@patch("tools.api.routers.avatar.upsert_profile", new_callable=AsyncMock)
def test_put_avatar_persists_valid_config(mock_upsert):
    payload = {"bodyColor": "deep", "topper": "crown", "irisColor": "green"}
    r = client.put("/api/avatar", json=payload, cookies=_student_cookies("user_042"))
    assert r.status_code == 200
    clean = r.json()["config"]
    assert clean["bodyColor"] == "deep" and clean["irisColor"] == "green"
    mock_upsert.assert_awaited_once()
    args, kwargs = mock_upsert.call_args
    assert args[0] == "user_042"                       # identity from JWT sub, not body
    assert kwargs["avatar_config"]["topper"] == "crown"

@patch("tools.api.routers.avatar.upsert_profile", new_callable=AsyncMock)
def test_put_avatar_upserts_so_a_save_can_never_silently_noop(mock_upsert):
    """The save is the ONLY exit from the mandatory first-run Studio. A blind
    UPDATE ... WHERE student_id no-ops (no error) when the profile row is missing,
    trapping the student ("I set it but can't leave"). Upsert so the write always lands
    and `customized` flips true — even for an id that has no profile row yet."""
    r = client.put("/api/avatar", json={"bodyColor": "deep"}, cookies=_student_cookies("row_less_user"))
    assert r.status_code == 200
    mock_upsert.assert_awaited_once()
    assert mock_upsert.call_args[0][0] == "row_less_user"
    assert "avatar_config" in mock_upsert.call_args[1]

@patch("tools.api.routers.avatar.upsert_profile", new_callable=AsyncMock)
def test_put_avatar_rejects_unknown_option(mock_upsert):
    r = client.put("/api/avatar", json={"bodyColor": "neon"}, cookies=_student_cookies())
    assert r.status_code == 422
    mock_upsert.assert_not_awaited()
