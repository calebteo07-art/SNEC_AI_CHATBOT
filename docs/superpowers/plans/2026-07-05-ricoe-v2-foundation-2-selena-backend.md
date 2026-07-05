# RICOE v2 · Foundation 2 (part 1 of 3) — Selena engine backend (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This is a pure-backend, pytest-tested plan — ideal for subagent execution** (unlike the frontend harness, `pytest` runs fast and clean).

**Goal:** Stand up the server side of the per-student Selena avatar system — a server-authoritative parts registry with fail-closed validation, a JSONB persistence column, and `GET`/`PUT /api/avatar` — so a student's avatar config can be saved and loaded, identity always from the JWT.

**Architecture:** The avatar is a layered-vector character composed from a small saved config (`{version, skinTone, hairStyle, hairColor, eyeColor, eyeShape, brows, mouth, blush, glasses, accessory, outfit, background}`). `tools/avatar/parts.py` is the single source of truth for valid option ids; the frontend `<Selena>` renderer (plan 3) mirrors these ids for the SVG art. Config persists in a new `student_profiles.avatar_config` JSONB column. Validation fails closed (unknown id → 422) so a tampered body can't inject arbitrary values. Uniforms are excluded (RICOE D5/D8) — wardrobe is casual.

**Tech Stack:** FastAPI + Pydantic, Supabase (async client via `tools/profile/*` + `tools/shared/db.py`), pytest with `MOCK_MODE` (auto-on when `GEMINI_API_KEY` unset — no key/network needed).

**Series note:** Plan 2 of the RICOE v2 series (spec: [`../specs/2026-07-05-ricoe-v2-design.md`](../specs/2026-07-05-ricoe-v2-design.md) §4 F2, §5.1). This is **part 1 of 3** of Foundation 2: (1) backend [this plan] → (2) the `<Selena>` renderer + parts art → (3) onboarding + edit flow.

---

## Run notes (read before starting)

- **Mirror CI:** `python -m pytest -q` (Python 3.12). Tests need no key/network — `MOCK_MODE` auto-enables.
- Work directly on `main` (repo standing policy); commit per task; every commit ends with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Run `pytest`/`git` through the **Bash tool** (POSIX). If `git push` is rejected: `git pull --rebase && git push`.
- **Out-of-band step (do NOT skip):** Task 3 adds migration `006_avatar.sql`. The `avatar_config` column must be created in Supabase before `PUT /api/avatar` works in prod. The code degrades gracefully (GET returns the default look when the column/value is absent) so shipping the code first does not break boot — but coordinate applying the migration via the `/db-migrate` skill (this is the CLAUDE.md "new required migration" exception; say so when shipping).
- **Migration linter rule (already known):** never emit `ADD CONSTRAINT IF NOT EXISTS` / `CREATE POLICY IF NOT EXISTS`. `ADD COLUMN IF NOT EXISTS` is valid Postgres and is what this migration uses.

## File structure

- **Create** `tools/avatar/__init__.py` — empty package marker.
- **Create** `tools/avatar/parts.py` — parts registry (`AVATAR_AXES`, `DEFAULT_AVATAR`, `CONFIG_VERSION`) + `validate_config()` + `InvalidAvatarConfig`. Single responsibility: define valid avatar options and validate a config. Pure, no I/O.
- **Create** `tools/api/routers/avatar.py` — `GET`/`PUT /api/avatar`. Single responsibility: HTTP surface; delegates validation to `parts.py` and persistence to `tools/profile/*`.
- **Modify** `tools/api/server.py` — register the new router (near the other `include_router` calls, lines 152–159).
- **Create** `tools/db/migrations/006_avatar.sql` — the JSONB column.
- **Create** `tests/api/test_avatar_endpoints.py` — validator unit tests + endpoint tests.

---

### Task 1: Parts registry + config validation (pure, TDD)

**Files:**
- Create: `tools/avatar/__init__.py`
- Create: `tools/avatar/parts.py`
- Test: `tests/api/test_avatar_endpoints.py` (validator tests only in this task)

- [ ] **Step 1: Write the failing validator tests**

Create `tests/api/test_avatar_endpoints.py`:

