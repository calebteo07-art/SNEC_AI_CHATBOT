# RICOE v2 · Foundation 2 (part 2 of 3) — Selena sprite compositor + Bitmoji-style onboarding (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans or subagent-driven-development. **Frontend-harness verification runs INLINE** (subagents hang on the long build — see the RICOE v2 memory gotcha). This plan is **scaffold-first (RICOE D11): NO paid Nano-Banana generation happens here** — everything renders from free, clearly-marked placeholder sprites. The real 3D generation is a separate, deferred, go-ahead-gated plan (part 3).

**Goal:** Make a saved `avatar_config` visibly become a customizable, on-brand Selena. Ship (1) a canonical axis mirror + parity guard, (2) a `<Selena>` **layered-sprite compositor** that renders any config from a sprite **manifest**, (3) a **free placeholder sprite library** so the whole thing works keyless, and (4) a **Bitmoji-inspired, gamified, one-category-per-page** onboarding + edit flow wired to `GET`/`PUT /api/avatar`.

**Locked context (do not relitigate — RICOE decisions):**
- **D9 — Selena *is* Iris**: the one-eyed soft-3D homepage mascot (`frontend/public/brand/iris.png`, `GreetingHero.tsx` `.hm-iris`). One big customizable iris, no hair, tiny arms, floor shadow. Every custom Selena is an Iris variant.
- **D10 — render = curated 3D sprite library composited at runtime** (revises the old "flat vector"). Free/instant/deterministic for students; the 3D look comes from pre-generated sprites, NOT per-user live AI raster.
- **D11 — scaffold-first**: placeholders now; paid generation only on the user's explicit go-ahead.
- **Onboarding ref = Bitmoji builder** (user's image — inspiration, DO NOT COPY): big live preview on top, one category per page, scrollable option grid + colour-swatch column, category nav, Save; gamified (surprise-me, unlockables). Unconventional options are intentional fun (galaxy iris, star eyes, star/freckle blush, horns/crown/flame toppers, heart glasses, cape, galaxy/confetti bg).

**Backend already shipped (`ca22daf`):** `tools/avatar/parts.py` — `AVATAR_AXES` (11 axes: bodyColor, irisColor, eyeShape, lashes, mouth, blush, glasses, topper, accessory, outfit, background), `DEFAULT_AVATAR`, `CONFIG_VERSION=2`, `validate_config`. `GET /api/avatar` → `{config, axes}`; `PUT /api/avatar` validates + persists. Migration `006_avatar.sql` (`avatar_config` JSONB) **still pending Supabase apply** for PUT to persist in prod.

**Tech stack:** Next.js 16 (App Router, `output: standalone`), React 19, Tailwind 4, TanStack Query, CSS-only motion (`motion.css` + `Reveal`/`RouteReveal`; MotionProvider is NOT mounted — no GSAP). Frontend tests = Node harnesses in `frontend/tests/`. Python side stays pytest.

**Series note:** Plan 2b of the RICOE v2 series (spec §4 F2, §5.1). Part 1 (backend) shipped; **part 3 = the deferred paid Nano-Banana generation tool**.

---

## Run notes (read before starting)

- **Single source of truth = the Python `AVATAR_AXES`.** The frontend must never hand-maintain a second copy. Task 1 generates a TS mirror from it and a test fails if they drift.
- **Placeholder sprites are FREE and obviously fake** (flat shape + the id text). They exist so the compositor, onboarding, and tests all work with zero spend. Do NOT hand-draw 200 polished parts here and do NOT call any image API.
- **Frontend verify runs inline**: `cd frontend && npm run typecheck && npm run build`, plus any Node harness. If a dev server on :3000 is orphaned, kill it (PowerShell `Get-NetTCPConnection -LocalPort 3000`) — never judge harness pass/fail by a piped exit code.
- **Do not push red.** Backend gate `python -m pytest -q`; frontend gate `npm run typecheck && npm run build`. Auto-commit + push to `main` per repo policy; commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File structure

- **Create** `tools/avatar/export_axes.py` — emits the TS mirror from `AVATAR_AXES`. Single responsibility: serialize the registry.
- **Create** `frontend/src/aurora/avatar/axes.generated.ts` — generated mirror (`AVATAR_AXES`, `DEFAULT_AVATAR`, `CONFIG_VERSION`). Do not edit by hand.
- **Create** `tests/avatar/test_axes_parity.py` — fails if the generated TS is stale vs the Python registry.
- **Create** `frontend/src/aurora/avatar/manifest.ts` — sprite manifest: per axis id → `{src, z, anchor}` (+ a `layerOrder`). Single responsibility: describe how sprites stack.
- **Create** `frontend/src/aurora/avatar/Selena.tsx` — the `<Selena config size />` compositor. Single responsibility: stack sprite layers for a config.
- **Create** `tools/avatar/make_placeholders.py` — writes free placeholder sprites for every id into `frontend/public/brand/selena/…`. Clearly marked placeholders.
- **Create** `frontend/src/aurora/avatar/manifest.test.mjs` — parity: every axis id has a manifest entry and a resolvable sprite.
- **Create** `frontend/src/aurora/screens/SelenaStudio.tsx` (+ CSS) — the onboarding/edit wizard.
- **Modify** the home/greeting + a leaderboard entry point to launch/edit Selena and render `<Selena>` for the saved config.

---

### Task 1: Canonical axis mirror + parity guard

- [ ] Write `tools/avatar/export_axes.py`: imports `AVATAR_AXES, DEFAULT_AVATAR, CONFIG_VERSION` from `tools.avatar.parts` and renders a deterministic TS module (stable key order, `as const`). A `--check` flag compares against the on-disk file and exits non-zero if different.
- [ ] Generate `frontend/src/aurora/avatar/axes.generated.ts`.
- [ ] Write `tests/avatar/test_axes_parity.py`: runs the exporter in `--check` mode (or compares the rendered string to the file) and asserts they match — this is the drift guard.
- [ ] Verify: `python -m pytest tests/avatar/test_axes_parity.py -q` green; `cd frontend && npm run typecheck`.
- [ ] Commit.

### Task 2: Sprite manifest + `<Selena>` compositor + placeholders

- [ ] Write `tools/avatar/make_placeholders.py`: for every axis id, emit a small labeled placeholder sprite (SVG or PNG) under `frontend/public/brand/selena/<axis>/<id>.<ext>`, plus a base body/eye placeholder. Deterministic, free, no network. Each sprite is visibly a placeholder (id text + flat colour).
- [ ] Write `frontend/src/aurora/avatar/manifest.ts`: `layerOrder = [background, body, blush, eyeWhite, iris, lashes, mouth, glasses, outfit, accessory, topper]` (draw order), and for each axis id a `{ src, z, anchor }`. Colour axes (bodyColor/irisColor/blush) may tint a shared shape rather than needing a unique file — encode that in the manifest (`tint` entries) so the placeholder set stays small.
- [ ] Write `frontend/src/aurora/avatar/Selena.tsx`: `function Selena({ config, size })` stacks the resolved layers (absolutely-positioned `<img>`/inline-SVG in a sized square), skipping `none`/missing layers gracefully. Pure/presentational; no data fetching.
- [ ] Write `frontend/src/aurora/avatar/manifest.test.mjs`: assert every id in `axes.generated.ts` resolves to a manifest entry and the referenced sprite file exists (or is a declared tint). This is the D10 parity test.
- [ ] Verify inline: `node frontend/src/aurora/avatar/manifest.test.mjs`; `cd frontend && npm run typecheck && npm run build`.
- [ ] Commit.

### Task 3: Bitmoji-style onboarding + edit flow

- [ ] Write `frontend/src/aurora/screens/SelenaStudio.tsx`: big live `<Selena>` preview pinned on top; below it ONE category per page (tabs/steps for body → eye → expression → topper → outfit → background …); a scrollable option grid + a colour-swatch column for colour axes; prev/next category nav; "Surprise me" (randomize) and Save. Gamified touches: progress dots, a celebratory reveal on Save (CSS-only motion), "new looks unlock as you level" copy where honest. First-run mode ("Create your Selena") vs edit mode.
- [ ] Data: on open, `GET /api/avatar` for `{config, axes}`; Save → `PUT /api/avatar`; optimistic local state; on success invalidate any cached avatar query. If avatar data enters a persisted TanStack query, bump `PERSIST_SCHEMA_VERSION` in `queryClient.ts` (see the persist-cache-buster memory).
- [ ] Entry points: launch from the home greeting (replace/augment the static `iris.png` with the student's `<Selena>`) and an edit affordance from home/leaderboard.
- [ ] Explain-to-users: a one-line helper on the first screen ("Selena is your study buddy — make her yours").
- [ ] Verify inline: `cd frontend && npm run typecheck && npm run build`; drive the flow (Node harness or manual) to confirm select → preview updates → Save round-trips against a mocked API.
- [ ] Commit.

### Task 4: Wire the saved Selena across surfaces (light)

- [ ] Render `<Selena>` (saved config) in the home greeting; keep `iris.png` as the fallback when a student has no config yet (the default config already renders as Iris, so this is mostly swapping the `<img>` for `<Selena config=default>`).
- [ ] Confirm graceful behavior pre-migration (GET returns default → renders default Iris everywhere; no errors).
- [ ] Verify + commit.

---

## Deferred to part 3 (DO NOT do here — needs explicit go-ahead, paid)

`tools/avatar/generate_sprites.py` — batch-generate the real 3D sprite library via Nano Banana / Gemini image, replacing placeholders id-by-id. Requirements to design there: **Iris resemblance** baked into every prompt; **consistent camera/framing/lighting/anchor + transparent background** so independently-generated parts composite cleanly (the hard part of D10); batched with a cost estimate; medically/brand-accurate where relevant; verify a small batch before spending on the full set. Ships only on the user's explicit greenlight (D11).

## Self-review

- **Scaffold-first honored:** Tasks 1–4 are entirely free (no image API); placeholders make the compositor + onboarding demonstrably work; paid generation is quarantined to the deferred part 3.
- **Single source of truth:** the Python `AVATAR_AXES` stays canonical; the TS mirror is generated and drift-guarded (Task 1), and the manifest is parity-tested against it (Task 2) — the D10 "manifest mirrors the ids" requirement.
- **Prod-safe:** GET degrades to the default (which renders as Iris) so shipping before migration 006 is applied breaks nothing. Frontend verification is inline (subagent-hang gotcha respected).
- **Open coordination:** migration `006_avatar.sql` still needs its out-of-band Supabase apply (`/db-migrate`) before PUT persists in prod.
