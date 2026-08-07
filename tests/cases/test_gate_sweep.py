"""Every case route is gated — enumerated from the app, not from memory.

The existing access tests name routes by hand, so a route added later is gated only if
whoever added it remembered. Two real gaps came from exactly that:

  * `_check_case_access` enforced difficulty and never the student's ROLE POOL, so every
    one of the five station routes served OT content to an OA student.
  * `GET /api/cases/{id}/checklist` is the one case-content route with no access check at
    all — and the dedicated test file enumerates the other five without it.

This sweep walks `app.routes` and asserts the contract for every path carrying a
`{case_id}` parameter, so a NEW endpoint is covered the day it lands rather than the day
someone remembers to add it here. When it fails on a route you just wrote, the fix is to
gate the route — not to add it to an exclusion list.
"""
import inspect
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

# An OT case: beginner (so the tier gate is not what stops it) and out of an OA student's
# pool. 15 of the 54 real OT cases are beginner, so this needs no contrived data.
_OT_CASE = {
    "case_id": "case_ot_sweep", "title": "A-scan biometry", "difficulty": "beginner",
    "topic": "ascan_biometry", "role": "OT", "estimated_minutes": 12,
    "patient": {"name": "Mdm Lee", "age": 68, "presenting_complaint": "pre-op"},
    "examination_findings": {}, "rubric": {}, "history": {},
}

# Minimal bodies for the routes that need one. A 422 would mask the access check, which is
# the whole point of the sweep.
_BODIES: dict[str, dict] = {
    "chat": {"messages": [{"role": "user", "content": "hello"}]},
    "observe": {"messages": [{"role": "user", "content": "hello"}], "already_ticked": []},
    "action": {"action_label": "Measure IOP", "technique": "I would seat the patient…",
               "finding": "", "satisfies_steps": [1]},
    "submit": {"messages": [{"role": "user", "content": "hello"}], "findings": "f",
               "recommendation": "r", "performed_steps": [], "skipped_steps": []},
    "forfeit": {},
}


def _case_routes() -> list[tuple[str, str]]:
    """(method, path) for every route parameterised by case_id.

    Read from `app.openapi()` — a PUBLIC, versioned contract — rather than by walking
    `app.routes`. Two attempts at walking it failed on CI and neither failed here:

      1. `isinstance(r, APIRoute)` — a router's `route_class` is configurable, so the class
         a test imports need not be the one that built the routes.
      2. Recursing on `.routes` — on CI, `include_router` appends nine `_IncludedRouter`
         wrappers that expose the sub-routes under some other name entirely.

    `requirements.txt` pins only `fastapi>=0.111.0`, so CI resolves a different version from
    this box and `app.routes` has a different SHAPE there. Introspecting a library's
    internals is the mistake; `openapi()` is FastAPI's own flattening, which is guaranteed
    to keep working because it is the documented output.

    The tripwire below is what caught both attempts. Keep it.
    """
    spec = app.openapi()
    verbs = {"get", "post", "put", "patch", "delete"}
    out = []
    for path, ops in spec.get("paths", {}).items():
        if "{case_id}" not in path:
            continue
        for method in ops:
            if method.lower() in verbs:
                out.append((method.upper(), path))
    return sorted(set(out))


def test_the_sweep_actually_found_the_routes():
    """A selector that silently matches nothing would make every assertion below vacuous.

    This has now fired twice in anger, both times on CI only, and both times the sweep would
    otherwise have collected ZERO parametrized cases and reported green.
    """
    routes = _case_routes()
    if len(routes) < 6:
        seen = sorted(app.openapi().get("paths", {}))[:60]
        raise AssertionError(
            f"the sweep found {len(routes)} case routes. The schema advertises "
            f"{len(seen)} paths: {seen}")
    paths = {p for _, p in routes}
    for needle in ("station", "chat", "submit", "observe", "action"):
        assert any(needle in p for p in paths), f"{needle} route missing from the sweep"


@pytest.mark.parametrize("method,path", _case_routes(), ids=lambda v: str(v))
def test_no_case_route_serves_a_case_outside_the_students_pool(method, path):
    url = path.replace("{case_id}", "case_ot_sweep")
    key = path.rstrip("/").split("/")[-1]
    body = _BODIES.get(key, {})

    with patch.dict("tools.api.shared._case_cache", {"case_ot_sweep": _OT_CASE}, clear=False), \
         patch("tools.api.routers.cases.load_case", return_value=_OT_CASE), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_ot_sweep"]), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.shared.db.get_profile", new=AsyncMock(return_value={"role": "OA"})):
        client = TestClient(app)
        cookies = {"eyebot_token": create_access_token("stu-sweep", "student", "OA")}
        r = (client.get(url, cookies=cookies) if method == "GET"
             else client.request(method, url, json=body, cookies=cookies))

    assert r.status_code != 200, (
        f"{method} {path} served an OT case to an OA student. Add the pool check: pass the "
        f"case through _check_case_access(student_id, case, student_role, account_role)."
    )
    # 422 would mean the body never reached the handler, so the gate was never exercised —
    # a green that proves nothing. Fix the fixture body, not the assertion.
    assert r.status_code != 422, f"{method} {path}: fixture body rejected, gate untested"


def test_every_case_route_runs_the_gate():
    """Static backstop for the dynamic sweep: each handler must MENTION the gate.

    Catches a route that returns non-200 for an unrelated reason and so passes the
    behavioural sweep by accident — e.g. `/checklist`, which resolves by procedure name and
    404s for most gated cases while carrying no access check at all.
    """
    from tools.api.routers.cases import router as cases_router
    ungated = []
    for r in cases_router.routes:
        if "{case_id}" not in getattr(r, "path", "") or not getattr(r, "methods", None):
            continue
        try:
            src = inspect.getsource(r.endpoint)
        except (OSError, TypeError):
            continue
        if "_check_case_access" not in src:
            ungated.append(f"{sorted(set(r.methods) - {'HEAD', 'OPTIONS'})} {r.path}")
    assert ungated == [], (
        "these case routes never call _check_case_access:\n  " + "\n  ".join(ungated))
