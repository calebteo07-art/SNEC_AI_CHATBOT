# Composited Eyecon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-flat-image Eyecon preview with a live client-side composite so every axis (including Body/Eye colour) shows together and recolors live; trim to 7 axes; retire the paid AI-portrait pipeline.

**Architecture:** `<Eyecon>` becomes a layered compositor driven by a pure `eyeconLayers(config)` function: a neutral tintable body base, isolated transparent feature overlays (outfit/eyeShape/accessory/topper) registered to a shared 512² space, and CSS `mix-blend-mode: multiply` tint layers (masked) for Body/Iris colour. The single `<Eyecon>` chokepoint propagates the fix to Studio, home, and leaderboard. Real art is generated later (Phase 2, paid, gated); Phase 1 ships the whole system on clearly-marked keyless placeholders.

**Tech Stack:** React 19 / Next 16 (frontend), FastAPI + Python 3.12 (backend), Node type-stripping harnesses for FE tests, Pillow + Nano-Banana for art tooling.

**Spec:** `docs/superpowers/specs/2026-07-14-composited-eyecon-design.md`

**Asset contract (all phases conform):**
- Base body: `/avatar/base/body.webp` — neutral light-shaded body, transparent outside the silhouette. Its own alpha IS the body-tint mask.
- Feature overlays: `/avatar/overlay/<axis>/<id>.webp` for axes `outfit`, `eyeShape`, `accessory`, `topper` (isolated, transparent, registered). `eyeShape` overlays include a neutral-gray iris.
- Iris mask: `/avatar/overlay/eyeShape/<id>.iris.webp` — alpha of that eye's iris region, for iris tinting.
- `none` options ship no overlay (layer omitted). `eyeShape` has no `none` (the eye is always drawn).

---

## Phase 1 — the system on placeholder art (keyless, ships the UX fix)

### Task 1: Trim the axis registry to 7 axes

**Files:**
- Modify: `tools/avatar/parts.py` (AVATAR_AXES, DEFAULT_AVATAR)
- Regenerate: `frontend/src/aurora/avatar/axes.generated.ts` (via export_axes.py)
- Test: `tests/avatar/test_parts.py` (new) + existing `tests/avatar/test_axes_parity.py`

- [ ] **Step 1: Write the failing test** — `tests/avatar/test_parts.py`

```python
from tools.avatar.parts import AVATAR_AXES, DEFAULT_AVATAR, validate_config

REMOVED = {"blush", "lashes", "mouth", "glasses"}

def test_removed_axes_absent_from_registry():
    for axis in REMOVED:
        assert axis not in AVATAR_AXES
        assert axis not in DEFAULT_AVATAR

def test_seven_axes_remain():
    assert set(AVATAR_AXES) == {
        "bodyColor", "irisColor", "eyeShape", "topper", "accessory", "outfit", "background"
    }

def test_validate_config_drops_removed_axes():
    # A legacy stored config still carrying the removed keys validates and drops them.
    legacy = {"version": 2, "bodyColor": "peach", "irisColor": "blue", "eyeShape": "round",
              "topper": "crown", "accessory": "none", "outfit": "labcoat", "background": "mist",
              "blush": "rose", "lashes": "glam", "mouth": "grin", "glasses": "round"}
    clean = validate_config(legacy)
    assert set(clean) == {"version", "bodyColor", "irisColor", "eyeShape",
                          "topper", "accessory", "outfit", "background"}
    assert clean["topper"] == "crown" and clean["outfit"] == "labcoat"
```

- [ ] **Step 2: Run it, verify it fails**

Run: `python -m pytest tests/avatar/test_parts.py -q`
Expected: FAIL (removed axes still present).

- [ ] **Step 3: Edit `tools/avatar/parts.py`** — delete the `lashes`, `mouth`, `blush`, `glasses` entries from `AVATAR_AXES` (lines 35–42) and the same four keys from `DEFAULT_AVATAR` (lines 66, 68, 69, 71). Leave `validate_config` unchanged (it already drops unknown axes). Update the module docstring's "layered sprite compositor (that approach was deleted in Task 3)" note to reflect that a client compositor is now the render path.

- [ ] **Step 4: Regenerate the TS mirror**

Run: `python tools/avatar/export_axes.py`
Expected: `[WROTE] .../axes.generated.ts`. Confirm the file now lists 7 axes and `DEFAULT_AVATAR` has no blush/lashes/mouth/glasses.

