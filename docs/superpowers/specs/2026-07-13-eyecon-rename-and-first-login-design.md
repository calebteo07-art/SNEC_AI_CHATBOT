# Eyecon — rename, mandatory first-login customization, instant preview, surface restriction

**Date:** 2026-07-13
**Status:** Approved (design) → implementation
**Author:** agent + user (snec.tne.edu@gmail.com)

## 1. Context & goal

The per-student customizable avatar (currently "Selena") is renamed to **Eyecon**.
Every new student must build their Eyecon on an **unskippable first-login page** before
they can use any feature, and they can **never re-customize** afterward. The customization
page must give **instant visual feedback** on every tap (today it shows the default and
never reacts) and become **vibrant/warm/playful** (arcade "character-select" energy — no
karts, racing, Mario, checkered flags, or mushrooms). The customized Eyecon then appears
**only** in: (a) a homepage top-right button that opens change-password / log-out, (b) the
nav-rail chip (display-only), and (c) the leaderboard.

## 2. The core decision (locked with user)

**Render model: keep the painted-raster look with an instant per-tap tile swap; keep the
server-side AI portrait for the fused look in prod.**

Root cause of the two reported bugs (both confirmed in code):

- *"Selecting a color/accessory does nothing":* the Studio hero `<Selena>` is driven only
  by `portraitUrl`, which is forced to `null` while the draft is dirty
  (`SelenaStudio.tsx:155-156, 180`). During editing it therefore always renders
  `/brand/iris.png`. There is **no client-side composite** — the sticker compositor was
  deleted; the only combined render is a single AI-baked portrait per config.
- *"Save shows the default":* save triggers `POST /api/avatar/portrait`, a **paid Gemini
  render that refuses to run in `MOCK_MODE`** (`portrait.py:252-255`). In any keyless
  environment (local dev, harness, CI) the render never completes → status `failed`/`none`
  → hero stays `/brand/iris.png` forever.

The 103 tile images are **opaque full-avatar previews** (Iris wearing one option, with body
and iris colour baked in), not transparent stackable layers — so a live client composite of
the combined look is not possible from existing art. We therefore keep the AI portrait and
make the preview react instantly via **tile swap** plus a **representative-tile fallback**
(§6) so a customized Eyecon looks customized everywhere even without the paid render.

## 3. Scope

**In scope**

1. Rename `selena` → `eyecon` across the frontend (user-visible strings + component/file
   names + CSS classes + test IDs) — §5.
2. Mandatory, unskippable, one-time first-login customization; re-customization locked — §4.
3. Eyecon Studio: instant tile-swap preview, colour-accent feedback, "your picks" strip,
   vibrant warm arcade styling — §5C.
4. `<Eyecon>` representative-tile fallback so the saved look shows without the AI render — §6.
5. Surface restriction: home popover button, remove Profile screen, nav-rail eyecon
   display-only, keep leaderboard + nav-rail Sign out — §7.
6. Tests (TDD) + harness/mocks updates — §8.

**Out of scope / intentionally left as internal legacy** (documented, not changed):

- Supabase Storage bucket `selena-avatars` (`tools/kb/supabase_client.py:127-139`) — live
  infra; existing cached portrait URLs point at it. Renaming orphans them. Left as-is.
- Public greeting-loop binaries `frontend/public/media/loops/greeting-selena.{mp4,jpg}` and
  their generator `tools/media/generate_greeting_loop.py` — opaque, user-invisible. Left as-is.
- Python backend comments/docstrings referencing "Selena" — internal, no behaviour. Left as-is.
- API paths (`/api/avatar*`) and DB columns (`avatar_config`, `avatar_images`) — never
  contained the token; unchanged.
- The AI portrait backend (`avatar.py` portrait endpoint, `portrait.py`) stays; the frontend
  keeps calling it on save. It simply becomes non-fatal when it can't render (fallback covers it).

## 4. Mandatory first-login gate

`frontend/src/screens/CheckInGuard.tsx` is the single gate (wraps every `(shell)` page).

- **Gate on server truth only.** Replace the current condition
  (`avatar?.customized === false && !onboarded`, `CheckInGuard.tsx:76-77`) with
  `avatar?.customized === false` (keep the `undefined`-while-loading guard so no flash-loop).
  Stop importing/reading `SELENA_ONBOARDED_KEY`; delete the constant.
- **Redirect stays:** student && check-in done && `customized === false` && not on `/studio`
  → `/studio?welcome=1`. Because the guard wraps all feature pages, this blocks everything
  until `customized` flips true, which only a **Save** does.
- **Lock re-customization:** add — student && `customized === true` && `pathname === "/studio"`
  → redirect `/dashboard`. Gate this behind `!devAlways` so the dev-always iteration mode
  (which intentionally re-shows the welcome Studio) still works.
