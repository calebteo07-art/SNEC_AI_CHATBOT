# Eyecon — rename + mandatory first-login + instant preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the customizable avatar Selena→Eyecon, force an unskippable one-time
first-login customization, make the customizer preview react instantly, and show the
customized Eyecon only in the home popover button, nav-rail (display-only), and leaderboard.

**Architecture:** Keep the painted-raster look + server AI portrait. The Studio previews the
draft live via full-avatar tiles + colour accents; `<Eyecon>` gains a representative-tile
fallback so a saved look shows without the (keyless-blocked) AI render. The gate keys off the
server `customized` flag only; re-customization is locked after the first save.

**Tech Stack:** Next.js 16 / React 19 / Tailwind 4, TanStack Query, FastAPI, Node assert
harness (`frontend/tests/aurora_assert.mjs`), pytest.

Spec: `docs/superpowers/specs/2026-07-13-eyecon-rename-and-first-login-design.md`.

Verify commands:
- Frontend: `cd frontend && npm run typecheck && npm run build`
- Harness: `bash scripts/start-harness.sh aurora` (SKIP_BUILD=1 to reuse a warm build)
- Backend: `python -m pytest -q`

---

### Task 1: `<Eyecon>` render component + representative-tile fallback

**Files:**
- Create: `frontend/src/aurora/avatar/Eyecon.tsx` (renamed from `Selena.tsx`)
- Delete: `frontend/src/aurora/avatar/Selena.tsx`
- Create: `frontend/src/aurora/avatar/representativeTile.ts`
- Modify: `frontend/src/aurora/avatar/tiles.ts` (add priority helper import target)
- Modify importers: `AtlasRail.tsx`, `leaderboard/Podium.tsx`, `leaderboard/LeaderboardRow.tsx`
  (Studio + Profile handled in later tasks; update their imports minimally to keep build green)
- Modify CSS: `frontend/src/aurora/aurora.css` (`.selena-wrap`/`.selena-img` → `.eyecon-wrap`/`.eyecon-img`), `leaderboard.css` (`.selena-wrap` refs)
- Test: `frontend/tests/eyecon_fallback_assert.mjs` (node) OR extend `aurora_assert.mjs`

- [ ] **Step 1: Write `representativeTile.ts` with a failing intent**

```ts
/* Pick the most prominent non-default axis for a config so a saved Eyecon still looks
   customized before/without the AI portrait render. Priority = most visually dominant. */
import type { AvatarConfig } from "./axes.generated";
import { DEFAULT_AVATAR } from "./axes.generated";
import { tileSrc } from "./tiles";

const PRIORITY = ["topper", "outfit", "glasses", "accessory", "lashes", "eyeShape", "mouth"] as const;

/** Returns a tile URL for the most prominent chosen feature, or null if the config is all
 *  defaults on the tile-bearing axes (colour-only customization has no tile). */
export function representativeTileSrc(config?: Partial<AvatarConfig> | null): string | null {
  if (!config) return null;
  for (const axis of PRIORITY) {
    const v = config[axis];
    if (v && v !== "none" && v !== DEFAULT_AVATAR[axis]) return tileSrc(axis, v);
  }
  return null;
}
```

- [ ] **Step 2: Create `Eyecon.tsx` (rename + config-aware resolution)**

```tsx
"use client";
/* <Eyecon> — a student's customizable avatar, raster-only. Resolution order:
   1) the ready AI portrait (fused look, prod), 2) the representative tile of the config
   (so it looks customized even without the paid render), 3) the default iris.png. An
   optional CSS backdrop from the `background` axis sits behind it. */
import type { AvatarConfig } from "./axes.generated";
import { backdropCss } from "./backdrops";
import { representativeTileSrc } from "./representativeTile";

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
  const src = portraitUrl || representativeTileSrc(config) || IRIS_SRC;
  return (
    <span
      role="img"
      aria-label="Eyecon, your avatar"
      className={`eyecon-wrap${className ? " " + className : ""}`}
      style={{ width: size, height: size, background: backdropCss(bg) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="eyecon-img"
        src={src}
        alt=""
        width={size}
        height={size}
        onError={(e) => {
          if (e.currentTarget.getAttribute("src") !== IRIS_SRC) e.currentTarget.src = IRIS_SRC;
        }}
      />
    </span>
  );
}
```
Then delete `Selena.tsx`.

- [ ] **Step 3: Update importers + CSS**

