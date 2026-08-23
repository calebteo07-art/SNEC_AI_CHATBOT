"""Fail-closed production config validation.

A production boot must refuse to start on an insecure/incomplete environment
rather than silently running on forgeable tokens or a missing database.
"""
import pytest

from tools.shared.config import (
    app_base_url,
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
    "GEMINI_API_KEY": "gemini-key-value",
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


def test_a_missing_gemini_key_blocks_a_production_boot():
    """docs/SECURITY.md lists GEMINI_API_KEY as REQUIRED, but the guard never checked it.

    A prod boot without it started GREEN and served MOCK_MODE to real students: the
    "patient" answers with a grading rubric, observe_steps returns [] so no checklist step
    can ever tick, and every submit returns the identical 7/7/8/7. /health does publish
    `mock_mode: true`, but the keep-alive cron only asserts HTTP 200 — so nothing on any
    channel would have said a word.
    """
    env = {**_GOOD, "GEMINI_API_KEY": ""}
    problems = production_config_problems(env)
    assert any("GEMINI_API_KEY" in p for p in problems), problems
    assert any("MOCK_MODE" in p for p in problems), "say WHAT goes wrong, not just which var"

    with pytest.raises(RuntimeError):
        assert_production_ready(env)


def test_whitespace_is_not_a_gemini_key():
    assert any("GEMINI_API_KEY" in p
               for p in production_config_problems({**_GOOD, "GEMINI_API_KEY": "   "}))


def test_a_missing_gemini_key_is_fine_outside_production():
    """MOCK_MODE is how the whole test suite and every local harness run keyless, so the
    guard must not fire off production. `production_config_problems` is the pure predicate
    and reports the problem regardless of ENVIRONMENT — it is `assert_production_ready`
    that gates on it, and that is what this asserts."""
    dev = {**_GOOD, "ENVIRONMENT": "development", "GEMINI_API_KEY": ""}
    assert any("GEMINI_API_KEY" in p for p in production_config_problems(dev))
    assert_production_ready(dev)  # must NOT raise off production


# ── app_base_url ───────────────────────────────────────────────────────────────
# The public origin of the web app, needed by anything that mails a link (the
# supervisor weekly digest is the first caller). Derived from ALLOWED_ORIGINS rather
# than a new env var: it is the one public URL every deployment already has to set,
# and `production_config_problems` above already refuses to boot production without an
# explicit, non-wildcard value — so there is no prod state where this reads nothing.

def test_the_configured_origin_is_the_app_base():
    assert app_base_url(_GOOD) == "https://eyebot.example.edu"


def test_a_trailing_slash_never_doubles_up_in_the_built_link():
    env = {**_GOOD, "ALLOWED_ORIGINS": "https://eyebot.example.edu/"}
    assert app_base_url(env) + "/admin" == "https://eyebot.example.edu/admin"


def test_the_public_origin_wins_over_the_dev_entries_beside_it():
    """A deployment that lists its dev origins alongside the real one is normal; a mailed
    link has to reach the host the recipient's machine can resolve, not their own."""
    env = {**_GOOD, "ALLOWED_ORIGINS":
           "http://localhost:3000,http://127.0.0.1:3000,https://eyebot.example.edu"}
    assert app_base_url(env) == "https://eyebot.example.edu"


def test_a_production_environment_can_never_resolve_to_loopback():
    """The guard above makes ALLOWED_ORIGINS explicit and non-wildcard in production, so
    the loopback fallback below is unreachable there. This is the assertion that keeps
    the two facts tied together."""
    assert "localhost" not in app_base_url(_GOOD)
    assert "127.0.0.1" not in app_base_url(_GOOD)


def test_an_unset_or_wildcard_origin_falls_back_to_the_local_dev_server():
    """Only reachable off production — a manual `python tools/supervisor/weekly_digest.py`
    run should still build a link that works on the machine running it."""
    assert app_base_url({}) == "http://localhost:3000"
    assert app_base_url({"ALLOWED_ORIGINS": "*"}) == "http://localhost:3000"
    assert app_base_url({"ALLOWED_ORIGINS": "   "}) == "http://localhost:3000"


def test_a_loopback_only_list_is_honoured_as_written():
    """Last resort, not a rewrite: if localhost is all the environment offers, use the
    port it actually named rather than guessing a different one."""
    assert app_base_url({"ALLOWED_ORIGINS": "http://localhost:4321"}) == "http://localhost:4321"
