# OSCE OA/PSA Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** OA and PSA students see ONE shared clinical OSCE case set (the union of all clinical cases), served via a pool-based resolver — realising the OA ≡ PSA rule without losing any authored scenario.

**Architecture:** Mirror flashcards' pool model in the case resolver. Add `case_pool(role)` (OA/PSA→"CLINICAL", OT→"OT") and a unified "CLINICAL" case taxonomy (union of the old OA + PSA sets). Case visibility and set-resolution key off the pool, so OA and PSA see identical content. No case files are deleted or retagged (the OA/PSA files are complementary scenarios, not redundant duplicates — trimming would discard valid practice).

**Tech Stack:** FastAPI (`tools/api/routers/cases.py`), `tools/cases/topic_sets.py`, pytest (MOCK_MODE), station_assert harness.

> **Deviation from spec §5 (flagged):** the spec proposed deduping to ~50–60 cases. On inspection the OA/PSA files are *different* scenarios on shared procedures, so we keep the full union (both roles gain access to ~101 clinical cases) instead of deleting content. Same end-state ("one shared set served to both"), higher value, lower risk.

---

## File Structure
- `tools/cases/topic_sets.py` — MODIFY: add `case_pool()` + `case_visible()`, add unified "CLINICAL" to `SET_LABELS`/`_RULES`/`_DEFAULT`, route `resolve_set`/`sets_for`/`label_for` through the pool.
- `tools/api/routers/cases.py` — MODIFY: both role-filter sites (`get_cases` ~244, `get_case_topics` ~343) use `case_visible`; resolve sets by the student's pool.
- `tests/cases/test_pool_visibility.py` — CREATE.

---

## Task 1: Pool model + unified CLINICAL taxonomy in topic_sets.py

**Files:**
- Modify: `tools/cases/topic_sets.py`
- Test: `tests/cases/test_pool_visibility.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/cases/test_pool_visibility.py
from tools.cases.topic_sets import case_pool, case_visible, sets_for, resolve_set

def test_case_pool_maps_oa_psa_together():
    assert case_pool("OA") == "CLINICAL"
    assert case_pool("PSA") == "CLINICAL"
    assert case_pool("OT") == "OT"

def test_oa_and_psa_share_one_taxonomy():
    assert sets_for("OA") == sets_for("PSA")
    keys = {k for k, _ in sets_for("OA")}
    assert {"perioperative", "triage_referral"} <= keys  # union of both old sets

def test_case_visible_by_pool():
    assert case_visible("PSA", "OA") is True    # OA-authored case shown to PSA
    assert case_visible("OA", "PSA") is True
    assert case_visible("OT", "OA") is False
    assert case_visible("OA", "any") is True

def test_resolve_set_is_pool_consistent():
    # OA and PSA bucket the same topic into the same set
    assert resolve_set("OA", "triage_referral_history") == resolve_set("PSA", "triage_referral_history")
```

- [ ] **Step 2: Run — expect FAIL** (`case_pool` undefined).

Run: `python -m pytest tests/cases/test_pool_visibility.py -q`

- [ ] **Step 3: Implement in `topic_sets.py`.**

Add a unified `"CLINICAL"` entry to `SET_LABELS` = the 11-set union (the 10 OA sets plus `("triage_referral", "Triage & Referral")`). Keep the existing `"OT"` entry. Add `"CLINICAL"` to `_RULES` = the OA rules PLUS the PSA-only triage/referral rules:

```python
# in _RULES, add:
    "CLINICAL": [
        # ... paste the OA rule list verbatim, then add the PSA triage/referral rules:
        ("triage", "triage_referral"), ("referral", "triage_referral"),
        ("floaters", "triage_referral"), ("flashes", "triage_referral"),
        ("pain_assessment", "ocular_emergencies"), ("redflags", "ocular_emergencies"),
        ("acute_glaucoma", "ocular_emergencies"),
    ],
```

(Note: remove the OA-only `("triage", "history_taking")` line when building CLINICAL — triage now has its own set.) Add `_DEFAULT["CLINICAL"] = "history_taking"`. Then add the pool helpers and route the public functions through the pool:

```python
def case_pool(role: str) -> str:
    """OA and PSA share the CLINICAL case pool; OT is separate."""
    return "OT" if (role or "").upper() == "OT" else "CLINICAL"

def case_visible(student_role: str, case_role: str) -> bool:
    """A case is visible if it's role-neutral ('any') or in the student's pool."""
    if (case_role or "any") == "any":
        return True
    return case_pool(case_role) == case_pool(student_role)

def resolve_set(role: str, topic: str) -> str:
    pool = case_pool(role)
    topic = (topic or "").lower()
    for kw, key in _RULES.get(pool, []):
        if kw in topic:
            return key
    return _DEFAULT.get(pool, "history_taking")

def label_for(role: str, set_key: str) -> str:
    for key, label in SET_LABELS.get(case_pool(role), []):
        if key == set_key:
            return label
    return set_key.replace("_", " ").title()

def sets_for(role: str) -> list[tuple[str, str]]:
    return SET_LABELS.get(case_pool(role), [])
```

