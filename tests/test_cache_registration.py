"""Every process-global TTL cache must be reset between tests.

pytest runs the whole suite in ONE process, so a cache that `_reset_shared_api_state`
does not know about survives across tests and serves one test's stubbed rows to every
later test — silently, as a plausible-looking pass. The failure is order-dependent and
only shows up in a full-suite run, which makes it expensive to find and easy to
misdiagnose.

This asserts the registration DIRECTLY rather than relying on a later test noticing, so
adding a cache without wiring it up fails here immediately and by name.
"""
from tests.conftest import _reset_shared_api_state


def test_reset_clears_the_shared_cohort_read_cache():
    from tools.supervisor import cohort_reads

    cohort_reads._cache["all"] = (0.0, "seeded")
    _reset_shared_api_state()
    assert cohort_reads._cache == {}


def test_reset_clears_the_caches_that_were_already_registered():
    # Pins the three that already existed, so a refactor of _reset_shared_api_state
    # cannot quietly drop one on its way to adding another.
    from tools.api.routers import admin
    from tools.supervisor import at_risk

    admin._cohort_cache[("all", "90")] = (0.0, {"seeded": True})
    at_risk._cache["all"] = (0.0, [])
    _reset_shared_api_state()
    assert admin._cohort_cache == {}
    assert at_risk._cache == {}
