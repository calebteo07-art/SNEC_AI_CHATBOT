"""/api/admin/token-summary must count every session, or say that it could not.

The endpoint read db.get_all_sessions(), which defaults limit=500 — past 500 sessions the
"AI tokens" KPI rendered a confident number that was simply too small, with nothing on the
wire to say so. It now reads the paginated two-column sibling and emits `complete`.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _admin_cookie():
    # Unique sub per test file so this file's requests never share a limiter bucket.
    return {"eyebot_token": create_access_token("stu_token_summary", "admin", "OA")}


class _FakeQuery:
    """Minimal PostgREST query builder: sync chaining, async execute()."""

    def __init__(self, rows: list[dict], log: list):
        self._rows = list(rows)
        self._log = log
        self._window: tuple[int, int] | None = None
        self._limit: int | None = None

    def select(self, columns: str):
        self._log.append(("select", columns))
        return self

    def eq(self, column: str, value):
        self._log.append(("eq", column, value))
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def order(self, column: str, desc: bool = False):
        self._log.append(("order", column, desc))
        self._rows.sort(key=lambda r: r.get(column) or "", reverse=desc)
        return self

    def limit(self, n: int):
        self._log.append(("limit", n))
        self._limit = n
        return self

    def range(self, start: int, end: int):
        self._log.append(("range", start, end))
        self._window = (start, end)
        return self

    async def execute(self):
        rows = self._rows
        if self._window is not None:
            start, end = self._window
            rows = rows[start:end + 1]  # PostgREST .range() is inclusive at both ends
        if self._limit is not None:
            rows = rows[:self._limit]
        response = MagicMock()
        response.data = rows
        return response


class _FakeClient:
    def __init__(self, rows_by_table: dict[str, list[dict]]):
        self._rows_by_table = rows_by_table
        self.log: list = []

    def table(self, name: str):
        self.log.append(("table", name))
        return _FakeQuery(self._rows_by_table.get(name, []), self.log)


def test_token_summary_counts_past_500_sessions():
    """1200 sessions x 100 tokens = 120_000. A limit=500 read reports 50_000 — a wrong
    number with no way for the UI to know. Patched at the client seam so the pagination
    itself is exercised end to end, not just the aggregation."""
    fake = _FakeClient({"chat_sessions": [
        {"student_id": "act1", "token_count": 100} for _ in range(1200)
    ]})
    active = [{"student_id": "act1", "role": "OA"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.status_code == 200
    body = r.json()
    assert body["total_tokens"] == 120_000
    assert body["complete"] is True
    by_student = {row["student_id"]: row["tokens"] for row in body["by_student"]}
    assert by_student == {"act1": 120_000}


def test_token_summary_flags_incomplete_at_cap():
    """A cap hit must reach the wire. `complete: false` means total_tokens is a FLOOR, and
    the KPI renders "≥ 30.0k" — a truthful lower bound beats a confident wrong total."""
    rows = [{"student_id": "act1", "token_count": 30_000}]
    active = [{"student_id": "act1", "role": "OA"}]
    with patch("tools.shared.db.get_all_session_tokens", new=AsyncMock(return_value=(rows, False))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.status_code == 200
    body = r.json()
    assert body["complete"] is False
    assert body["total_tokens"] == 30_000


def test_token_summary_reports_complete_on_a_full_read():
    rows = [{"student_id": "act1", "token_count": 42}]
    active = [{"student_id": "act1", "role": "OA"}]
    with patch("tools.shared.db.get_all_session_tokens", new=AsyncMock(return_value=(rows, True))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.json()["complete"] is True
    assert r.json()["total_tokens"] == 42


def test_token_summary_db_failure_is_a_500_not_a_zero():
    """P1's invariant: a failed read must never render as a real measurement of zero."""
    with patch("tools.shared.db.get_all_session_tokens",
               new=AsyncMock(side_effect=Exception("chat_sessions unavailable"))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=[])):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.status_code == 500
