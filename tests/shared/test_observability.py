"""Structured logging, request-ID propagation, and the dormant Sentry hook.

Every response carries a correlation ID so a student's error report can be traced
to exact log lines. Sentry stays off unless SENTRY_DSN is set, and a missing
sentry-sdk must never crash the app.
"""
import logging

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.logging_config import configure_logging, init_sentry

client = TestClient(app)


def test_response_carries_a_request_id():
    r = client.get("/health")
    assert r.headers.get("X-Request-ID")


def test_provided_request_id_is_echoed_back():
    r = client.get("/health", headers={"X-Request-ID": "trace-abc-123"})
    assert r.headers.get("X-Request-ID") == "trace-abc-123"


def test_init_sentry_is_noop_without_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert init_sentry() is False


def test_init_sentry_does_not_crash_when_sdk_absent(monkeypatch):
    # Even with a DSN, a missing/broken sentry-sdk must degrade gracefully.
    monkeypatch.setenv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/0")
    monkeypatch.setitem(__import__("sys").modules, "sentry_sdk", None)
    assert init_sentry() is False


def test_configure_logging_is_idempotent():
    configure_logging()
    configure_logging()
    root = logging.getLogger()
    # Exactly one of our handlers, no matter how many times it's configured.
    ours = [h for h in root.handlers if getattr(h, "name", "") == "eyebot-json"]
    assert len(ours) == 1
