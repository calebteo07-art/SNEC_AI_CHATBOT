"""Fail-closed production config validation.

A production boot must refuse to start on an insecure/incomplete environment
rather than silently running on forgeable tokens or a missing database.
"""
import pytest

from tools.shared.config import (
    production_config_problems,
    assert_production_ready,
    is_production,
    super_admin_email,
)

# A fully valid production environment used as the baseline for each test.
_GOOD = {
    "ENVIRONMENT": "production",
    "JWT_SECRET": "a" * 64,
    "SUPABASE_URL": "https://proj.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role-key-value",
    "ALLOWED_ORIGINS": "https://eyebot.example.edu",
}


def test_good_production_env_has_no_problems():
    assert production_config_problems(_GOOD) == []


def test_assert_production_ready_passes_on_good_env():
    # Should not raise.
    assert_production_ready(_GOOD)


def test_missing_jwt_secret_is_a_problem():
    env = {**_GOOD, "JWT_SECRET": ""}
    problems = production_config_problems(env)
    assert any("JWT_SECRET" in p for p in problems)


def test_default_jwt_secret_is_a_problem():
    env = {**_GOOD, "JWT_SECRET": "dev-only-secret-set-JWT_SECRET-in-env"}
    assert any("JWT_SECRET" in p for p in production_config_problems(env))


def test_template_jwt_secret_is_a_problem():
    env = {**_GOOD, "JWT_SECRET": "replace-with-a-random-64-char-hex-string"}
    assert any("JWT_SECRET" in p for p in production_config_problems(env))


def test_short_jwt_secret_is_a_problem():
    env = {**_GOOD, "JWT_SECRET": "tooshort"}
    assert any("JWT_SECRET" in p for p in production_config_problems(env))


def test_missing_supabase_url_is_a_problem():
    env = {**_GOOD, "SUPABASE_URL": ""}
    assert any("SUPABASE_URL" in p for p in production_config_problems(env))


def test_missing_supabase_key_is_a_problem():
    env = {**_GOOD, "SUPABASE_SERVICE_ROLE_KEY": ""}
    assert any("SUPABASE_SERVICE_ROLE_KEY" in p for p in production_config_problems(env))


def test_wildcard_cors_is_a_problem_in_production():
    env = {**_GOOD, "ALLOWED_ORIGINS": "*"}
    assert any("ALLOWED_ORIGINS" in p for p in production_config_problems(env))


def test_empty_cors_is_a_problem_in_production():
    env = {**_GOOD, "ALLOWED_ORIGINS": ""}
    assert any("ALLOWED_ORIGINS" in p for p in production_config_problems(env))


def test_assert_production_ready_raises_and_lists_all_problems():
    env = {"ENVIRONMENT": "production"}  # everything missing
    with pytest.raises(RuntimeError) as exc:
        assert_production_ready(env)
    msg = str(exc.value)
    assert "JWT_SECRET" in msg
    assert "SUPABASE_URL" in msg
    assert "ALLOWED_ORIGINS" in msg


def test_is_production_detection():
    assert is_production({"ENVIRONMENT": "production"}) is True
    assert is_production({"ENVIRONMENT": "PRODUCTION"}) is True
    assert is_production({"ENVIRONMENT": "development"}) is False
    assert is_production({}) is False


def test_non_production_env_never_blocks_boot():
    # In dev we tolerate insecure defaults; only production is fail-closed.
    assert_production_ready({"ENVIRONMENT": "development"})


def test_super_admin_email_is_normalised():
    """Login compares against `body.email.strip().lower()`, so the configured address
    must be folded the same way. A dashboard value carrying stray case or whitespace
    would otherwise never match and would lock the super-admin out of the console."""
    assert super_admin_email({"SUPER_ADMIN_EMAIL": "  Boss@SNEC.com "}) == "boss@snec.com"


def test_super_admin_email_blank_when_unset_or_whitespace():
    """Fail closed: an unset (or whitespace-only) var must stay falsy so the
    `bool(SUPER_ADMIN_EMAIL) and ...` guard can never authorise a blank email."""
    assert super_admin_email({}) == ""
    assert super_admin_email({"SUPER_ADMIN_EMAIL": "   "}) == ""
