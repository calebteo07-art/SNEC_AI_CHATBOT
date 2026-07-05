"""Drift guard: the generated TS axis mirror must match the Python registry.

The frontend consumes `frontend/src/aurora/avatar/axes.generated.ts`, but the
Python `AVATAR_AXES` is the single source of truth. If someone edits the registry
without re-running the exporter, this test fails — keeping the two in lockstep.
Fix: `python tools/avatar/export_axes.py` and commit the regenerated file.
"""
from tools.avatar.export_axes import render_ts, TARGET


def test_generated_ts_matches_registry():
    assert TARGET.exists(), "axes.generated.ts is missing — run tools/avatar/export_axes.py"
    on_disk = TARGET.read_text(encoding="utf-8")
    assert on_disk == render_ts(), (
        "axes.generated.ts is stale vs tools/avatar/parts.py — "
        "run `python tools/avatar/export_axes.py` and commit."
    )