- `AtlasRail.tsx`: `import { Eyecon } from "@/aurora/avatar/Eyecon"`; `<Selena portraitUrl=… size={30}/>` → `<Eyecon portraitUrl={selenaPortraitUrl} config={eyeconConfig} size={30}/>` (rename local `selenaConfig`→`eyeconConfig`, `selenaPortraitUrl`→`eyeconPortraitUrl`; `data-selena`→`data-eyecon`).
- `Podium.tsx` / `LeaderboardRow.tsx`: import `Eyecon`, `<Selena …/>` → `<Eyecon portraitUrl={e.portrait_url} config={e.avatar_config} background={e.avatar_config?.background} size=…/>`.
- `SelenaStudio.tsx`: update import to `Eyecon` (full rebuild in Task 3, but keep it compiling now).
- `Profile.tsx`: update import to `Eyecon` (deleted in Task 5; keep compiling now).
- CSS: in `aurora.css` and `leaderboard.css`, rename `.selena-wrap`→`.eyecon-wrap`, `.selena-img`→`.eyecon-img`, `[data-selena]`→`[data-eyecon]`.

- [ ] **Step 4: Verify typecheck + build green**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS (no unresolved `Selena` references).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/avatar/Eyecon.tsx frontend/src/aurora/avatar/representativeTile.ts \
  frontend/src/aurora/components/AtlasRail.tsx frontend/src/aurora/components/leaderboard/Podium.tsx \
  frontend/src/aurora/components/leaderboard/LeaderboardRow.tsx frontend/src/aurora/aurora.css \
  frontend/src/aurora/leaderboard.css frontend/src/aurora/screens/SelenaStudio.tsx frontend/src/aurora/screens/Profile.tsx
git rm frontend/src/aurora/avatar/Selena.tsx
git commit -m "feat(eyecon): Eyecon render component with representative-tile fallback"
```

---

### Task 2: Mechanical rename of remaining Selena identifiers/CSS/strings

**Files:** `SelenaLogo.tsx`→`EyeconLogo.tsx`, `home/SelenaGreetingLoop.tsx`→`EyeconGreetingLoop.tsx`,
`home/SelenaBadge.tsx`→`EyeconBadge.tsx`; importers `GreetingHero.tsx`, `MilestoneLadder.tsx`,
`LumenBadge.tsx`, `LumenLadder.tsx`; CSS `brand-mascot.css` (`.selena-logo*`), `home.css` (`.hm-selena*`);
copy in `lumenBadges.ts`; `logo_mark_assert.mjs` (`/SelenaLogo/`→`/EyeconLogo/`), `aurora_assert.mjs`
(`selena-logo`→`eyecon-logo`, `.selena-*`→`.eyecon-*`, `.hm-selena*`).

- [ ] **Step 1:** Rename the three component files + exports; keep the branding-mascot behaviour identical (still renders `/brand/iris.png` and `/media/loops/greeting-selena.*` — asset names unchanged per spec §3).
- [ ] **Step 2:** Update all importers and JSX tags to the new names.
- [ ] **Step 3:** Rename CSS classes `.selena-logo*`→`.eyecon-logo*`, `.hm-selena*`→`.hm-eyecon*`, `data-testid="selena-logo"`→`"eyecon-logo"`, and all usages.
- [ ] **Step 4:** Update `logo_mark_assert.mjs` and the renamed selectors in `aurora_assert.mjs`.
- [ ] **Step 5:** Verify `cd frontend && npm run typecheck && npm run build` PASS.
- [ ] **Step 6:** Commit `refactor(eyecon): rename Selena logo/badge/greeting-loop + CSS/testids → eyecon`.

---

### Task 3: Eyecon Studio — instant preview + vibrant styling + welcome-only

**Files:**
- Create `frontend/src/aurora/screens/EyeconStudio.tsx` (from `SelenaStudio.tsx`); delete old.
- Modify `frontend/src/app/(shell)/studio/page.tsx` (import `EyeconStudio`).
- Modify `frontend/src/aurora/studio.css` (vibrant styling + colour-accent hero, `.selena-img`→`.eyecon-img`).
- Test: extend `aurora_assert.mjs` — tapping a feature tile swaps the hero `<img src>`.

- [ ] **Step 1: Add live-preview state.** In `EyeconStudio`, track the last-touched axis and
  derive the hero image from the draft, not the portrait-only path:

```tsx
const [lastAxis, setLastAxis] = useState<AvatarAxis>("topper");
const setOption = (axis: AvatarAxis, id: string) => {
  setLastAxis(axis);
  setDraft((d) => (d ? ({ ...d, [axis]: id } as AvatarConfig) : d));
};
// Hero preview: prefer a ready portrait; else preview the draft live.
const heroPortrait = !dirty && data?.portrait_status === "ready" ? data?.portrait_url : null;
const previewConfig = draft; // representativeTile + last-touched drive the look
```
Hero JSX:
```tsx
<Eyecon
  portraitUrl={heroPortrait}
  config={draft}
  background={draft.background}
  size={220}
