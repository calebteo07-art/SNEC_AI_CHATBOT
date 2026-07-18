"""Per-worker checklist read-cache (latency: kill the redundant Supabase round-trip).

`get_checklist_by_name` backs every OSCE station/observe/action/submit. The set of
checklists is small (~22) and static seed data, so the sync Supabase lookup must be
memoised per worker: a warm hit does ZERO Supabase I/O. This mirrors the blessed
`_case_cache` read-cache pattern.
"""
from types import SimpleNamespace
from unittest.mock import patch


def _fake_client(calls: dict, row: dict):
    class _Q:
        def select(self, *a, **k):
            return self

        def eq(self, *a, **k):
            return self

        def ilike(self, *a, **k):
            return self

        def limit(self, *a, **k):
            return self

        def execute(self):
            calls["n"] += 1
            return SimpleNamespace(data=[row])

    class _Client:
        def table(self, *a, **k):
            return _Q()

    return _Client()


def test_get_checklist_by_name_is_cached_per_worker():
    from tools.kb import search

    calls = {"n": 0}
    row = {"procedure_name": "NCT", "steps": [], "total_steps": 0}
    search._CHECKLIST_CACHE.clear()
    try:
        with patch.object(search, "_SUPABASE_ENABLED", True), \
             patch("tools.kb.supabase_client.get_client", return_value=_fake_client(calls, row)):
            first = search.get_checklist_by_name("NCT")
            second = search.get_checklist_by_name("NCT")
    finally:
        search._CHECKLIST_CACHE.clear()

    assert first == row
    assert second == row
    # Second lookup must be served from cache — only ONE Supabase query total.
    assert calls["n"] == 1