- [ ] **Step 5: Run tests, verify pass**

Run: `python -m pytest tests/avatar/test_parts.py tests/avatar/test_axes_parity.py -q`
Expected: PASS (parity test confirms the TS file matches the registry).

- [ ] **Step 6: Commit**

```bash
git add tools/avatar/parts.py frontend/src/aurora/avatar/axes.generated.ts tests/avatar/test_parts.py
git commit -m "feat(eyecon): trim avatar to 7 axes (drop blush/lashes/mouth/glasses)"
```

### Task 2: Remove blush from the colour manifest

**Files:**
- Modify: `frontend/src/aurora/avatar/manifest.ts` (delete `Blush` type + `BLUSH_COLORS`)

- [ ] **Step 1: Edit `manifest.ts`** — delete the `Blush` type alias (line 10) and the entire `BLUSH_COLORS` block (lines 29–34). Leave `BodyColor`, `IrisColor`, `Background`, `BODY_COLORS`, `IRIS_COLORS`, `BG_COLORS`.

- [ ] **Step 2: Verify no dangling imports**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors ONLY in files that still import `BLUSH_COLORS` (`EyeconStudio.tsx`) — those are fixed in Task 5. If any OTHER file errors, stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/avatar/manifest.ts
git commit -m "feat(eyecon): drop BLUSH_COLORS from the colour manifest"
```

### Task 3: The layer model — `eyeconLayers(config)` (pure, the brain)

**Files:**
- Create: `frontend/src/aurora/avatar/layers.ts`
- Test: `frontend/tests/eyecon_layers.mjs`

- [ ] **Step 1: Write the failing test** — `frontend/tests/eyecon_layers.mjs`

```js
/* Pure unit test for eyeconLayers(). Run:
   node --experimental-strip-types frontend/tests/eyecon_layers.mjs */
import assert from "node:assert";
import { register } from "node:module";
register(
  "data:text/javascript," + encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.(ts|tsx|js|mjs|cjs|json)$/.test(spec)) {
        try { return await next(spec + ".ts", ctx); } catch { return next(spec, ctx); }
      }
      return next(spec, ctx);
    }`),
  import.meta.url,
);
const { eyeconLayers } = await import("../src/aurora/avatar/layers.ts");
const { DEFAULT_AVATAR } = await import("../src/aurora/avatar/axes.generated.ts");
const keys = (ls) => ls.map((l) => l.key);

// 1) default: body base + body tint + eye + iris tint; NO none-able overlays
{
  const ls = eyeconLayers({ ...DEFAULT_AVATAR });
  assert.deepStrictEqual(keys(ls), ["body", "bodyTint", "eye", "irisTint"], "default layer set");
  // z-order strictly ascending
  const zs = ls.map((l) => l.z);
  assert.deepStrictEqual(zs, [...zs].sort((a, b) => a - b), "z ascending");
}
// 2) two feature axes COEXIST (the bug: they used to replace each other)
{
  const ls = eyeconLayers({ ...DEFAULT_AVATAR, topper: "crown", outfit: "labcoat", accessory: "headphones" });
  assert.ok(keys(ls).includes("outfit") && keys(ls).includes("accessory") && keys(ls).includes("topper"),
    "all three features present together");
  const src = (k) => ls.find((l) => l.key === k).src;
  assert.strictEqual(src("outfit"), "/avatar/overlay/outfit/labcoat.webp");
  assert.strictEqual(src("topper"), "/avatar/overlay/topper/crown.webp");
}
// 3) colour axes drive tint layers (the bug: colour didn't reflect)
{
  const ls = eyeconLayers({ ...DEFAULT_AVATAR, bodyColor: "mint", irisColor: "violet" });
  const bt = ls.find((l) => l.key === "bodyTint");
  const it = ls.find((l) => l.key === "irisTint");
  assert.strictEqual(bt.kind, "tint"); assert.strictEqual(bt.color, "#A6E0C6", "mint body hex");
  assert.strictEqual(it.color, "#8A5FC0", "violet iris hex");
  assert.strictEqual(it.maskSrc, "/avatar/overlay/eyeShape/round.iris.webp", "iris mask follows eyeShape");
}
// 4) eyeShape follows the config (iris mask + eye overlay both switch)
{
  const ls = eyeconLayers({ ...DEFAULT_AVATAR, eyeShape: "starry" });
  assert.strictEqual(ls.find((l) => l.key === "eye").src, "/avatar/overlay/eyeShape/starry.webp");
  assert.strictEqual(ls.find((l) => l.key === "irisTint").maskSrc, "/avatar/overlay/eyeShape/starry.iris.webp");
}
// 5) null/undefined config → still a valid default composite (never throws)
assert.deepStrictEqual(keys(eyeconLayers(null)), ["body", "bodyTint", "eye", "irisTint"], "null → default");

console.log("eyecon_layers: all assertions passed");
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --experimental-strip-types frontend/tests/eyecon_layers.mjs`
Expected: FAIL (`Cannot find module .../layers.ts`).

