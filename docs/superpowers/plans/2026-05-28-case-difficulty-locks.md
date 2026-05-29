# Case Difficulty Locks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce case difficulty progression server-side so that students cannot bypass beginner/intermediate/advanced locks by calling the chat or submit endpoints directly.

**Architecture:** A single helper function `_check_case_access(student_id, case)` is added to `tools/api/server.py`. It reads the case difficulty, calls `get_case_progress` to count passing cases at the prerequisite level, and raises `HTTPException(403)` if the threshold is not met. The two existing case action endpoints (`case_chat` and `case_submit`) call this function immediately after the case is loaded, before any AI or evaluation work begins.

**Tech Stack:** FastAPI `HTTPException`, `get_case_progress` (already imported in server.py), `list_available_cases` + `load_case` + `_case_cache` (all already in scope in server.py), `pytest` + `unittest.mock` for tests, `fastapi.testclient.TestClient` for integration tests.

---

## Files Modified / Created

| Action | Path | Purpose |
|--------|------|---------|
| Create | `tests/cases/__init__.py` | Makes `tests/cases` a package so pytest discovers it |
| Create | `tests/cases/test_case_access.py` | All 10 tests (unit + integration) for the lock logic |
| Modify | `tools/api/server.py` | Add `_check_case_access`; wire into `case_chat` and `case_submit` |

---

## Task 1: Write the failing tests

**Files:**
- Create: `tests/cases/__init__.py`
- Create: `tests/cases/test_case_access.py`

- [ ] **Step 1: Create the package init file**

Create `tests/cases/__init__.py` as an empty file:

```python
# tests/cases/__init__.py
```

- [ ] **Step 2: Write all ten failing tests**

Create `tests/cases/test_case_access.py`:

