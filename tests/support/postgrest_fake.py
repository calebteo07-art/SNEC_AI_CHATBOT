"""Shared PostgREST query-builder fake for tests exercising tools/shared/db.py's
paginated bulk reads (`_fetch_all` and its callers).

Implements the builder for real rather than trivially returning canned data:

- `.range(start, end)` slices inclusively at BOTH ends, exactly like PostgREST, so an
  off-by-one in page arithmetic fails a test here instead of dropping or double-counting
  a row in production.
- `.order(column)` actually sorts, so a test can assert pagination behaves correctly
  under a real ordering, not just that `.order(...)` was called.
- `max_rows` models the server-side `db-max-rows` setting: a real PostgREST deployment
  clamps every single response to that ceiling regardless of what `.range()`/`.limit()`
  asked for. A caller that configures `page` above `db-max-rows` gets pages that are
  always short, so `_fetch_all` reports `complete=True` on a truncated read — this fake
  is what lets a test pin that failure mode.
- `delay` (seconds) is an optional per-`execute()` sleep, for tests that need to exercise
  real timeout/budget enforcement rather than mocking it away.
"""
import asyncio
from unittest.mock import MagicMock


class FakeQuery:
    """Minimal PostgREST query builder: sync chaining, async execute()."""

    def __init__(self, rows: list[dict], log: list, *,
                max_rows: int | None = None, delay: float = 0.0):
        self._rows = list(rows)
        self._log = log
        self._window: tuple[int, int] | None = None
        self._limit: int | None = None
        self._max_rows = max_rows
        self._delay = delay

    def select(self, columns: str):
        self._log.append(("select", columns))
        return self

    def eq(self, column: str, value):
        self._log.append(("eq", column, value))
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def gte(self, column: str, value):
        """Windowing filter. Compared as strings, which is faithful for the ISO-8601
        timestamps this is used with (lexicographic order == chronological order at a
        fixed format) and would not be for numerics — pass ISO strings only. A NULL in
        the column sorts below any bound, so such a row is outside every window."""
        self._log.append(("gte", column, value))
        self._rows = [r for r in self._rows if (r.get(column) or "") >= value]
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
        if self._delay:
            await asyncio.sleep(self._delay)
        rows = self._rows
        if self._window is not None:
            start, end = self._window
            rows = rows[start:end + 1]  # PostgREST .range() is inclusive at both ends
        if self._limit is not None:
            rows = rows[:self._limit]
        if self._max_rows is not None:
            # Mirrors PostgREST's db-max-rows: the server clamps every response to this
            # ceiling regardless of what .range()/.limit() requested.
            rows = rows[:self._max_rows]
        response = MagicMock()
        response.data = rows
        return response


class FakeClient:
    """Supabase client stub. Each .table() hands back a FRESH builder, matching the real
    client — a shared builder would let one page's filters leak into the next."""

    def __init__(self, rows_by_table: dict[str, list[dict]], *,
                max_rows: int | None = None, delay: float = 0.0):
        self._rows_by_table = rows_by_table
        self.log: list = []
        self._max_rows = max_rows
        self._delay = delay

    def table(self, name: str):
        self.log.append(("table", name))
        return FakeQuery(self._rows_by_table.get(name, []), self.log,
                         max_rows=self._max_rows, delay=self._delay)