```python
"""Tests for the Selena avatar registry, validation, and endpoints."""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token
from tools.avatar.parts import (
    DEFAULT_AVATAR, AVATAR_AXES, CONFIG_VERSION, validate_config, InvalidAvatarConfig,
)

client = TestClient(app)


def _student_cookies(sub: str = "user_001") -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


# ── pure validator ──────────────────────────────────────────────────────────

def test_default_config_is_valid_and_stable():
    assert validate_config(DEFAULT_AVATAR) == DEFAULT_AVATAR

def test_every_default_value_is_a_listed_option():
    for axis, options in AVATAR_AXES.items():
        assert DEFAULT_AVATAR[axis] in options, f"default {axis} not in options"

def test_validate_fills_missing_axes_from_default():
    clean = validate_config({"skinTone": "deep"})
    assert clean["skinTone"] == "deep"
    assert clean["hairStyle"] == DEFAULT_AVATAR["hairStyle"]
    assert clean["version"] == CONFIG_VERSION

def test_validate_rejects_unknown_option():
    with pytest.raises(InvalidAvatarConfig):
        validate_config({"skinTone": "neon"})

def test_validate_ignores_unknown_axis():
    clean = validate_config({"bogusAxis": "x"})
    assert "bogusAxis" not in clean

def test_validate_handles_none():
    assert validate_config(None) == DEFAULT_AVATAR
```

- [ ] **Step 2: Run the validator tests to verify they fail**

Run: `python -m pytest tests/api/test_avatar_endpoints.py -q`
Expected: collection/import error — `ModuleNotFoundError: No module named 'tools.avatar'`.

- [ ] **Step 3: Create the registry**

Create `tools/avatar/__init__.py` (empty file).

Create `tools/avatar/parts.py`:

```python
"""Selena avatar — server-authoritative parts registry + config validation.

The avatar is a layered-vector character composed from a small saved config.
This module is the SINGLE SOURCE OF TRUTH for which option ids are valid; the
frontend <Selena> renderer mirrors these ids for the actual SVG art (kept in
sync by a parity test in the renderer plan). Validation fails closed: any id not
listed here is rejected, so a tampered request body cannot inject arbitrary
values. Uniforms are intentionally excluded (RICOE D5/D8) — wardrobe is casual.
"""
from __future__ import annotations

CONFIG_VERSION = 1

# axis -> ordered list of valid option ids (order = display order in the builder)
AVATAR_AXES: dict[str, list[str]] = {
    "skinTone":   ["porcelain", "light", "warm", "tan", "brown", "deep", "rich", "ebony"],
    "hairStyle":  ["bob", "long", "ponytail", "bun", "short", "wavy", "curly", "braids", "pixie", "afro", "hijab", "buzz"],
    "hairColor":  ["black", "darkBrown", "brown", "chestnut", "auburn", "blonde", "platinum", "red", "blue", "pink", "teal", "lilac"],
    "eyeColor":   ["darkBrown", "brown", "hazel", "amber", "green", "blue", "gray", "violet"],
    "eyeShape":   ["round", "almond", "wide", "sleepy", "upturned"],
    "brows":      ["soft", "straight", "arched", "bold"],
    "mouth":      ["smile", "grin", "soft", "open", "smirk"],
    "blush":      ["none", "soft", "rosy"],
    "glasses":    ["none", "round", "square", "catEye", "reading"],
    "accessory":  ["none", "earrings", "hairclip", "headband", "hairflower", "beanie"],
    "outfit":     ["tee", "hoodie", "cardigan", "blouse", "polo", "varsity", "dress", "jacket"],
    "background": ["mist", "blush", "sky", "mint", "lilac", "sun", "graphite", "gemini"],
}

# The default Selena — soft-kawaii, matching the current default mascot's vibe.
DEFAULT_AVATAR: dict[str, object] = {
    "version": CONFIG_VERSION,
    "skinTone": "warm",
    "hairStyle": "bob",
    "hairColor": "brown",
    "eyeColor": "darkBrown",
    "eyeShape": "round",
    "brows": "soft",
    "mouth": "smile",
    "blush": "soft",
    "glasses": "none",
    "accessory": "none",
    "outfit": "tee",
    "background": "lilac",
}


class InvalidAvatarConfig(ValueError):
    """Raised when a submitted avatar config contains an unknown option id."""


def validate_config(cfg: dict | None) -> dict:
    """Return a clean, complete avatar config built ONLY from known option ids.

    - Missing axes are filled from DEFAULT_AVATAR.
    - Unknown axes are ignored.
    - Any provided axis whose value is not a valid option id raises
      InvalidAvatarConfig (fail closed).
    Always stamps the current CONFIG_VERSION.
    """
    cfg = cfg or {}
    clean: dict[str, object] = {"version": CONFIG_VERSION}
    for axis, options in AVATAR_AXES.items():
        value = cfg.get(axis)
        if value is not None:
            if value not in options:
                raise InvalidAvatarConfig(f"{axis}={value!r} is not a valid option")
            clean[axis] = value
        else:
            clean[axis] = DEFAULT_AVATAR[axis]
    return clean
```

