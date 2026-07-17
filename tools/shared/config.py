#!/usr/bin/env python3
"""Centralised, fail-closed configuration validation.

The single place that answers: "is this environment safe to run in production?"
A production boot calls ``assert_production_ready()`` and refuses to start if any
security-critical variable is unset, defaulted, or wildcarded — so a
misconfigured deploy fails loudly at startup instead of silently running on
forgeable JWTs, a missing database, or wide-open CORS.

Pure functions over an explicit env mapping (default ``os.environ``) so they are
trivial to unit-test without monkeypatching global state.
"""
from __future__ import annotations

import os
from collections.abc import Mapping

# JWT secrets that must never reach production — the in-code fallback and the
# .env.template placeholder.
_INSECURE_JWT_SECRETS = {
    "",
    "dev-only-secret-set-JWT_SECRET-in-env",
    "replace-with-a-random-64-char-hex-string",
}

_MIN_JWT_SECRET_LEN = 32


def is_production(env: Mapping[str, str] | None = None) -> bool:
    """True when ENVIRONMENT is 'production' (case-insensitive)."""
    env = os.environ if env is None else env
    return env.get("ENVIRONMENT", "development").strip().lower() == "production"


def super_admin_email(env: Mapping[str, str] | None = None) -> str:
    """The configured super-admin address, folded the same way login folds the
    submitted email (``body.email.strip().lower()``).

    The one source of truth for reading this var: the API's ``SUPER_ADMIN_EMAIL``
    constant and the leaderboard's staff lookup both go through here, so a dashboard
    value with stray case or whitespace can't make the two disagree about who the
    super-admin is. Blank when unset — callers depend on that to fail closed.
    """
    env = os.environ if env is None else env
    return env.get("SUPER_ADMIN_EMAIL", "").strip().lower()


def production_config_problems(env: Mapping[str, str] | None = None) -> list[str]:
    """Return human-readable problems that must block a production boot.

    An empty list means the environment is safe to start. This is intentionally
    a pure function so the boot guard and the tests share one code path.
    """
    env = os.environ if env is None else env
    problems: list[str] = []

    jwt = env.get("JWT_SECRET", "")
    if jwt in _INSECURE_JWT_SECRETS:
        problems.append("JWT_SECRET is unset or using an insecure default")
    elif len(jwt) < _MIN_JWT_SECRET_LEN:
        problems.append(
            f"JWT_SECRET is too short (need >= {_MIN_JWT_SECRET_LEN} chars; "
            "generate with: python -c \"import secrets; print(secrets.token_hex(32))\")"
        )

    if not env.get("SUPABASE_URL", "").strip():
        problems.append("SUPABASE_URL is not set")
    if not env.get("SUPABASE_SERVICE_ROLE_KEY", "").strip():
        problems.append("SUPABASE_SERVICE_ROLE_KEY is not set")

    origins = env.get("ALLOWED_ORIGINS", "").strip()
    if origins == "" or origins == "*":
        problems.append(
            "ALLOWED_ORIGINS must be an explicit origin list in production "
            "(not '*' or empty); e.g. https://eyebot.yourschool.edu"
        )

    return problems


def assert_production_ready(env: Mapping[str, str] | None = None) -> None:
    """Raise RuntimeError listing every problem when the env is not safe.

    No-op outside production, and a no-op in production when the env is clean.
    """
    env = os.environ if env is None else env
    if not is_production(env):
        return
    problems = production_config_problems(env)
    if problems:
        raise RuntimeError(
            "Refusing to start in production with insecure configuration:\n  - "
            + "\n  - ".join(problems)
            + "\nSet these in your deployment environment (e.g. the Render dashboard)."
        )
