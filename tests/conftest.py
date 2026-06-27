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

This is pure test-harness hygiene — it touches no product code path and weakens
no production invariant (the singletons still behave normally at runtime).
"""
import pytest


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
    # student_id. No test exercises /api/checkin/question yet, but reset it too so a
    # future test can't inherit a stale question from an earlier one.
    try:
        from tools.api.routers.checkin import _question_cache
        _question_cache.clear()
    except Exception:
        pass


@pytest.fixture(autouse=True)
def isolate_shared_api_state():
    """Give every test a clean slate of the shared API singletons."""
    _reset_shared_api_state()
    yield
    _reset_shared_api_state()
