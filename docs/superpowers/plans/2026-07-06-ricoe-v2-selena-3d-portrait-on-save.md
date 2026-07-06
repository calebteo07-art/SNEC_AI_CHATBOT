# RICOE v2 · Foundation 2 · part 3 — Selena 3D portrait, generated per-config & cached (Implementation Plan)

> **Decided 2026-07-06 (user):** productize real 3D Selena as **per-config generate-on-save, cached**.
> The instant SVG `<Selena>` stays as the free live-edit preview; on Save, the student's config becomes a
> real 3D Iris PNG (Nano Banana `gemini-3.1-flash-image`, anchored to `iris.png`), cached and reused.

**Pilot proof (commit `1d1dc13`):** `tools/avatar/generate_sprites.py` — resemblance ✅, transparent alpha ✅,
full-config-in-one-shot ✅. Model bakes FULL looks (not composable parts), so we generate one image per
distinct look, not 90 parts.

## Architecture (prod-safe on the single free web worker)

- **Transparent character, CSS backdrop.** The portrait PNG is the transparent Iris; the `background` axis
  is rendered as a CSS backdrop behind it. So `background` is EXCLUDED from the character prompt AND the
  cache hash → two looks differing only in backdrop share one PNG (fewer generations = less spend).
- **Deterministic core.** `config → prompt` and `config → hash` are pure functions (single source: the
  parts registry). Same look ⇒ same hash ⇒ same cached image.
- **Cache table `avatar_images(config_hash pk, image_url, status, updated_at)`** (migration 007). status ∈
  `pending|ready|failed`.
- **No event-loop blocking, no Celery dependency.** Generation (~15–30s) runs via FastAPI `BackgroundTasks`
  → `asyncio.to_thread` (threadpool; event loop stays free). Celery isn't deployed on the free tier, so we
  don't depend on it. Rate-limited + cache-gated so it fires only on a genuinely new look.
- **Storage.** Upload `<hash>.png` to a public Supabase bucket `selena-avatars` (reuse the `upload_kb_image`
  pattern). `image_url` = its public URL.
- **Frontend swap.** Studio/home render the SVG immediately; when `portrait_status=ready`, swap to the PNG.
  On Save: PUT config → POST /api/avatar/portrait (enqueue) → poll GET /api/avatar until ready.

## Tasks

### Task 1 — pure deterministic core (FREE, no infra) ← START HERE
- `tools/avatar/portrait.py`: `PORTRAIT_AXES` (all axes minus `background`), `config_hash(config)->str`
  (sha256[:16] over normalized portrait axes; order- & extra-key-invariant), `config_to_prompt(config)->str`
  (Iris STYLE contract + per-axis phrasing; skips `none`; excludes `background`).
- `tests/avatar/test_portrait.py`: hash determinism/stability/independence from `background` & key order;
  changes when a character axis changes; prompt always carries the one-eyed/transparent contract; prompt
  reflects set options and omits `none`.
- Verify `python -m pytest tests/avatar/test_portrait.py -q`. Commit.

### Task 2 — generate + store (paid path, reuses pilot generator)
- `tools/avatar/portrait.py`: `render_portrait(config)->bytes` (flash-image via generate_sprites' client),
  `store_portrait(hash, bytes)->url` (Supabase `selena-avatars` bucket). Add `upload_avatar` to
  `supabase_client.py`. Keep MOCK/keyless safe (no live call in tests).
- Migration `007_avatar_images.sql` (cache table) — apply via `/db-migrate`.

### Task 3 — endpoints (non-blocking)
- `POST /api/avatar/portrait` (JWT, rate-limited): hash the student's SAVED config; ready→return url;
  pending(recent)→return pending; else mark pending + `BackgroundTasks`→`to_thread` generate→store→mark
  ready (mark failed on error). `GET /api/avatar` also returns `{portrait_url, portrait_status}`.
- Tests: cache hit returns url without generating; miss enqueues once; identity from JWT.

### Task 4 — frontend swap + backdrop
- `useAvatar` exposes portrait; Studio Save triggers POST + polls; `<Selena>`-hero and home greeting show
  the PNG when ready (transparent) over the `background` axis as a CSS backdrop; SVG is the fallback.
- Harness: extend the studio check — Save → portrait pending→ready swap (mock the endpoints).

## Guards
- **Never fire live gen in tests** (MOCK/keyless). Paid gen only on the real save path, cache-gated.
- **Cost:** one flash-image (~1–2¢) per distinct character look, then free forever (cache). Backdrop-only
  changes are free. Rate-limit the POST.
- Do not push red; auto-commit per task.