/>
```
For the last-touched **feature** axis, bias the hero to that tile by temporarily promoting it
in the config passed to `<Eyecon>` (representativeTile already prioritises topper→…; to make the
*just-tapped* item win, pass `config={{ ...draft, __focus: lastAxis }}` and have `representativeTileSrc`
honour an optional focus — OR simpler: compute `heroTile` inline):
```tsx
const heroTile = !isColorAxis(lastAxis) && draft[lastAxis] !== "none"
  ? tileSrc(lastAxis, draft[lastAxis]) : null;
// pass portraitUrl={heroPortrait ?? heroTile} so the last tap always shows
```
Use `portraitUrl={heroPortrait ?? heroTile}` and keep `config={draft}` for the fallback when
`heroTile` is null (colour axis tapped).

- [ ] **Step 2: Colour-accent feedback.** Add CSS custom props on the hero wrapper updated on
  colour taps so body/iris/blush taps produce a visible ring/echo:
```tsx
<div className="studio-hero" data-float data-alive
  style={{
    ["--ey-body" as string]: BODY_COLORS[draft.bodyColor] ?? "transparent",
    ["--ey-iris" as string]: IRIS_COLORS[draft.irisColor] ?? "transparent",
    ["--ey-blush" as string]: BLUSH_COLORS[draft.blush] ?? "transparent",
  }}>