- [ ] **Step 4: Run the validator tests to verify they pass**

Run: `python -m pytest tests/api/test_avatar_endpoints.py -q`
Expected: the 6 validator tests PASS (endpoint tests are added in Task 2).

- [ ] **Step 5: Commit**

```bash
git add tools/avatar/__init__.py tools/avatar/parts.py tests/api/test_avatar_endpoints.py
git commit -m "feat(avatar): Selena parts registry + fail-closed config validation (foundation 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `GET`/`PUT /api/avatar` endpoints (TDD, DB mocked)

**Files:**
- Create: `tools/api/routers/avatar.py`
- Modify: `tools/api/server.py` (register router near lines 152–159)
- Test: `tests/api/test_avatar_endpoints.py` (append endpoint tests)

- [ ] **Step 1: Write the failing endpoint tests**

Append to `tests/api/test_avatar_endpoints.py`:

```python

# ── endpoints ───────────────────────────────────────────────────────────────

def test_get_avatar_requires_auth():
    r = client.get("/api/avatar")
    assert r.status_code in (401, 403)

def test_put_avatar_requires_auth():
    r = client.put("/api/avatar", json={"skinTone": "deep"})
    assert r.status_code in (401, 403)

@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_returns_default_when_unset(mock_get):
    mock_get.return_value = {"student_id": "user_001"}  # no avatar_config key
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.status_code == 200
    body = r.json()
    assert body["config"] == DEFAULT_AVATAR
    assert body["axes"] == AVATAR_AXES

@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_returns_saved_config(mock_get):
    saved = dict(DEFAULT_AVATAR, skinTone="ebony", eyeColor="violet")
    mock_get.return_value = {"student_id": "user_001", "avatar_config": saved}
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.json()["config"]["skinTone"] == "ebony"
    assert r.json()["config"]["eyeColor"] == "violet"

@patch("tools.api.routers.avatar.get_profile", new_callable=AsyncMock)
def test_get_avatar_falls_back_to_default_on_corrupt_saved(mock_get):
    mock_get.return_value = {"avatar_config": {"skinTone": "neon"}}  # invalid stored value
    r = client.get("/api/avatar", cookies=_student_cookies())
    assert r.status_code == 200
    assert r.json()["config"] == DEFAULT_AVATAR

@patch("tools.api.routers.avatar.update_profile", new_callable=AsyncMock)
def test_put_avatar_persists_valid_config(mock_update):
    payload = {"skinTone": "deep", "hairStyle": "afro", "eyeColor": "green"}
    r = client.put("/api/avatar", json=payload, cookies=_student_cookies("user_042"))
    assert r.status_code == 200
    clean = r.json()["config"]
    assert clean["skinTone"] == "deep" and clean["eyeColor"] == "green"
    mock_update.assert_awaited_once()
    args, kwargs = mock_update.call_args
    assert args[0] == "user_042"                       # identity from JWT sub, not body
    assert kwargs["avatar_config"]["hairStyle"] == "afro"

@patch("tools.api.routers.avatar.update_profile", new_callable=AsyncMock)
def test_put_avatar_rejects_unknown_option(mock_update):
    r = client.put("/api/avatar", json={"skinTone": "neon"}, cookies=_student_cookies())
    assert r.status_code == 422
    mock_update.assert_not_awaited()
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest tests/api/test_avatar_endpoints.py -q`
Expected: the new endpoint tests FAIL — `/api/avatar` returns 404 (router not registered), so auth/200/422 assertions fail.

- [ ] **Step 3: Create the router**

Create `tools/api/routers/avatar.py`:

```python
"""Selena avatar endpoints — per-student customization (RICOE v2 Foundation 2).

Identity always comes from the JWT (current_user["sub"]), never the body. The
config is validated against the server-authoritative parts registry (fail closed)
before it is persisted to student_profiles.avatar_config (JSONB).
"""
from fastapi import APIRouter, Depends, HTTPException, Request

from tools.api.shared import limiter
from tools.avatar.parts import AVATAR_AXES, DEFAULT_AVATAR, validate_config, InvalidAvatarConfig
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.shared.jwt_utils import get_current_user, CurrentUser

router = APIRouter()


@router.get("/api/avatar")
async def get_avatar(current_user: CurrentUser = Depends(get_current_user)):
    """Return the student's saved Selena config (or the default) + the parts catalog."""
    student_id = current_user["sub"]
    profile = await get_profile(student_id) or {}
    stored = profile.get("avatar_config")
    try:
        config = validate_config(stored) if stored else dict(DEFAULT_AVATAR)
    except InvalidAvatarConfig:
        config = dict(DEFAULT_AVATAR)  # never 500 a read on a stale/corrupt value
    return {"config": config, "axes": AVATAR_AXES}