- **Remove the escape hatches** in `EyeconStudio` (was `SelenaStudio.tsx`): delete the
  **"Skip for now"** button (`:161-162`), the `✕ Back to home` in edit mode is moot (edit mode
  is now unreachable), and `finishOnboarding` (`:126-129`). Welcome mode has **no exit that
  isn't Save**. Save flips `customized` server-side (via existing `PUT /api/avatar`) and routes
  to `/dashboard`.
- **Dev-always mode** (`devAlwaysStudio`, `eyebot_always_studio`) is kept for iteration and
  stays production-off.

Edge cases: a student who only ever changes colour axes still Saves a full config → `customized`
true → gate clears (colour-only is allowed). Staff/admin never fetch the avatar → gate never
fires for them.

## 5. Rename mapping (`selena` → `eyecon`)

Applied across the frontend. Files heavily rewritten anyway (Studio, render component,
CheckInGuard) get renamed as part of that work.

| From | To |
|---|---|
| `aurora/avatar/Selena.tsx` (`Selena`) | `aurora/avatar/Eyecon.tsx` (`Eyecon`) |
| `aurora/screens/SelenaStudio.tsx` (`SelenaStudio`) | `aurora/screens/EyeconStudio.tsx` (`EyeconStudio`) |
| `aurora/components/SelenaLogo.tsx` (`SelenaLogo`) | `aurora/components/EyeconLogo.tsx` (`EyeconLogo`) |
| `aurora/components/home/SelenaGreetingLoop.tsx` | `EyeconGreetingLoop.tsx` |
| `aurora/components/home/SelenaBadge.tsx` (`SelenaBadge`, `BadgeState`) | `EyeconBadge.tsx` |
| CSS classes `.selena-wrap/.selena-img/.selena-logo*/.hm-selena*` | `.eyecon-*` equivalents |
| attr `[data-selena]` | `[data-eyecon]` |
| `data-testid="selena-logo"` | `data-testid="eyecon-logo"` |
| Copy: "Meet Selena", "Selena Studio", "Waking up Selena…", "Selena saved!", "Couldn't load Selena.", "Selena has one big eye…", "How's Selena feeling today?", `aria-label="Selena, your avatar"`, "A tiny gleam. Selena approves." | "…Eyecon…" equivalents |
| `data-testid="edit-selena"` + "Edit Selena" link | **removed** (re-customization gone) |
| "Customize Selena" (Profile) | **removed** (Profile screen deleted) |

All importers update in lockstep (GreetingHero, AtlasRail, Podium, LeaderboardRow,
MilestoneLadder, LumenBadge/LumenLadder type imports, studio `page.tsx`, layout comment).
`SELENA_ONBOARDED_KEY` is **deleted**, not renamed (gate no longer uses it).

### 5C. Eyecon Studio — instant preview + vibrant styling

- **Hero reflects the draft live.** Track the most-recently-touched axis. Hero image =
  `tileSrc(lastAxis, draft[lastAxis])` when `lastAxis` is a non-colour axis with a non-`none`
  value; otherwise the representative-tile of the draft (§6) or `iris.png`. Every feature tap
  visibly swaps the hero — the direct fix for "no response."
- **Colour axes** (bodyColor/irisColor/blush have no tile art) give instant feedback via a
  live colour **ring/aura + enlarged swatch echo** around the hero (CSS custom props updated on
  tap), plus the existing live `background` backdrop. In-UI microcopy states the exact body/iris
  recolour appears on the saved Eyecon. (The baked raster cannot be re-tinted client-side.)
- **"Your picks" strip** stays under the hero showing every chosen tile (the full loadout),
  so the combined identity is always visible even though the hero shows one at a time.
- **Styling:** warm saturated palette, chunky rounded tiles/swatches, springy `aurora-press`
  feedback, celebratory save. Explicitly **no** kart/racing/Mario/flag/mushroom motifs.
- Save path unchanged (`PUT /api/avatar` + `POST /api/avatar/portrait`), minus the skip/onboard
  localStorage writes. Welcome-mode Save celebrates briefly then routes to `/dashboard`.

## 6. `<Eyecon>` render + representative-tile fallback

`<Eyecon>` (was `<Selena>`) currently renders `<img src={portraitUrl || IRIS_SRC}>`. Extend it
to accept the **full `config`** (optional, back-compatible) and resolve the image as:

1. ready AI `portraitUrl` → use it (fused look; prod).
2. else representative tile: first non-default axis in priority order
   **topper → outfit → glasses → accessory → lashes → eyeShape → mouth** →
   `tileSrc(axis, config[axis])`.
3. else `/brand/iris.png`.

`background` remains a CSS backdrop. `onError` still degrades to `iris.png`. This makes the
customized Eyecon look customized on the home button, nav rail, and leaderboard **even in
keyless environments**, and upgrades to the fused portrait when it's ready.