- [ ] **Step 3: Create `frontend/src/aurora/avatar/layers.ts`**

```ts
/* Pure config → ordered render-layer model for <Eyecon>. Back→front: body base,
   body-colour tint (masked to the body silhouette = the base's own alpha), outfit,
   eye (eyeShape overlay w/ neutral iris), iris-colour tint (masked to the eye's iris
   region), accessory, topper. Colour axes are `tint` layers (CSS multiply); the rest
   are isolated transparent overlays registered to a shared 512² space. `none` omits
   its layer; eyeShape is always present. Hook-free + deterministic so it unit-tests
   in raw Node and renders identically on server or client. */
import type { AvatarConfig } from "./axes.generated";
import { DEFAULT_AVATAR } from "./axes.generated";
import { BODY_COLORS, IRIS_COLORS } from "./manifest";

export type EyeconLayer =
  | { kind: "image"; key: string; z: number; src: string }
  | { kind: "tint"; key: string; z: number; color: string; maskSrc: string };

export const BASE_BODY_SRC = "/avatar/base/body.webp";
export const overlaySrc = (axis: string, id: string): string => `/avatar/overlay/${axis}/${id}.webp`;
export const irisMaskSrc = (eyeShape: string): string => `/avatar/overlay/eyeShape/${eyeShape}.iris.webp`;

export function eyeconLayers(config?: Partial<AvatarConfig> | null): EyeconLayer[] {
  const c = { ...DEFAULT_AVATAR, ...(config ?? {}) } as AvatarConfig;
  const layers: EyeconLayer[] = [{ kind: "image", key: "body", z: 10, src: BASE_BODY_SRC }];

  const bodyHex = BODY_COLORS[c.bodyColor as keyof typeof BODY_COLORS];
  if (bodyHex) layers.push({ kind: "tint", key: "bodyTint", z: 11, color: bodyHex, maskSrc: BASE_BODY_SRC });

  if (c.outfit && c.outfit !== "none")
    layers.push({ kind: "image", key: "outfit", z: 20, src: overlaySrc("outfit", c.outfit) });

  layers.push({ kind: "image", key: "eye", z: 30, src: overlaySrc("eyeShape", c.eyeShape) });

  const irisHex = IRIS_COLORS[c.irisColor as keyof typeof IRIS_COLORS];
  if (irisHex) layers.push({ kind: "tint", key: "irisTint", z: 31, color: irisHex, maskSrc: irisMaskSrc(c.eyeShape) });

  if (c.accessory && c.accessory !== "none")
    layers.push({ kind: "image", key: "accessory", z: 40, src: overlaySrc("accessory", c.accessory) });

  if (c.topper && c.topper !== "none")
    layers.push({ kind: "image", key: "topper", z: 50, src: overlaySrc("topper", c.topper) });

  return layers;
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `node --experimental-strip-types frontend/tests/eyecon_layers.mjs`
Expected: `eyecon_layers: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/avatar/layers.ts frontend/tests/eyecon_layers.mjs
git commit -m "feat(eyecon): pure eyeconLayers(config) composite model + tests"
```

### Task 4: `<Eyecon>` compositor rewrite + stacking CSS

**Files:**
- Modify: `frontend/src/aurora/avatar/Eyecon.tsx`
- Create: `frontend/src/aurora/eyecon.css`
- Modify: `frontend/src/styles/index.css` (register the new stylesheet)

- [ ] **Step 1: Rewrite `Eyecon.tsx`** — keep the same props signature (so no call site breaks), swap the single `<img>` for the layer stack. `portraitUrl`, when explicitly passed, still renders as a single image (legacy escape hatch used by the celebrate card).

```tsx
"use client";
/* <Eyecon> — the student's avatar, composited client-side from config. Renders a
   back→front stack of isolated overlays + CSS-multiply colour tints (see layers.ts),
   over the CSS backdrop from the `background` axis. An explicit `portraitUrl` still
   renders as a single image (legacy/escape hatch). Presentational, hook-free, SSR-safe;
   a dead layer src hides itself so a missing asset never shows broken art. */