Leave the old `"OA"`/`"PSA"` entries in the dicts (dormant, harmless) or delete them — either is fine since lookups now go through `case_pool`.

- [ ] **Step 4: Run — expect PASS.**

Run: `python -m pytest tests/cases/test_pool_visibility.py -q`

- [ ] **Step 5: Commit**

```bash
git add tools/cases/topic_sets.py tests/cases/test_pool_visibility.py
git commit -m "feat(osce): pool-based case taxonomy — OA and PSA share one CLINICAL set"
```

---

## Task 2: Pool-based visibility in the cases router

**Files:**
- Modify: `tools/api/routers/cases.py` (import + two filter sites)
- Test: `tests/cases/test_pool_visibility.py` (append an API-level test)

- [ ] **Step 1: Append the failing API test**

```python
import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers  # reuse existing helper

@pytest.mark.asyncio
async def test_oa_and_psa_see_identical_case_ids(monkeypatch):
    from tools.api.routers import cases as mod
    async def _prog(_sid): return {}
    monkeypatch.setattr(mod, "get_case_progress", _prog)
    async def _ids_for(role):
        async def _profile(_sid): return {"role": role}
        monkeypatch.setattr(mod, "get_profile", _profile)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
            r = await ac.get("/api/cases", headers=auth_headers(role=role))
        assert r.status_code == 200
        return {c["case_id"] for c in r.json()["cases"]}
    assert await _ids_for("OA") == await _ids_for("PSA")
```

> Check `tests/api/conftest.py` for the exact `auth_headers` signature before running; adapt the import/fixture to match the pattern used in `tests/api/test_flashcards_topics_tiers.py`.

- [ ] **Step 2: Run — expect FAIL** (OA and PSA still see different sets).

- [ ] **Step 3: Edit `cases.py`.** Add `case_visible` to the import from `tools.cases.topic_sets`, then replace BOTH filter sites:

```python
# was: case_role = c.get("role", "any") or "any"
#      if case_role not in (role, "any"): continue
case_role = c.get("role", "any") or "any"
if not case_visible(role, case_role):
    continue
```

`resolve_set(role, ...)` and `sets_for(role)` already pool-resolve internally (Task 1), so no other change is needed.

- [ ] **Step 4: Run — expect PASS.**

Run: `python -m pytest tests/cases/test_pool_visibility.py -q`

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/cases.py tests/cases/test_pool_visibility.py
git commit -m "feat(osce): serve one shared clinical case set to both OA and PSA"
```

---

## Task 3: Coverage — every clinical/OT set has a case for the role

**Files:**
- Modify: `tests/content/test_coverage.py` (append)

- [ ] **Step 1: Append the test**

```python
def test_every_case_set_has_at_least_one_case_per_pool():
    import json
    from pathlib import Path
    from tools.cases.topic_sets import sets_for, resolve_set, case_visible
    cases_dir = Path(__file__).resolve().parent.parent.parent / "cases"
    loaded = [json.loads(p.read_text(encoding="utf-8")) for p in cases_dir.glob("case_*.json")]
    for role in ("OA", "OT"):  # OA covers CLINICAL, OT covers OT (PSA == OA pool)
        visible = [c for c in loaded if case_visible(role, c.get("role", "any"))]
        buckets = {resolve_set(role, c.get("topic", "")) for c in visible}
        for set_key, label in sets_for(role):
            assert set_key in buckets, f"{role} set '{set_key}' has no case"
```

- [ ] **Step 2: Run — expect PASS** (existing cases cover every set). If a set is empty, that's a real gap: author a case for it before proceeding.

Run: `python -m pytest tests/content/test_coverage.py -q`

- [ ] **Step 3: Commit**

```bash
git add tests/content/test_coverage.py
git commit -m "test(content): every OSCE case set has a case for its pool"
```

---

## Task 4: Full verification

- [ ] **Step 1: Backend suite (CI parity), incl. provenance guard**

Run: `python -m pytest -q`
Expected: PASS (provenance + station-endpoint tests unaffected; new tests green).

- [ ] **Step 2: station_assert harness** (pre-push gate). Warm the dynamic case route with an authed curl first (cold-compile > 15 s), then:

Run: `node frontend/tests/station_assert.mjs`
Expected: all green.

- [ ] **Step 3: Ship** — this change has no placeholder content, so it MAY be pushed once green (independent of the flashcards placeholder hold). Stage only the OSCE-related files.

```bash
git push origin main
```

---

## Notes
- No Gemini, no case-file deletion, no case retagging. Fully reversible via git.
- If the user later wants a trimmed set instead of the union, that's a separate reviewed content pass (decide which of each near-duplicate pair to keep).
