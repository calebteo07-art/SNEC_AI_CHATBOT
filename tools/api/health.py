#!/usr/bin/env python3
"""Dependency readiness probes for /health/ready.

Each check runs the blocking client off the event loop with a hard timeout, so a
slow or dead dependency degrades to a 503 instead of hanging the worker. Redis is
treated as optional (single-worker dev runs without it), so "not configured" is a
pass — only a *configured but unreachable* Redis fails readiness.
"""
from __future__ import annotations

import asyncio
import os


async def check_supabase(timeout: float = 3.0) -> tuple[bool, str]:
    """Cheapest possible round-trip to confirm the database is reachable."""
    try:
        from tools.kb.supabase_client import get_client

        def _ping() -> bool:
            client = get_client()
            client.table("password_reset_otps").select("email").limit(1).execute()
            return True

        await asyncio.wait_for(asyncio.to_thread(_ping), timeout=timeout)
        return True, "ok"
    except Exception as exc:  # noqa: BLE001 — readiness reports the failure class
        return False, type(exc).__name__


async def check_redis(timeout: float = 1.0) -> tuple[bool, str]:
    """Ping Redis only when it's actually configured."""
    url = (os.getenv("RATELIMIT_STORAGE_URI") or os.getenv("REDIS_URL") or "").strip()
    if not url or url.startswith("memory://"):
        return True, "not_configured"
    try:
        import redis as _redis

        def _ping() -> bool:
            client = _redis.from_url(
                url, socket_connect_timeout=timeout, socket_timeout=timeout
            )
            client.ping()
            return True

        await asyncio.wait_for(asyncio.to_thread(_ping), timeout=timeout + 0.5)
        return True, "ok"
    except Exception as exc:  # noqa: BLE001
        return False, type(exc).__name__


async def readiness_report() -> dict:
    """Aggregate dependency health. ``ready`` is the AND of all required checks."""
    (sb_ok, sb_detail), (redis_ok, redis_detail) = await asyncio.gather(
        check_supabase(), check_redis()
    )
    return {
        "ready": sb_ok and redis_ok,
        "checks": {
            "supabase": {"ok": sb_ok, "detail": sb_detail},
            "redis": {"ok": redis_ok, "detail": redis_detail},
        },
    }