import type { CSSProperties } from "react";
import type { AvatarConfig } from "./axes.generated";
import { backdropCss } from "./backdrops";
import { eyeconLayers } from "./layers";

const IRIS_SRC = "/brand/iris.png";

export function Eyecon({
  portraitUrl,
  config,
  background,
  size = 240,
  className,
}: {
  portraitUrl?: string | null;
  config?: Partial<AvatarConfig> | null;
  background?: string;
  size?: number;
  className?: string;
}) {
  const bg = background ?? config?.background;
  const frame: CSSProperties = { width: size, height: size, background: backdropCss(bg) };
  const wrap = `eyecon-wrap${className ? " " + className : ""}`;

  if (portraitUrl) {
    return (
      <span role="img" aria-label="Eyecon, your avatar" className={wrap} style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="eyecon-layer" src={portraitUrl} alt="" width={size} height={size}
             onError={(e) => { if (e.currentTarget.src !== location.origin + IRIS_SRC) e.currentTarget.src = IRIS_SRC; }} />
      </span>
    );
  }

  return (
    <span role="img" aria-label="Eyecon, your avatar" className={wrap} style={frame}>
      {eyeconLayers(config).map((l) =>
        l.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={l.key} className="eyecon-layer" src={l.src} alt="" style={{ zIndex: l.z }}
               onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <span key={l.key} className="eyecon-tint" aria-hidden
                style={{ zIndex: l.z, background: l.color,
                         WebkitMaskImage: `url(${l.maskSrc})`, maskImage: `url(${l.maskSrc})` }} />
        ),
      )}
    </span>
  );
}
```

- [ ] **Step 2: Create `frontend/src/aurora/eyecon.css`**

```css
/* <Eyecon> compositor — a fixed-ratio stacking box; every layer fills it and is
   z-ordered by layers.ts. Colour tints multiply through a mask so only their region
   (body silhouette / iris disc) recolours while the base shading shows through. */
