"""Bulk analytics reads must project narrowly and report their own completeness.

P2 cohort aggregation scans two whole tables on the single prod worker. `select("*")`
on case_progress drags the `coaching` JSONB — a per-row feedback blob — for every
attempt, and an unpaginated read silently truncates at PostgREST's row cap. These
siblings project only the columns the aggregators read and return `(rows, complete)`
so a capped read renders as "≥ N" instead of a confident wrong total.

They are SIBLINGS, not replacements. `get_all_case_progress` selects `*` and is shared
with /api/admin/activity (whose feed reads score_100/safe/missed_critical out of it);
`get_case_progress_since`'s two-column projection is its documented reason for existing.
Narrowing or widening either one to "help" would change a shipped endpoint, so the last
test pins both.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

import tools.shared.db as db


class _Query:
    """Stand-in for the supabase-py query builder.

    Records the table name and projection, serves `.range()` slices out of a seeded row
    list, and passes every other builder call (`.order`, `.gte`, `.eq`, ...) straight
    through via __getattr__ — so these tests pin the projection without coupling to how
    `_fetch_all` orders or windows its pages.

    NOTE: Task 2's code review added a shared PostgREST fake at
    `tests/support/postgrest_fake.py` (FakeQuery/FakeClient, including a `max_rows` knob
    that models the server-side db-max-rows clamp). This local stand-in is kept
    deliberately: it exists to assert the PROJECTION STRING these two new readers pass,
    and its permissive __getattr__ passthrough is what makes it indifferent to the rest
    of the builder chain. If you find yourself needing real pagination behaviour here,
    import the shared fake instead of growing this one.
    """

    def __init__(self, table: str, rows: list, calls: dict, error: Exception | None):
        self._rows = rows
        self._calls = calls
        self._error = error
        self._slice: tuple[int, int] | None = None
        calls.setdefault("tables", []).append(table)

    def select(self, columns):
        self._calls.setdefault("columns", []).append(columns)
        return self

    def range(self, start, end):
        self._calls.setdefault("ranges", []).append((start, end))
        self._slice = (start, end)
        return self

    def __getattr__(self, name):
        def _passthrough(*args, **kwargs):
            return self
        return _passthrough

    async def execute(self):
        if self._error is not None:
            raise self._error
        if self._slice is None:
            return SimpleNamespace(data=list(self._rows))
        start, end = self._slice
        # PostgREST .range() bounds are INCLUSIVE on both ends.
        return SimpleNamespace(data=list(self._rows[start:end + 1]))


class _Client:
    """Mock Supabase client: sync builder chain, async execute() (supabase-py 2.x)."""

    def __init__(self, rows: list, calls: dict, error: Exception | None = None):
        self._rows = rows
        self._calls = calls
        self._error = error

    def table(self, name: str) -> _Query:
        return _Query(name, self._rows, self._calls, self._error)


def _patch_client(rows: list, calls: dict, error: Exception | None = None):
    return patch(
        "tools.shared.db._get_client",
        new=AsyncMock(return_value=_Client(rows, calls, error)),
    )


@pytest.mark.asyncio
async def test_get_all_flashcard_attempts_projection_and_completeness():
    rows = [
        {"student_id": "s1", "topic_tag": "glaucoma", "correct": True,
         "ts": "2026-07-20T10:00:00Z"},
        {"student_id": "s2", "topic_tag": "optics__advanced", "correct": False,
         "ts": "2026-07-21T10:00:00Z"},
    ]
    calls: dict = {}
    with _patch_client(rows, calls):
        result, complete = await db.get_all_flashcard_attempts()

    assert set(calls["tables"]) == {"flashcard_attempts"}
    projection = calls["columns"][0]
    assert projection == "student_id, topic_tag, correct, ts"
    # flashcard_attempts is the highest-volume table in the product; `*` would also
    # pull card_id + score, which no cohort aggregator reads.
    assert "*" not in projection
    assert "card_id" not in projection
    assert result == rows
    # Two rows is a short first page → the table was read to the end.
    assert complete is True

    # The cap flag is the caller's honesty signal ("≥ 48.2k", not a wrong total), so it
    # must be forwarded verbatim from the paginator — never dropped or re-derived.
    with patch.object(db, "_fetch_all", new=AsyncMock(return_value=(rows, False))) as fetch:
        capped_rows, capped_complete = await db.get_all_flashcard_attempts()
    assert capped_rows == rows
    assert capped_complete is False
    # Pin the ORDER KEY, not just that some ordering happened. `.range()` compiles to
    # offset/limit, and Postgres gives no ordering guarantee across LIMIT/OFFSET without
    # an ORDER BY on a UNIQUE column — order by `ts` (or any non-unique column) and pages
    # silently overlap and skip rows while `complete=True` still reports success. The
    # builder fake passes `.order()` through unrecorded, so without this assertion a
    # wrong order key is invisible to the whole suite.
    assert fetch.await_args.kwargs["order_by"] == "attempt_id"


@pytest.mark.asyncio
async def test_get_all_flashcard_attempts_propagates_a_read_failure():
    """A missing table (pre-migration 010) or any read failure must RAISE, exactly like
    the per-student get_flashcard_attempts (db.py:214-225). No PostgREST exception type
    is importable in this tree, so the CALLER catches bare Exception and flags
    sources.flashcard = "unavailable"; swallowing it into ([], True) here would render
    an outage as a confident 0% cohort accuracy — the P1 defect class."""
    calls: dict = {}
    boom = RuntimeError('relation "public.flashcard_attempts" does not exist')
    with _patch_client([], calls, error=boom):
        with pytest.raises(RuntimeError, match="does not exist"):
            await db.get_all_flashcard_attempts()


@pytest.mark.asyncio
async def test_get_all_case_scores_excludes_coaching_blob():
    rows = [
        {"student_id": "s1", "case_id": "case_ot_001", "completed_at": "2026-07-20T10:00:00Z",
         "score_100": 82, "safe": True, "passed": True, "total_score": 32},
        {"student_id": "s2", "case_id": "case_oa_002", "completed_at": "2026-07-21T10:00:00Z",
         "score_100": None, "safe": None, "passed": True, "total_score": 28},
    ]
    calls: dict = {}
    with _patch_client(rows, calls):
        result, complete = await db.get_all_case_scores()

    assert set(calls["tables"]) == {"case_progress"}
    projection = calls["columns"][0]
    assert projection == ("student_id, case_id, completed_at, score_100, safe, passed, "
                          "total_score, missed_critical")
    # The one column with no fallback: osce_by_group's missed_top is built from it and
    # nothing else, so dropping it silently empties the most-missed panel forever.
    assert "missed_critical" in projection
    # The whole point of the sibling: never `*`, and never the per-row coaching JSONB,
    # which no cohort aggregator reads and which dominates the payload size.
    assert "*" not in projection
    assert "coaching" not in projection
    assert "consult_technique" not in projection
    assert result == rows
    assert complete is True
    # Ungraded pre-Tier-2 rows come back as NULLs, not zeros — per-metric denominators
    # (D13) depend on the aggregator being able to tell them apart.
    assert result[1]["score_100"] is None

    # Pin the ORDER KEY (see the flashcard test for why a wrong one corrupts silently).
    # `id` is the monotonic identity PK: ordering case_progress by `completed_at` would
    # be BOTH non-unique and unstable, and it is the plausible wrong guess here because
    # the two shipped readers next door both order by it.
    with patch.object(db, "_fetch_all", new=AsyncMock(return_value=([], True))) as fetch:
        await db.get_all_case_scores()
    assert fetch.await_args.kwargs["order_by"] == "id"


@pytest.mark.asyncio
async def test_existing_case_progress_reads_are_untouched():
    """The two live readers this task must NOT touch. get_all_case_progress feeds
    /api/admin/activity (admin.py:195), whose P1 feed emits score_100/safe/
    missed_critical straight out of `select("*")` — narrowing it would blank three
    fields on a shipped endpoint. get_case_progress_since (admin.py:260) is windowed
    at the DB on purpose. Both must stay exactly as they are."""
    calls: dict = {}
    with _patch_client([], calls):
        await db.get_all_case_progress()
    assert calls["columns"] == ["*"]
    assert calls["tables"] == ["case_progress"]

    calls2: dict = {}
    with _patch_client([], calls2):
        await db.get_case_progress_since("2026-07-01")
    assert calls2["columns"] == ["student_id, completed_at"]
    assert calls2["tables"] == ["case_progress"]