```python
# tests/cases/test_case_access.py
"""Tests for _check_case_access and its enforcement in case_chat / case_submit."""
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from fastapi.testclient import TestClient

from tools.api.server import app, _check_case_access, _case_cache
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _auth_headers(student_id: str = "stu_test") -> dict:
    token = create_access_token(student_id, "student", "OA")
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Fixtures — reusable case dicts
# ---------------------------------------------------------------------------

def _make_case(case_id: str, difficulty: str) -> dict:
    return {
        "case_id": case_id,
        "difficulty": difficulty,
        "title": f"Test case {case_id}",
        "topic": "Glaucoma",
        "estimated_minutes": 15,
        "patient": {"name": "Pat", "age": 50, "presenting_complaint": "blurry vision"},
    }


# ---------------------------------------------------------------------------
# Unit tests for _check_case_access
# ---------------------------------------------------------------------------

ALL_CASES = [
    _make_case("beg_1", "beginner"),
    _make_case("beg_2", "beginner"),
    _make_case("beg_3", "beginner"),
    _make_case("int_1", "intermediate"),
    _make_case("int_2", "intermediate"),
    _make_case("int_3", "intermediate"),
    _make_case("adv_1", "advanced"),
]


def _patch_all_cases(progress: dict):
    from contextlib import ExitStack
    stack = ExitStack()
    stack.enter_context(
        patch("tools.api.server.list_available_cases",
              return_value=[c["case_id"] for c in ALL_CASES])
    )
    stack.enter_context(
        patch("tools.api.server.load_case",
              side_effect=lambda cid: next(c for c in ALL_CASES if c["case_id"] == cid))
    )
    stack.enter_context(
        patch("tools.api.server.get_case_progress", return_value=progress)
    )
    stack.enter_context(patch.dict("tools.api.server._case_cache", {}, clear=True))
    return stack


def test_beginner_always_allowed():
    """Beginner case is always allowed regardless of progress."""
    case = _make_case("beg_1", "beginner")
    with _patch_all_cases({}):
        _check_case_access("stu_test", case)  # must not raise


def test_intermediate_blocked_zero_beginner_passes():
    """Intermediate case is blocked when student has 0 beginner passes."""
    case = _make_case("int_1", "intermediate")
    with _patch_all_cases({}):
        with pytest.raises(HTTPException) as exc_info:
            _check_case_access("stu_test", case)
    assert exc_info.value.status_code == 403
    assert "beginner" in exc_info.value.detail.lower()


def test_intermediate_blocked_one_beginner_pass():
    """Intermediate case is blocked when student has only 1 beginner pass."""
    case = _make_case("int_1", "intermediate")
    progress = {"beg_1": {"total_score": 30, "passed": True}}
    with _patch_all_cases(progress):
        with pytest.raises(HTTPException) as exc_info:
            _check_case_access("stu_test", case)
    assert exc_info.value.status_code == 403


def test_intermediate_allowed_two_beginner_passes():
    """Intermediate case is allowed when student has 2 beginner passes."""
    case = _make_case("int_1", "intermediate")
    progress = {
        "beg_1": {"total_score": 30, "passed": True},
        "beg_2": {"total_score": 28, "passed": True},
    }
    with _patch_all_cases(progress):
        _check_case_access("stu_test", case)  # must not raise


def test_advanced_blocked_zero_intermediate_passes():
    """Advanced case is blocked when student has 0 intermediate passes."""
    case = _make_case("adv_1", "advanced")
    progress = {
        "beg_1": {"total_score": 30, "passed": True},
        "beg_2": {"total_score": 28, "passed": True},
    }
    with _patch_all_cases(progress):
        with pytest.raises(HTTPException) as exc_info:
            _check_case_access("stu_test", case)
    assert exc_info.value.status_code == 403
    assert "intermediate" in exc_info.value.detail.lower()


def test_advanced_blocked_one_intermediate_pass():
    """Advanced case is blocked when student has only 1 intermediate pass."""
    case = _make_case("adv_1", "advanced")
    progress = {
        "beg_1": {"total_score": 30, "passed": True},
        "beg_2": {"total_score": 28, "passed": True},
        "int_1": {"total_score": 35, "passed": True},
    }
    with _patch_all_cases(progress):
        with pytest.raises(HTTPException) as exc_info:
            _check_case_access("stu_test", case)
    assert exc_info.value.status_code == 403


def test_advanced_allowed_two_intermediate_passes():
    """Advanced case is allowed when student has 2 intermediate passes."""
    case = _make_case("adv_1", "advanced")
    progress = {
        "beg_1": {"total_score": 30, "passed": True},
        "beg_2": {"total_score": 28, "passed": True},
        "int_1": {"total_score": 35, "passed": True},
        "int_2": {"total_score": 32, "passed": True},
    }
    with _patch_all_cases(progress):
        _check_case_access("stu_test", case)  # must not raise


def test_unknown_difficulty_allowed():
    """Unknown difficulty is treated as beginner (allowed)."""
    case = _make_case("mystery_1", "expert")
    with _patch_all_cases({}):
        _check_case_access("stu_test", case)  # must not raise


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------

def _locked_advanced_case() -> dict:
    return _make_case("adv_locked", "advanced")


def test_submit_locked_case_returns_403():
    """POST /api/cases/{case_id}/submit returns 403 when case is locked."""
    case = _locked_advanced_case()
    with patch.dict("tools.api.server._case_cache", {"adv_locked": case}, clear=False), \
         patch("tools.api.server.list_available_cases", return_value=["adv_locked"]), \
         patch("tools.api.server.load_case", return_value=case), \
         patch("tools.api.server.get_case_progress", return_value={}):

        r = client.post(
            "/api/cases/adv_locked/submit",
            json={
                "student_id": "stu_test",
                "messages": [],
                "diagnosis": "Glaucoma",
                "management_plan": "Timolol drops",
                "performed_steps": [],
            },
            headers=_auth_headers("stu_test"),
        )

    assert r.status_code == 403
    assert "intermediate" in r.json()["detail"].lower()


def test_chat_locked_case_returns_403():
    """POST /api/cases/{case_id}/chat returns 403 when case is locked."""
    case = _locked_advanced_case()
    with patch.dict("tools.api.server._case_cache", {"adv_locked": case}, clear=False), \
         patch("tools.api.server.list_available_cases", return_value=["adv_locked"]), \
         patch("tools.api.server.load_case", return_value=case), \
         patch("tools.api.server.get_case_progress", return_value={}):

        r = client.post(
            "/api/cases/adv_locked/chat",
            json={
                "student_id": "stu_test",
                "messages": [{"role": "user", "content": "Hello"}],
            },
            headers=_auth_headers("stu_test"),
        )

    assert r.status_code == 403
    assert "intermediate" in r.json()["detail"].lower()
```