.eyecon-wrap { position: relative; display: inline-block; overflow: hidden; line-height: 0; }
.eyecon-layer,
.eyecon-tint { position: absolute; inset: 0; width: 100%; height: 100%; }
.eyecon-layer { object-fit: contain; }
.eyecon-tint {
  mix-blend-mode: multiply;
  pointer-events: none;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-size: contain; mask-size: contain;
}
```

- [ ] **Step 3: Register the stylesheet** — in `frontend/src/styles/index.css`, add after the `brand-mascot.css` import (line 8): `@import "../aurora/eyecon.css";`

- [ ] **Step 4: Neutralise the old single-image `.eyecon-img` rules** — the base `.eyecon-wrap`/`.eyecon-img` rules live in `frontend/src/aurora/aurora.css`. Search there (and in `home.css`, `leaderboard.css`, `studio.css`) for `.eyecon-img` and the inner-ring `.studio-hero > span` box-shadow that assumed a single image. Keep sizing rules; remove/adjust any rule that positioned a lone `.eyecon-img` in a way that conflicts with absolute layers. Do NOT delete `.eyecon-wrap` sizing. (These are visual; verify in Step 6.)

- [ ] **Step 5: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Visual verify** — via the harness (placeholders land in Task 5, so this may show empty layers until then; full visual check happens at the end of Task 5). Commit.

```bash
git add frontend/src/aurora/avatar/Eyecon.tsx frontend/src/aurora/eyecon.css frontend/src/styles/index.css frontend/src/aurora/aurora.css
git commit -m "feat(eyecon): render <Eyecon> as a layered composite with masked colour tints"
```

### Task 5: Placeholder art (keyless) so the composite renders end-to-end

**Files:**
- Create: `tools/avatar/generate_placeholder_layers.py`
- Creates assets under: `frontend/public/avatar/base/`, `frontend/public/avatar/overlay/**`

- [ ] **Step 1: Write `tools/avatar/generate_placeholder_layers.py`** — a keyless Pillow script (no Gemini) that writes clearly-marked placeholders matching the asset contract: a soft neutral rounded `body.webp`; per-`eyeShape` a `<id>.webp` (a simple eye with a gray iris) + `<id>.iris.webp` (a filled disc mask at the iris centre); and for `outfit`/`accessory`/`topper` a translucent labelled shape per non-`none` id at that axis's anchor region. Each placeholder draws its id text so it's obviously not final art. Iterate ids via `tools.avatar.parts.AVATAR_AXES` so it can never drift from the registry. Output 512×512 RGBA WEBP.

Key structure:
```python
from tools.avatar.parts import AVATAR_AXES
OVERLAY_AXES = ["outfit", "eyeShape", "accessory", "topper"]
ANCHOR = {"outfit": (256, 380), "eyeShape": (256, 240), "accessory": (360, 300), "topper": (256, 90)}
# body.webp: centered rounded body; overlay/<axis>/<id>.webp: labelled shape at ANCHOR[axis];
# overlay/eyeShape/<id>.iris.webp: white disc on transparent at the eye centre (the tint mask).
```

- [ ] **Step 2: Generate placeholders**

Run: `python tools/avatar/generate_placeholder_layers.py`
Expected: writes `body.webp`, ~69 overlay webps, 12 eyeShape `.iris.webp` masks.

- [ ] **Step 3: Full visual + behavioural verify** — build and serve via the harness (`bash scripts/start-harness.sh aurora`), open `/studio`, confirm: (a) the hero shows a stacked composite; (b) changing Body colour recolours the body region live; (c) changing Eye colour recolours the iris; (d) picking a topper AND an outfit shows BOTH at once. Screenshot.

- [ ] **Step 4: Commit**

```bash
git add tools/avatar/generate_placeholder_layers.py frontend/public/avatar/base frontend/public/avatar/overlay
git commit -m "feat(eyecon): keyless placeholder layer art (base + overlays + iris masks)"
```

### Task 6: Rewire the Studio hero + steps

**Files:**
- Modify: `frontend/src/aurora/screens/EyeconStudio.tsx`
- Modify: `frontend/src/aurora/studio.css` (remove now-dead hue-only feedback if desired)
- Test: `frontend/tests/eyecon_studio_logic.mjs` (new — the bug regression test)

- [ ] **Step 1: Write the failing regression test** — `frontend/tests/eyecon_studio_logic.mjs`. Import `eyeconLayers` and assert the exact user-reported bug is structurally impossible: every one of the 7 axes changes the layer set/tint, and feature axes coexist. (This is the `/ship-check` invariant test.)

```js
/* Regression for the "not every tab reflects / features conflict" bug.
   node --experimental-strip-types frontend/tests/eyecon_studio_logic.mjs */
import assert from "node:assert";
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if ((spec.startsWith("./")||spec.startsWith("../")) && !/\\.(ts|tsx|js|mjs|cjs|json)$/.test(spec)) {
      try { return await next(spec + ".ts", ctx); } catch { return next(spec, ctx); }
    }
    return next(spec, ctx);
  }`), import.meta.url);
const { eyeconLayers } = await import("../src/aurora/avatar/layers.ts");
const { DEFAULT_AVATAR } = await import("../src/aurora/avatar/axes.generated.ts");

const sig = (cfg) => JSON.stringify(eyeconLayers(cfg));
const base = { ...DEFAULT_AVATAR };

// Each customizable axis must change the composite vs default (colour → tint, feature → overlay).
for (const [axis, val] of [
  ["bodyColor", "mint"], ["irisColor", "violet"], ["eyeShape", "starry"],
  ["outfit", "labcoat"], ["accessory", "headphones"], ["topper", "crown"],
]) {
  assert.notStrictEqual(sig({ ...base, [axis]: val }), sig(base), `${axis} must change the composite`);
}
// Features never replace each other.
const both = eyeconLayers({ ...base, topper: "crown", outfit: "cape" }).map((l) => l.key);
assert.ok(both.includes("topper") && both.includes("outfit"), "topper + outfit coexist");
console.log("eyecon_studio_logic: all assertions passed");
```

- [ ] **Step 2: Run it, verify it passes already** (layers.ts from Task 3 satisfies it) — this test guards against regression in the Studio rewrite. Run: `node --experimental-strip-types frontend/tests/eyecon_studio_logic.mjs` → PASS.

