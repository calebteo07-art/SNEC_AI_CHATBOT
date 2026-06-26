#!/usr/bin/env python3
"""Structured (JSON) logging + an optional, dormant Sentry hook.

One line per event as JSON so Render's log drain (or any aggregator) can index by
``request_id``, ``status``, and ``latency_ms`` instead of grepping free text.
Sentry initialises only when ``SENTRY_DSN`` is set, and a missing sentry-sdk
degrades to a no-op — error tracking is opt-in, never a hard dependency.
"""
from __future__ import annotations

import json
import logging
import os
import sys

_HANDLER_NAME = "eyebot-json"

# Extra fields the request middleware attaches; surfaced into the JSON payload.
_EXTRA_FIELDS = ("request_id", "method", "path", "status", "latency_ms")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for field in _EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    """Install a single JSON handler on the root logger. Idempotent."""
    root = logging.getLogger()
    root.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

    # Drop any handler we previously installed so repeated calls don't stack.
    root.handlers = [
        h for h in root.handlers if getattr(h, "name", "") != _HANDLER_NAME
    ]

    handler = logging.StreamHandler(sys.stdout)
    handler.set_name(_HANDLER_NAME)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)


def init_sentry() -> bool:
    """Initialise Sentry iff SENTRY_DSN is set and the SDK is importable.

    Returns True when Sentry is active, False otherwise. Never raises — a broken
    or absent sentry-sdk must not take the app down."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk

        if sentry_sdk is None:  # patched-out / placeholder
            return False
        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("ENVIRONMENT", "development"),
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
        )
        return True
    except Exception:  # noqa: BLE001 — observability must never crash the app
        return False