@router.put("/api/avatar")
@limiter.limit("30/minute")
async def put_avatar(
    request: Request,
    body: dict,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Validate + persist the student's Selena config. Identity from the JWT."""
    student_id = current_user["sub"]
    try:
        clean = validate_config(body)
    except InvalidAvatarConfig as e:
        raise HTTPException(status_code=422, detail=str(e))
    await update_profile(student_id, avatar_config=clean)
    return {"config": clean}
```

- [ ] **Step 4: Register the router**

In `tools/api/server.py`, next to the existing `include_router` calls (after `app.include_router(student_router)`), add both an import and a registration.

Add the import alongside the other router imports (match the file's existing import style for routers), then add:

```python
app.include_router(avatar_router)
```

The import line to add (place it with the other `from tools.api.routers... import ... as ..._router` imports):

```python
from tools.api.routers.avatar import router as avatar_router
```

- [ ] **Step 5: Run all avatar tests to verify they pass**

Run: `python -m pytest tests/api/test_avatar_endpoints.py -q`
Expected: all validator + endpoint tests PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/api/routers/avatar.py tools/api/server.py tests/api/test_avatar_endpoints.py
git commit -m "feat(avatar): GET/PUT /api/avatar with JWT identity + fail-closed validation (foundation 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Persistence migration + full gate + ship

**Files:**
- Create: `tools/db/migrations/006_avatar.sql`

- [ ] **Step 1: Create the migration**

Create `tools/db/migrations/006_avatar.sql`:

```sql
-- Migration 006: per-student Selena avatar config (RICOE v2 Foundation 2)
--
-- Stores each student's layered-vector avatar as a small JSON config. The app
-- degrades gracefully until this is applied: GET /api/avatar returns the default
-- look when the column/value is absent; PUT /api/avatar needs the column.
-- Apply via the /db-migrate skill or the Supabase SQL editor.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS avatar_config JSONB;
```

- [ ] **Step 2: Lint the migration**

Run: `python tools/db/lint_migration.py tools/db/migrations/006_avatar.sql`
Expected: passes (no forbidden `ADD CONSTRAINT IF NOT EXISTS` / `CREATE POLICY IF NOT EXISTS`; `ADD COLUMN IF NOT EXISTS` is allowed).

- [ ] **Step 3: Full backend gate**

Run: `python -m pytest -q`
Expected: all tests green (the existing suite + the new avatar tests). Do not push red.

- [ ] **Step 4: Commit + push (coordinate the migration)**

```bash
git add tools/db/migrations/006_avatar.sql
git commit -m "feat(avatar): migration 006 — avatar_config JSONB on student_profiles (foundation 2)

Needs out-of-band apply in Supabase before PUT /api/avatar works in prod; GET
degrades gracefully to the default look until then.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```
Then flag to the human: **migration 006 must be applied in Supabase** (via `/db-migrate`) before students can save avatars. Until then the API returns the default Selena for everyone (no error).

---

## Self-review

**Spec coverage (spec §5.1 Avatar backend):** ✅ migration adds `avatar_config` JSONB on `student_profiles`; ✅ `GET /api/avatar` (identity from JWT, default when null, returns the parts catalog for the builder); ✅ `PUT /api/avatar` (validates every id against the registry, persists); ✅ invariants — fail closed on invalid ids (422), identity from `current_user["sub"]` not the body, non-blocking async persistence via the existing `tools/profile/*` helpers; ✅ TDD tests: default-when-absent, round-trip, rejects unknown ids, identity-from-JWT. The leaderboard-visibility columns from the spec's combined "006" are **deliberately deferred** to the leaderboard plan's own migration (kept out so this plan ships independently) — note this refinement of spec §5.2's migration naming.

**Placeholder scan:** none — exact files, code, commands, expected output throughout.

**Type/name consistency:** `AVATAR_AXES`, `DEFAULT_AVATAR`, `CONFIG_VERSION`, `validate_config`, `InvalidAvatarConfig` are named identically in `parts.py`, the router, and the tests. The router patches target `tools.api.routers.avatar.get_profile` / `.update_profile` (the names imported into the router module), which is what the endpoint tests `@patch`. `create_access_token(sub, role, student_role)` matches the signature used in `tests/api/test_admin_endpoints.py`.

**Not in this plan (Foundation 2 parts 2 & 3):** the `<Selena>` SVG renderer + the parts art (must mirror `AVATAR_AXES` ids, with a parity test), and the first-run onboarding + edit flow. These are the next two plans.