- [ ] **Step 3: Edit `EyeconStudio.tsx`** — concrete removals:
  - Delete the 4 removed steps from `STEPS` (blush/lashes/mouth/glasses entries) → 7 steps remain.
  - Delete `COLOR_MAP.blush` (and the `BLUSH_COLORS` import); `COLOR_MAP` keeps `bodyColor`, `irisColor`.
  - Delete the `TILE_AXES` set and all `heroTile`/`heroPortrait`/`heroFusing`/`lastAxis`/`tileSrc`/`representativeTile` usage.
  - Replace the hero `<Eyecon .../>` props: `<Eyecon config={draft} background={draft.background} size={220} />` (drop `portraitUrl`). Remove the `studio-fusing` element and the `heroAccent` CSS-var block (the body/iris now recolour the hero directly; keep the `studio-hue` dots only if you still want the swatch echo — otherwise remove them and the `.studio-hue*` CSS).
  - Remove `useSelfHealPortrait`, `useRequestPortrait`, `portraitMut`, and the `portraitMut.mutate()` call in `save()`. `save()` keeps `saveMut` + celebrate + welcome redirect.
  - The celebrate card `<Eyecon>`: `<Eyecon config={draft} size={140} />` (drop the portrait prop).

- [ ] **Step 4: Typecheck + build + full FE harness**

Run: `cd frontend && npm run typecheck && npm run build`
Then: `node --experimental-strip-types frontend/tests/eyecon_studio_logic.mjs`
Expected: all PASS.