**Backend:** the leaderboard entry must carry enough of `avatar_config` for the fallback.
Podium/Row already read `e.avatar_config?.background`, so confirm the full `avatar_config` is
present in the leaderboard payload (`tools/api/routers/student.py` leaderboard builder +
`useLeaderboard.ts` type); if only `background` is exposed, include the character axes (or a
precomputed representative-tile id). Pass `config={e.avatar_config}` into `<Eyecon>` there.

## 7. Where the Eyecon appears

- **Home top-right (`Dashboard.tsx:97-103`):** replace the static initial `hm-avatar` div with
  an **Eyecon button** that opens a small **popover menu**: "Change password" (opens the existing
  `ChangePasswordModal`, non-forced) and "Log out". The Eyecon renders via `<Eyecon config=…>`.
- **Remove the entire Profile screen:** delete `aurora/screens/Profile.tsx` and the
  `app/(shell)/profile/page.tsx` route. Remove the `/profile` special-cases in `CheckInGuard`
  (admin/supervisor exceptions) — they become dead. Confirm staff can still log out via their
  own consoles (verify during implementation; do not strand any role).
- **Nav rail (`AtlasRail.tsx:102-110`):** keep the Eyecon chip but make it **display-only** —
  the `<Link href="/profile">` becomes a non-interactive element (no navigation). The name is
  display-only too. Keep the separate **"Sign out"** button (`:111-117`) so logout works from
  any page. (Change-password lives only in the home popover; forced first-login change-password
  still fires via `ChangePasswordModal forced` on the dashboard, `Dashboard.tsx:88-90`.)
- **Leaderboard:** unchanged render sites (`Podium.tsx:27`, `LeaderboardRow.tsx:26`), now
  passing `config` for the fallback; remove the "Edit Eyecon/Selena" link from `BoardSettings`.
- **No other surface** renders the customized Eyecon. Branding-mascot sites (home greeting
  `EyeconLogo`/Veo loop, tutor mascot, message-bubble mascot, streak badges) are unchanged —
  they are the fixed Iris brand mark, not the per-student avatar.

## 8. Testing (TDD) & harness

Failing tests first, then minimal pass:

- **Frontend harness (`aurora_assert.mjs`)**: (a) a student with `customized:false` is forced
  to the Studio and cannot reach `/dashboard`/`/leaderboard` until saved; (b) `/studio` with
  `customized:true` redirects home (no re-customization); (c) no "Skip" and no "Edit Eyecon"
  controls exist; (d) tapping a feature tile swaps the hero image; (e) the home top-right Eyecon
  button opens a popover with change-password + log-out; (f) renamed selectors
  (`eyecon-logo`, `.eyecon-*`). Update `_mocks.mjs` to return `customized:true` for the default
  logged-in student (replacing the dropped `eyebot_selena_onboarded=1` bypass), and add a
  `customized:false` fixture for the gate test.
- **Component-level**: `<Eyecon>` returns the representative tile for a config with a topper and
  no portrait; returns `iris.png` for an all-default config.
- **Backend (pytest)**: leaderboard payload includes `avatar_config` character axes (or the
  representative field) for the fallback.
- **Gate before ship:** `python -m pytest -q`, `npm run typecheck && npm run build`, and the
  aurora assert harness all green. This is a user-facing state invariant (show-once, unskippable,
  locked-after-create) → follow `/ship-check`: regression test for the repeat/relaunch case +
  a behavioral verify on the running app.

## 9. Data flow

`GET /api/avatar` → `{ config, portrait_status, portrait_url, customized }` (unchanged). Studio
edits mutate a local `draft`; the hero previews `draft` via tiles/colour accents. Save →
`PUT /api/avatar` (persists `avatar_config`, flips `customized`) → `POST /api/avatar/portrait`
(best-effort fused render) → invalidate `["avatar"]`. Every surface renders `<Eyecon config… portraitUrl…>`
resolving portrait-or-representative-tile-or-default. Gate reads `customized` from the same query.

## 10. Design-lock impacts (`docs/design-locks.md`)

Deliberately refined (with user authority) — update the locks:
- *First-run onboarding* → now mandatory & unskippable, server-truth gated, one-time only.
- *Custom avatar surfaces* → home popover button + nav-rail (display-only) + leaderboard only;
  Profile screen removed.
- *Studio* → instant tile-swap preview + colour accents + vibrant arcade styling.
- Naming: "Selena" → "Eyecon" throughout the student-facing product.

## 11. Risks

- Large rename diff on a repo edited by concurrent sessions → `git fetch` + divergence check
  before push; land in one coherent set with green gates.
- Removing `/profile` must not strand staff logout → verify staff console logout during impl.
- Colour axes give accent-only feedback, not a live body recolour (true recolour only on the
  saved AI portrait in prod) — stated in-UI so it isn't perceived as a bug.
- Representative-tile fallback needs full `avatar_config` on leaderboard entries → confirm/expose.
