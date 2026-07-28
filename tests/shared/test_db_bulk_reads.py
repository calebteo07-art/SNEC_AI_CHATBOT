"""Bounded bulk reads — the paginator behind every P2 cohort aggregation.

PostgREST caps rows server-side and `.select()` gives the caller no way to tell a
complete result from a truncated one; `get_all_sessions()` compounds that with its own
`limit=500` default. `_fetch_all` pages with `.range()` and returns `(rows, complete)`
so a cap hit becomes a fact the endpoint can report rather than a silently short answer.

The fake below implements the builder for real — `.range(start, end)` slices inclusively
at BOTH ends, exactly like PostgREST — so an off-by-one in the page arithmetic fails here
instead of dropping or double-counting one row per page in production.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import tools.shared.db as db


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
    """Supabase client stub. Each .table() hands back a FRESH builder, matching the real
    client — a shared builder would let one page's filters leak into the next."""

    def __init__(self, rows_by_table: dict[str, list[dict]]):
        self._rows_by_table = rows_by_table
        self.log: list = []

    def table(self, name: str):
        self.log.append(("table", name))
        return _FakeQuery(self._rows_by_table.get(name, []), self.log)


def _sessions(n: int, tokens: int = 100) -> list[dict]:
    return [{"student_id": "act1", "token_count": tokens} for _ in range(n)]


@pytest.mark.asyncio
async def test_bulk_read_paginates_past_max_rows():
    """2500 rows over a 1000-row page size: three requests, every row returned, complete."""
    fake = _FakeClient({"chat_sessions": _sessions(2500)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db._fetch_all("chat_sessions", "student_id, token_count")
    assert len(rows) == 2500
    assert complete is True
    assert [c for c in fake.log if c[0] == "range"] == [
        ("range", 0, 999), ("range", 1000, 1999), ("range", 2000, 2999)
    ]


@pytest.mark.asyncio
async def test_bulk_read_flags_incomplete_at_page_cap():
    """max_pages is a hard stop, not a guess. Exhausting it without a short page means
    rows may remain, so complete is False — the caller must not present a total."""
    fake = _FakeClient({"chat_sessions": _sessions(250)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db._fetch_all(
            "chat_sessions", "student_id, token_count", page=100, max_pages=2
        )
    assert len(rows) == 200
    assert complete is False


@pytest.mark.asyncio
async def test_bulk_read_applies_equality_filters():
    fake = _FakeClient({"chat_sessions": [
        {"student_id": "act1", "token_count": 10},
        {"student_id": "rem1", "token_count": 99},
    ]})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db._fetch_all(
            "chat_sessions", "student_id, token_count", student_id="act1"
        )
    assert rows == [{"student_id": "act1", "token_count": 10}]
    assert complete is True
    assert ("eq", "student_id", "act1") in fake.log


@pytest.mark.asyncio
async def test_get_all_session_tokens_projects_only_two_columns():
    """chat_sessions.summary is free-text conversation content and every row also carries
    a topic and a model string. A token total needs two columns; pulling `*` across the
    whole table would drag all of that onto the single prod worker for nothing."""
    fake = _FakeClient({"chat_sessions": _sessions(3)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db.get_all_session_tokens()
    assert len(rows) == 3
    assert complete is True
    assert ("table", "chat_sessions") in fake.log
    assert ("select", "student_id, token_count") in fake.log


@pytest.mark.asyncio
async def test_get_all_sessions_stays_capped_at_500():
    """Regression guard on the DELIBERATE cap: /api/admin/activity shares this read and it
    selects `*`. The token fix must arrive as a sibling read, never as a widening of this
    one — uncapping it would pull every session's full row on every dashboard load."""
    fake = _FakeClient({"chat_sessions": _sessions(600)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows = await db.get_all_sessions()
    assert len(rows) == 500
    assert ("limit", 500) in fake.log
    assert not [c for c in fake.log if c[0] == "range"]