- [ ] **Step 5: Behavioural verify on the running app** — `/studio`: tap through all 7 tabs; confirm each visibly changes the hero and features stack. Screenshot.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/screens/EyeconStudio.tsx frontend/src/aurora/studio.css frontend/tests/eyecon_studio_logic.mjs
git commit -m "feat(eyecon): Studio hero composites live from config; drop portrait+tile logic"
```

### Task 7: Retire the AI-portrait pipeline

**Files:**
- Modify: `tools/api/routers/avatar.py`
- Modify: `frontend/src/hooks/useAvatar.ts`
- Test: `tests/api/test_avatar.py` (new or extend)

- [ ] **Step 1: Write the failing test** — `tests/api/test_avatar.py`: `GET /api/avatar` returns `config`, `axes`, `customized` and NO `portrait_status`/`portrait_url`; `POST /api/avatar/portrait` returns 404 (route removed). Use the existing FastAPI TestClient + JWT fixture pattern from `tests/api/test_leaderboard_endpoint.py`.

- [ ] **Step 2: Run it, verify it fails.** Run: `python -m pytest tests/api/test_avatar.py -q` → FAIL.

- [ ] **Step 3: Edit `tools/api/routers/avatar.py`** — remove `request_portrait` (the whole `POST /api/avatar/portrait`), `_portrait_state`, `_generate_portrait`, `_recent`, `_PENDING_TTL_S`, the `BackgroundTasks` import, and the `config_hash/render_portrait/store_portrait/get_avatar_image/upsert_avatar_image` imports. In `get_avatar`, drop `portrait_status`/`portrait_url` from the returned dict (keep `config`, `axes`, `customized`). Update the module docstring.

- [ ] **Step 4: Edit `frontend/src/hooks/useAvatar.ts`** — delete `useSelfHealPortrait`, `useRequestPortrait`, `SELF_HEAL_KEY`; drop `portrait_status`/`portrait_url` from `AvatarResponse`; remove the `refetchInterval` poll (set to `false` or remove). Keep `useAvatar`, `useSaveAvatar`, `AVATAR_COMBOS`.

- [ ] **Step 5: Run tests + typecheck.** `python -m pytest tests/api/test_avatar.py -q` and `cd frontend && npm run typecheck`. Expected: PASS. (Confirm no remaining importers of the deleted hooks: `grep -r useRequestPortrait frontend/src` → empty.)

- [ ] **Step 6: Commit**

```bash
git add tools/api/routers/avatar.py frontend/src/hooks/useAvatar.ts tests/api/test_avatar.py
git commit -m "feat(eyecon): retire AI-portrait pipeline; config is the single source of truth"
```

### Task 8: Delete dead code + final gate

**Files:**
- Delete: `frontend/src/aurora/avatar/representativeTile.ts`, `frontend/tests/eyecon_fallback_logic.mjs`
- Modify: `frontend/tests/eyecon_assert.mjs` (update expectations to the composite)

- [ ] **Step 1: Confirm `representativeTile` is unused** — `grep -r representativeTile frontend/src` → only its own file. Delete it and its test `eyecon_fallback_logic.mjs`.

- [ ] **Step 2: Update `frontend/tests/eyecon_assert.mjs`** — replace any representative-tile/portrait expectations with composite expectations (layer count/z-order via `eyeconLayers`, or the rendered `.eyecon-layer` count in the harness DOM). Keep it green.

- [ ] **Step 3: Full gate**

Run: `python -m pytest -q` and `cd frontend && npm run typecheck && npm run build` and each `frontend/tests/eyecon_*.mjs` harness.
Expected: all PASS.

- [ ] **Step 4: `/ship-check`** — run the ship-check skill (regression test present ✓; behavioural verify on the running app: every axis reflects + features stack). Then commit.

```bash
git add -A frontend/src/aurora/avatar frontend/tests
git commit -m "chore(eyecon): remove representativeTile + refresh eyecon harness for composites"
```

- [ ] **Step 5: Push** — `git fetch origin && git rev-list --left-right --count origin/main...main` first (concurrent sessions force-push main). If diverged, use the isolated-ship worktree recipe. Otherwise `git push origin HEAD:main`. Prod is green on placeholders (the UX fix ships; art is Phase 2).

---

## Phase 0 — alignment spike (GATED: needs a live key + explicit go-ahead)

> Do this BEFORE Phase 2 to de-risk the ~70 paid renders. Not required for Phase 1.

### Task 9: Prove isolated-overlay registration

**Files:**
- Create: `tools/avatar/generate_layers.py` (real-art pipeline)
- Test: `tests/avatar/test_layer_isolate.py` (pure diff-isolation unit)

- [ ] **Step 1: TDD the pure isolation function** — `isolate_overlay(base_rgba, composited_rgba, threshold) -> rgba` keeps pixels whose base↔composite delta exceeds threshold, alpha-zeroes the rest. Unit-test with synthetic images (a base + a base-with-a-red-square → isolate returns only the red square region).

- [ ] **Step 2: Build the pipeline** in `generate_layers.py`: (1) render the base once (fixed anchor prompt), key to transparent 512² via `tools.shared.keying`; (2) per feature, image-to-image edit with `reference=base` and "add ONLY <feature>, nothing else moves"; key; (3) `isolate_overlay` vs base → the overlay. For eyeShape, also export the iris-region mask. Reuse `phrase_for` from `tools/avatar/portrait.py`.

- [ ] **Step 3: GATE — run on 3 features with a live key** (topper `crown`, outfit `cape`, eyeShape `starry`) → `.tmp/eyecon-layers/`. **Manually review**: do the 3 overlays, when stacked on the base in `<Eyecon>`, register correctly (hat on head, cape on body, eye aligned)?
  - **Go** → proceed to Phase 2.
  - **No-go** → apply the fallback (fixed guide-mark template + auto-crop, or manual registration) and re-review before Phase 2.

---

## Phase 2 — paid real art (GATED: explicit go-ahead)

### Task 10: Generate + install the full overlay set

- [ ] **Step 1: `--estimate`** — dry-run `generate_layers.py` to print prompts + count (~70 overlays + base + 12 iris masks), NO calls.
- [ ] **Step 2: GATE — get explicit go-ahead**, then `--generate` (paid) into `.tmp/eyecon-layers/`.
- [ ] **Step 3: Human review** the renders in `.tmp/` for anatomy + registration + on-brand look (photoreal iris feel).
- [ ] **Step 4: `--install`** — convert approved art to `frontend/public/avatar/base/**` + `overlay/**`, replacing placeholders.
- [ ] **Step 5: Full visual verify** across Studio + home + leaderboard; `/ship-check`; commit + push (fetch/diverge check first).

---

## Self-review notes

- **Spec coverage:** layered stack (T3/T4), CSS multiply tint (T4/T5), alignment spike + fallback (T9), axis trim (T1/T2), portrait retirement (T7), migration-free removal (T1 graceful), phasing (Phase 0/1/2), regression test for the bug (T6), harness updates (T8). All spec sections mapped.
- **Type consistency:** `eyeconLayers` / `EyeconLayer` / `BASE_BODY_SRC` / `overlaySrc` / `irisMaskSrc` used identically in T3, T4, T6, T8. Asset paths identical across layers.ts, placeholder gen (T5), and real gen (T9/T10).
- **Deferred:** dropping the dormant `avatar_images` table/columns is intentionally out of scope (later cleanup migration).