```
In `studio.css`, render a colour ring/aura + three swatch dots from these props. Add microcopy:
"Body & eye colour show on your saved Eyecon."

- [ ] **Step 3: Remove skip/onboard escape + welcome-only.** Delete the "Skip for now" button
  and `finishOnboarding`; delete `SELENA_ONBOARDED_KEY` import + its `localStorage.setItem` calls.
  Welcome-mode Save just celebrates then `router.push("/dashboard")`. Rename copy: "Meet Eyecon",
  "Eyecon Studio", "Waking up Eyecon…", "Eyecon saved!", "Couldn't load Eyecon.", help text, etc.
  Rename component `SelenaStudio`→`EyeconStudio`.

- [ ] **Step 4: Vibrant styling** in `studio.css`: warm saturated palette, chunky rounded
  tiles/swatches, springy press, celebratory save. No kart/racing/Mario motifs.

- [ ] **Step 5: Harness assertion.** In `aurora_assert.mjs`, on `/studio?welcome=1`, click a
  feature tile and assert the hero `<img>` `src` changed to `/avatar/tiles/…`.

- [ ] **Step 6:** Verify typecheck+build, then run aurora harness. Commit
  `feat(eyecon): Studio instant tile-swap preview + colour accents + vibrant styling`.

---

### Task 4: Mandatory gate + lock re-customization

**Files:**
- Modify `frontend/src/screens/CheckInGuard.tsx` (server-truth gate; lock `/studio`; delete key).
- Modify `frontend/src/aurora/components/leaderboard/BoardSettings.tsx` (remove "Edit Selena" link).
- Modify `frontend/tests/_mocks.mjs` (default student `customized:true`; add `customized:false` fixture).
- Modify `frontend/tests/aurora_assert.mjs` (gate assertions; drop `eyebot_selena_onboarded`).
- Modify `frontend/tests/flashcards_forfeit_assert.mjs` (drop `eyebot_selena_onboarded`; mock `customized:true`).

- [ ] **Step 1:** In `CheckInGuard.tsx` delete `SELENA_ONBOARDED_KEY` + `onboarded`; set
  `const wantStudio = devAlways ? !studioShownThisLoad : avatar?.customized === false;`. Add after
  the welcome redirect:
```tsx
/* Re-customization is locked: once customized, /studio is unreachable (welcome flow only). */
if (isStudent && !devAlways && avatar?.customized === true && location.pathname === "/studio") {
  return <Navigate to="/dashboard" replace />;
}
```
- [ ] **Step 2:** Remove the `data-testid="edit-selena"` "Edit Selena" `<Link>` from `BoardSettings.tsx`.
- [ ] **Step 3:** `_mocks.mjs`: the default `/api/avatar` mock returns `customized:true`; add a way
  to serve `customized:false` for the gate test.
- [ ] **Step 4:** `aurora_assert.mjs`: assert (a) `customized:false` student on `/dashboard` is
  redirected to `/studio`; (b) after mocking `customized:true`, `/studio` redirects to `/dashboard`;
  (c) no Skip / no Edit-Eyecon controls. Remove all `localStorage.setItem("eyebot_selena_onboarded", …)`.
- [ ] **Step 5:** Update `flashcards_forfeit_assert.mjs` similarly.
- [ ] **Step 6:** Verify typecheck+build + aurora + flashcards harness. Commit
  `feat(eyecon): mandatory unskippable first-login gate; lock re-customization`.

---

### Task 5: Surface restriction — home popover, remove Profile, nav-rail display-only

**Files:**
- Create `frontend/src/aurora/components/home/EyeconMenu.tsx` (button + popover).
- Modify `frontend/src/aurora/screens/Dashboard.tsx` (replace `hm-avatar` initial with `<EyeconMenu>`).
- Modify `frontend/src/aurora/home.css` (popover styles).
- Delete `frontend/src/aurora/screens/Profile.tsx` + `frontend/src/app/(shell)/profile/page.tsx`.
- Modify `frontend/src/aurora/components/AtlasRail.tsx` (eyecon chip + name → non-interactive; keep Sign out).
- Modify `frontend/src/screens/CheckInGuard.tsx` (drop `/profile` special-cases).
- Test: `aurora_assert.mjs` — home Eyecon button opens popover with change-password + log-out.

- [ ] **Step 1: `EyeconMenu.tsx`** — a button rendering `<Eyecon config… size={40}>` that toggles a
  popover with "Change password" (opens `ChangePasswordModal`, non-forced) and "Log out"
  (`useAuth().logout()` → `/`). Close on outside-click / Escape.
- [ ] **Step 2:** In `Dashboard.tsx` replace the `hm-avatar` initial div (`:102`) with `<EyeconMenu />`;
  reuse the existing `ChangePasswordModal` import.
- [ ] **Step 3:** Delete `Profile.tsx` + its route; remove `/profile` redirect exceptions in
  `CheckInGuard.tsx` (admin/supervisor lines). Verify staff still log out via their consoles (grep
  `logout(` in `supervisor`/`admin` screens; if absent, keep a logout affordance there — note in commit).
- [ ] **Step 4:** In `AtlasRail.tsx` change the `<Link href="/profile">` wrapping the eyecon+name to a
  plain `<div className="aurora-profile" aria-hidden-ish>` (no navigation); keep the Sign out button.
- [ ] **Step 5:** Harness: on `/dashboard`, click the home Eyecon button → assert popover shows
  "Change password" and "Log out".
- [ ] **Step 6:** Verify typecheck+build + aurora harness. Commit
  `feat(eyecon): home Eyecon popover (password/logout); remove Profile; nav-rail display-only`.

---

### Task 6: Leaderboard config for the fallback

**Files:**
- Modify `tools/api/routers/student.py` (leaderboard builder includes full `avatar_config`).
- Modify `frontend/src/hooks/useLeaderboard.ts` (type carries `avatar_config`).
- Test: `tests/gamification/test_leaderboard.py` — entry includes `avatar_config` character axes.

- [ ] **Step 1:** Write a failing pytest asserting a leaderboard entry dict contains `avatar_config`
  with e.g. `topper`, so `<Eyecon>`'s fallback can pick a representative tile.
- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3:** Include the student's full `avatar_config` (not just background) in the entry.
- [ ] **Step 4:** Run pytest → PASS.
- [ ] **Step 5:** Ensure `useLeaderboard.ts` `LeaderboardEntry` types `avatar_config?: Partial<AvatarConfig>`;
  Podium/Row already pass `config={e.avatar_config}` (Task 1).
- [ ] **Step 6:** Verify pytest + typecheck+build. Commit `feat(eyecon): leaderboard carries avatar_config for fallback`.

---

### Task 7: Final gates, design-lock, ship-check

- [ ] **Step 1:** Update `docs/design-locks.md`: first-run onboarding (mandatory/unskippable/one-time),
  custom-avatar surfaces (home popover + nav display-only + leaderboard; Profile removed), Studio
  instant-preview + vibrant, Selena→Eyecon naming.
- [ ] **Step 2:** Full gate: `python -m pytest -q`; `cd frontend && npm run typecheck && npm run build`;
  `bash scripts/start-harness.sh aurora` (and flashcards/station if touched). All green.
- [ ] **Step 3:** `/ship-check` behavioral verify on the running app: new student forced into Studio →
  save → lands home → `/studio` now redirects home → home Eyecon button opens popover → leaderboard
  shows customized tiles. Re-login shows no re-nag.
- [ ] **Step 4:** Commit `docs(eyecon): update design locks` and push to `main` after
  `git fetch` + divergence check (concurrent-session safety).

---

## Self-review

- **Spec coverage:** §3 rename→T1/T2/T3; §4 gate→T4; §5C Studio→T3; §6 fallback→T1+T6; §7 surfaces→T5;
  §8 tests→each task + T7. All covered.
- **Placeholder scan:** code shown for the non-mechanical steps (Eyecon, representativeTile, gate,
  preview, menu). Mechanical rename steps are exhaustive lists, not vague TODOs.
- **Type consistency:** `Eyecon` props (`portraitUrl`, `config`, `background`, `size`) used identically
  in AtlasRail/Podium/Row/Studio/EyeconMenu; `representativeTileSrc(config)` signature stable;
  `avatar_config` shape (`Partial<AvatarConfig>`) consistent FE/BE.
