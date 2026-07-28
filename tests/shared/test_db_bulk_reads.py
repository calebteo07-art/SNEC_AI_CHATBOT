"""Bounded bulk reads — the paginator behind every P2 cohort aggregation.

PostgREST caps rows server-side and `.select()` gives the caller no way to tell a
complete result from a truncated one; `get_all_sessions()` compounds that with its own
`limit=500` default. `_fetch_all` pages with `.order().range()` and returns
`(rows, complete)` so a cap hit becomes a fact the endpoint can report rather than a
silently short answer.

The shared fake (tests/support/postgrest_fake.py) implements the builder for real —
`.range(start, end)` slices inclusively at BOTH ends, exactly like PostgREST — so an
off-by-one in the page arithmetic fails here instead of dropping or double-counting one
row per page in production.
"""
import asyncio

import pytest
from unittest.mock import AsyncMock, patch

import tools.shared.db as db
from tests.support.postgrest_fake import FakeClient


def _sessions(n: int, tokens: int = 100) -> list[dict]:
    return [{"student_id": "act1", "token_count": tokens} for _ in range(n)]


@pytest.mark.asyncio
async def test_bulk_read_paginates_past_max_rows():
    """2500 rows over a 1000-row page size: three requests, every row returned, complete."""
    fake = FakeClient({"chat_sessions": _sessions(2500)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db._fetch_all(
            "chat_sessions", "student_id, token_count", order_by="student_id"
        )
    assert len(rows) == 2500
    assert complete is True
    assert [c for c in fake.log if c[0] == "range"] == [
        ("range", 0, 999), ("range", 1000, 1999), ("range", 2000, 2999)
    ]


@pytest.mark.asyncio
async def test_bulk_read_flags_incomplete_at_page_cap():
    """max_pages is a hard stop, not a guess. Exhausting it without a short page means
    rows may remain, so complete is False — the caller must not present a total."""
    fake = FakeClient({"chat_sessions": _sessions(250)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db._fetch_all(
            "chat_sessions", "student_id, token_count", order_by="student_id",
            page=100, max_pages=2,
        )
    assert len(rows) == 200
    assert complete is False


@pytest.mark.asyncio
async def test_bulk_read_orders_by_the_given_key():
    """`.range()` compiles to offset/limit with no ordering guarantee unless the query
    also carries an ORDER BY (Postgres gives none across LIMIT/OFFSET on its own) — a
    plan flip to a parallel seq scan would otherwise return worker-interleaved order that
    changes between executions, silently overlapping/skipping rows across pages.
    order_by must reach the actual query, every time this is called."""
    fake = FakeClient({"chat_sessions": _sessions(3)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        await db._fetch_all("chat_sessions", "student_id, token_count", order_by="session_id")
    assert ("order", "session_id", False) in fake.log


@pytest.mark.asyncio
async def test_bulk_read_flags_incomplete_when_server_clamps_page_size():
    """If `page` exceeds the PostgREST deployment's db-max-rows setting, the server
    silently clamps every response below the requested page size. Every page then looks
    "short" and complete reports True on a read that is actually truncated — the exact
    failure _fetch_all exists to prevent, failing open. This currently only works because
    `page`'s 1000 default coincides with the platform default; this test pins the failure
    mode for when it doesn't (see the `page` constraint in _fetch_all's docstring)."""
    # Server db-max-rows = 300; caller (mis)configured page=1000 anyway.
    fake = FakeClient({"chat_sessions": _sessions(1000)}, max_rows=300)
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db._fetch_all(
            "chat_sessions", "student_id, token_count", order_by="student_id", page=1000,
        )
    # Only 300 of the real 1000 rows ever arrive, but they look like a short (hence
    # final) page relative to the requested page=1000, so complete is wrongly True.
    assert len(rows) == 300
    assert complete is True


@pytest.mark.asyncio
async def test_bulk_read_budget_exhausted_after_one_page_degrades_gracefully():
    """Once at least one page has been read, running out of the time budget must degrade
    to (rows, False) rather than raising — a caller that already has SOME data gets a
    floor total, not a 500. Real (small) delays are used so the budget/remaining
    arithmetic itself is exercised, not mocked away."""
    # One full page (1000 rows, so it does NOT look "short" on its own) that takes 100ms;
    # a 50ms budget comfortably covers page 0 (the floor timeout is >= 1s regardless) but
    # is long gone by the time page 1's pre-flight budget check runs.
    fake = FakeClient({"chat_sessions": _sessions(1000)}, delay=0.1)
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db._fetch_all(
            "chat_sessions", "student_id, token_count", order_by="student_id",
            page=1000, budget=0.05,
        )
    assert len(rows) == 1000
    assert complete is False
    # Only page 0 was ever attempted — the budget check must have skipped page 1 entirely.
    assert [c for c in fake.log if c[0] == "range"] == [("range", 0, 999)]


@pytest.mark.asyncio
async def test_bulk_read_budget_exhausted_on_first_page_raises():
    """If the budget is already gone before ANY row was read, the paginator must NOT
    degrade to ([], False) — that would render as "≥ 0", a real measurement of zero for a
    read that never happened, the exact P1 defect class this exists to eliminate. The
    first page always gets its floor timeout (>=1s per the min/max clamp) regardless of
    how negative the budget is; if even that can't complete, the exception must propagate
    so the caller fails closed (its own try/except turns this into a 500)."""
    fake = FakeClient({"chat_sessions": _sessions(5)}, delay=1.2)
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        with pytest.raises(asyncio.TimeoutError):
            await db._fetch_all(
                "chat_sessions", "student_id, token_count", order_by="student_id",
                budget=-5.0,
            )


@pytest.mark.asyncio
async def test_get_all_session_tokens_projects_only_two_columns():
    """chat_sessions.summary is free-text conversation content and every row also carries
    a topic and a model string. A token total needs two columns; pulling `*` across the
    whole table would drag all of that onto the single prod worker for nothing. Also
    pins the stable order key the real wrapper must pass through to _fetch_all."""
    fake = FakeClient({"chat_sessions": _sessions(3)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows, complete = await db.get_all_session_tokens()
    assert len(rows) == 3
    assert complete is True
    assert ("table", "chat_sessions") in fake.log
    assert ("select", "student_id, token_count") in fake.log
    assert ("order", "session_id", False) in fake.log


@pytest.mark.asyncio
async def test_get_all_sessions_stays_capped_at_500():
    """Regression guard on the DELIBERATE cap: /api/admin/activity shares this read and it
    selects `*`. The token fix must arrive as a sibling read, never as a widening of this
    one — uncapping it would pull every session's full row on every dashboard load."""
    fake = FakeClient({"chat_sessions": _sessions(600)})
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)):
        rows = await db.get_all_sessions()
    assert len(rows) == 500
    assert ("limit", 500) in fake.log
    assert not [c for c in fake.log if c[0] == "range"]