- [ ] **Step 3: Run the tests and confirm they all fail**

```
python -m pytest tests/cases/test_case_access.py -v
```

Expected: all 10 fail with `ImportError: cannot import name '_check_case_access' from 'tools.api.server'`.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/cases/__init__.py tests/cases/test_case_access.py
git commit -m "test: add failing tests for case difficulty lock enforcement"
```

---

## Task 2: Implement `_check_case_access` and wire into endpoints

**Files:**
- Modify: `tools/api/server.py`

- [ ] **Step 1: Add `_check_case_access` after the `get_cases` function**

In `tools/api/server.py`, find the line `return CasesResponse(cases=cases)` that ends the `get_cases` function (around line 815). Insert the following function immediately after that line, before the next route decorator:

```python
def _check_case_access(student_id: str, case: dict) -> None:
    """Raise HTTP 403 if the student has not unlocked this case's difficulty tier.

    Rules:
    - beginner      → always accessible
    - intermediate  → requires ≥ 2 passing beginner cases
    - advanced      → requires ≥ 2 passing intermediate cases
    - unknown tier  → treated as beginner (allowed)
    """
    difficulty = case.get("difficulty", "beginner")
    if difficulty == "beginner":
        return
    if difficulty not in ("intermediate", "advanced"):
        return

    prerequisite = "beginner" if difficulty == "intermediate" else "intermediate"

    try:
        progress = get_case_progress(student_id)
    except Exception:
        progress = {}

    passing = 0
    for cid in list_available_cases():
        c = _case_cache.get(cid)
        if c is None:
            try:
                c = load_case(cid)
                _case_cache[c["case_id"]] = c
            except Exception:
                continue
        if c.get("difficulty") == prerequisite:
            if progress.get(c["case_id"], {}).get("passed"):
                passing += 1

    if passing < 2:
        tier_label = "beginner" if difficulty == "intermediate" else "intermediate"
        raise HTTPException(
            status_code=403,
            detail=f"Complete at least 2 {tier_label} cases before accessing {difficulty} cases.",
        )
```

- [ ] **Step 2: Wire into `case_chat`**

In the `case_chat` function, find the line:
```python
    patient_prompt = PATIENT_SYSTEM.format(case_json=json.dumps(case, indent=2))
```

Insert immediately before it:
```python
    _check_case_access(current_user["sub"], case)
```

- [ ] **Step 3: Wire into `case_submit`**

In the `case_submit` function, find the line:
```python
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
```

Insert immediately before it:
```python
    _check_case_access(student_id, case)
```

- [ ] **Step 4: Run the new tests**

```
python -m pytest tests/cases/test_case_access.py -v
```

Expected: 10 passed. If any fail, fix them before continuing.

- [ ] **Step 5: Commit**

```bash
git add tools/api/server.py
git commit -m "feat: enforce case difficulty locks server-side in case_chat and case_submit"
```

---

## Task 3: Verify full test suite and final commit

- [ ] **Step 1: Run the complete test suite**

```
python -m pytest --tb=short -q
```

Expected: all tests pass (previous 59 + 10 new = 69 total). If any pre-existing test fails, recheck that Tasks 2 edits added lines rather than replacing them.

- [ ] **Step 2: Commit if clean**

```bash
git commit --allow-empty -m "chore: verify full suite passes after case difficulty lock enforcement"
```

(Use `--allow-empty` only if there are no staged changes — this is a verification-only task.)
