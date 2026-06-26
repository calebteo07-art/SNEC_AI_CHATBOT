"""Liveness vs readiness.

/health must stay cheap (the keep-alive cron hits it every 10 min and must not
hammer the DB). /health/ready actually probes dependencies and returns 503 when
one is down, so a load balancer can pull a sick instance out of rotation.
"""
import asyncio
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.api.health import check_redis

client = TestClient(app)


def test_liveness_is_cheap_and_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_readiness_200_when_all_deps_ok():
    report = {"ready": True, "checks": {"supabase": {"ok": True}, "redis": {"ok": True}}}
    with patch("tools.api.server.readiness_report", new=AsyncMock(return_value=report)):
        r = client.get("/health/ready")
    assert r.status_code == 200
    assert r.json()["ready"] is True


def test_readiness_503_when_a_dep_is_down():
    report = {"ready": False, "checks": {"supabase": {"ok": False, "detail": "timeout"}}}
    with patch("tools.api.server.readiness_report", new=AsyncMock(return_value=report)):
        r = client.get("/health/ready")
    assert r.status_code == 503
    assert r.json()["ready"] is False


def test_redis_check_is_ok_when_not_configured(monkeypatch):
    # Redis is optional at WEB_CONCURRENCY=1; absence must not fail readiness.
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.delenv("RATELIMIT_STORAGE_URI", raising=False)
    ok, detail = asyncio.run(check_redis())
    assert ok is True
    assert detail == "not_configured"
