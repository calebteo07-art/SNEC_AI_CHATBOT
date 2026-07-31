"""Session-wide test isolation for the EyeBot suite.

The FastAPI app keeps process-global mutable singletons that outlive a single
test: the slowapi rate-limit counters (``limiter._storage``) and the in-memory
case cache (``tools.api.shared._case_cache``). pytest runs the whole suite in
one process, so any test that exercises a rate-limited endpoint or that lets a
case land in the cache leaks that state into whichever test runs next.

That leakage is order-dependent and only bites when the *full* suite runs — the
classic shape behind ``tests/cases/test_station_endpoints.py::
test_action_returns_coaching`` passing in isolation but flaking in the full run
(e.g. a later ``/action`` call silently rate-limited into a 429, or a stale
cached case shadowing the one a test patched in). Reset both singletons before
*and* after every test so each one starts and ends from a clean, deterministic
baseline regardless of collection order.

The other job here is the opposite direction: ``_forbid_real_supabase`` stops the
suite from reaching *out* to the live production database. Both are pure
test-harness hygiene — they touch no product code path and weaken no production
invariant (the singletons still behave normally at runtime).
"""
import sys
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _forbid_real_supabase():
    """No test in this suite may reach production Supabase.

    ``tools/shared/db.py`` calls ``load_dotenv()`` and builds its client from
    SUPABASE_SERVICE_ROLE_KEY, so on any machine with a populated ``.env`` a db call
    left unstubbed reads — or WRITES — the **live production database** on every pytest
    run. Every db function funnels through ``db._get_client``, so blocking that one seam
    catches all of them.

    The assertion has to happen *after* the test: handlers wrap their reads in
    ``except Exception -> 500`` and the auth-guard tests accept any non-401/403, so
    raising alone is swallowed and a leaking test still passes. Recording the attempt and
    failing on the way out is what makes an unstubbed call impossible to miss — and it
    works identically with or without credentials present, so CI and a fresh worktree
    enforce the same rule the maintainer's box does.

    This lived in five individual test FILES and so protected nothing else: a sweep on
    2026-07-30 found 42 tests across 12 other files still reaching the real client,
    including ``insert_audit_event`` / ``insert_case_result`` / ``update_profile`` /
    ``update_approved`` — writes into production tables on every local and CI run. Global
    is the only scope at which this class of bug stops coming back.

    New test leaking? Stub the named db function in that file's own autouse fixture —
    see ``_stub_admin_db`` in tests/api/test_admin_endpoints.py for the house pattern.
    """
    attempted = []

    async def _blocked(*_args, **_kwargs):
        # The caller one frame up is the db.py function that went unstubbed — name it,
        # so the failure says what to patch instead of just that something leaked.
        attempted.append(sys._getframe(1).f_code.co_name)
        raise AssertionError("real Supabase client requested")

    with patch("tools.shared.db._get_client", new=_blocked):
        yield

    assert not attempted, (
        "these db calls reached production Supabase: "
        + ", ".join(sorted(set(attempted)))
        + " - stub them in this file's autouse fixture"
    )


def _reset_shared_api_state() -> None:
    """Clear the process-global mutable singletons shared across API tests."""
    from tools.api.shared import _case_cache, limiter

    # Drop every rate-limit counter so one test's requests can't push another
    # test's call over an endpoint's per-minute limit. No test relies on
    # rate-limit state surviving across tests.
    try:
        limiter._storage.reset()
    except Exception:
        # Reset is best-effort: a backend without reset() must not break the suite.
        pass

    # Empty the case cache so a case loaded/patched by one test can't shadow the
    # one a later test expects (or linger as a 404/200 surprise).
    _case_cache.clear()

    # Same class of per-process cache: the daily check-in question is memoised per
    # student_id, so without this a test that pins the clock would be served the
    # question an earlier test warmed under a different date.
    try:
        from tools.api.routers.checkin import _question_cache
        _question_cache.clear()
    except Exception:
        pass

    # And again for the cohort aggregate, memoised for 45s per (discipline, days). Any
    # admin test that touches /api/admin/cohort-analytics warms a live entry, and the next
    # test asking for the same view is served THAT payload instead of its own patched mocks.
    try:
        from tools.api.routers.admin import _cohort_cache
        _cohort_cache.clear()
    except Exception:
        pass

    # And the at-risk roll-up, memoised for 45s under a single key. It has no per-request
    # dimension at all, so ONE test that reaches get_at_risk() without patching
    # _CACHE_TTL_S serves its own stubbed rows to every later test in the process.
    try:
        from tools.supervisor.at_risk import _cache as _at_risk_cache
        _at_risk_cache.clear()
    except Exception:
        pass

    # And the shared cohort READ cache underneath all three of the above. It holds the raw
    # rows every admin roll-up reads, under a single key with no per-request dimension, so
    # one test that reaches it without patching _READ_TTL_S would serve its own stubbed
    # tables to every later test in the process.
    try:
        from tools.supervisor.cohort_reads import _cache as _cohort_reads_cache
        _cohort_reads_cache.clear()
    except Exception:
        pass


@pytest.fixture(autouse=True)
def isolate_shared_api_state():
    """Give every test a clean slate of the shared API singletons."""
    _reset_shared_api_state()
    yield
    _reset_shared_api_state()
