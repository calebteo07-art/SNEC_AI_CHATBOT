# Homepage "Come Alive" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the student Home to life — an alive/enlarged streak flame, larger clearer type on every card, the three feature cards restyled into mesmerizing default-Selena scenes, the plain streak/badge/progress cards lifted, and the greeting-card Selena made always-default and truly animated (CSS now, gated Veo loop later).

**Architecture:** Frontend-only CSS + component edits scoped under `.aurora-home` (`home.css`) and `frontend/src/aurora/components/home/*`, plus two gated paid-gen Python tools that mirror `tools/brand/generate_poses.py` (Nano-Banana flash feature scenes; Veo greeting loop). Placeholders-first so every non-paid task ships green keyless; paid generation is isolated behind explicit go-ahead tasks. Ship to `main` after each green task.

**Tech Stack:** Next.js 16 / React 19 / plain CSS (`home.css`), Python 3.12 + `tools/avatar/generate_sprites.py` (`google-genai`), pytest, aurora assert harness.

**Spec:** `docs/superpowers/specs/2026-07-10-homepage-come-alive-design.md`

**Global conventions (every task):**
- All motion added must freeze under BOTH `@media (prefers-reduced-motion: reduce)` and `html[data-motion="reduce"]` (see existing guards `home.css:202-215`).
- Stage ONLY the files a task names — the working tree carries unrelated dirty files (`frontend/src/aurora/leaderboard.css`, `frontend/src/aurora/components/leaderboard/`). Never `git add -A`.
- After a task is green, commit + push to `main` (auto-deploys). Never push red.
- Verify keyless: `pytest` auto-enables MOCK_MODE; the aurora harness is keyless.
- Harness gotcha: run the assert against an ALREADY-WARM server —
  `node frontend/tests/aurora_assert.mjs http://127.0.0.1:3000` — and the nav context needs `localStorage eyebot_selena_onboarded=1` (the harness mock sets this; if navigating manually, set it or `CheckInGuard` gates to welcome-Studio).

---

## File Structure

**Modify (CSS/TS):**
- `frontend/src/aurora/home.css` — flame, type scale, plain-card lifts, feature-scene skin (Tasks 1,2,3,6).
- `frontend/src/aurora/components/home/GreetingHero.tsx` — always-default mascot; mount `<SelenaGreetingLoop>` (Tasks 4, 8).
- `frontend/src/aurora/screens/Dashboard.tsx` — stop passing `portraitUrl`/`background` to GreetingHero (Task 4).
- `docs/design-locks.md` — Home refine + Custom-Selena amend (Task 4).

**Create (TS):**
- `frontend/src/aurora/components/home/SelenaGreetingLoop.tsx` — self-contained Veo-loop player (Task 8).

**Create (Python tools + assets):**
- `tools/brand/feature_art.py` — feature-scene registry + prompt builder (Task 5).
- `tools/brand/generate_feature_art.py` — estimate/generate/install CLI (Task 5).
- `tools/brand/make_feature_placeholders.py` — labeled placeholder scenes (Task 5).
- `frontend/public/brand/features/{tutor,vp,flash}.webp` — placeholders now, real art in Task 7.
- `tools/media/greeting_loop.py` — Veo prompt/config + capability probe (Task 8).
- `tools/media/generate_greeting_loop.py` — probe/generate/install CLI (Task 8).

**Create (tests):**
- `tests/test_feature_art.py` (Task 5), `tests/test_greeting_loop.py` (Task 8).

---

## Task 1: Living, enlarged streak flame + streak-card surface lift

**Files:**
- Modify: `frontend/src/aurora/home.css` (`.hm-flame` ~91-92, `.hm-big` ~90, `.hm-streak` ~84)

- [ ] **Step 1: Capture the baseline**

Run the harness once and screenshot the streak card so the change is comparable:
```bash
cd "C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT" && SKIP_BUILD= bash scripts/start-harness.sh aurora
```
Expected: build → serve → assert PASS. Note current flame size (66px, static).

- [ ] **Step 2: Enlarge + animate the flame, warm the streak surface**

In `home.css`, replace the `.hm-flame` block and add flame keyframes + an ember wash on `.hm-streak`. Replace lines 91-92:
```css
.aurora-home .hm-flame { width:84px; height:84px; color:var(--flame1); flex-shrink:0;
  transform-origin:50% 92%; animation:hm-flame-flicker 2.3s ease-in-out infinite;
  filter:drop-shadow(0 8px 15px rgba(240,67,31,.38)); }
.hm-flame .core { color:var(--flame2); animation:hm-flame-core 1.5s ease-in-out infinite; }
@keyframes hm-flame-flicker {
  0%,100% { transform:scale(1) skewX(0deg) rotate(0deg); filter:drop-shadow(0 8px 15px rgba(240,67,31,.38)); }
  25% { transform:scale(1.05,1.09) skewX(-2.4deg) rotate(-1.2deg); filter:drop-shadow(0 10px 20px rgba(240,67,31,.55)); }
  55% { transform:scale(.98,1.03) skewX(2deg) rotate(1deg); filter:drop-shadow(0 7px 13px rgba(240,67,31,.42)); }
  78% { transform:scale(1.03,1.06) skewX(-1.2deg) rotate(.6deg); filter:drop-shadow(0 11px 22px rgba(240,67,31,.6)); }
}
@keyframes hm-flame-core { 0%,100% { opacity:.9; transform:translateY(0) scaleY(1); } 50% { opacity:1; transform:translateY(-1px) scaleY(1.08); } }
```
Add an ember spark + a warm surface wash to `.hm-streak` (keep the existing `.hm-streak` rule; append after it, near line 84):
```css
.hm-streak { position:relative; overflow:hidden;
  background:radial-gradient(120% 90% at 18% 0%, #FFF3E4 0%, var(--card) 46%); }
.hm-streak::before { content:""; position:absolute; left:44px; top:96px; width:7px; height:7px; border-radius:50%;
  background:radial-gradient(circle,#FDBA74,#F43F5E); opacity:0; pointer-events:none;
  animation:hm-ember 3.4s ease-in-out infinite; }
@keyframes hm-ember { 0% { opacity:0; transform:translate(0,0) scale(.6); } 20% { opacity:.85; } 100% { opacity:0; transform:translate(9px,-46px) scale(.2); } }
```
> Note: the existing `.hm-streak` rule at line 84 stays; the new `.hm-streak {…}` merges (later rule wins for `position/overflow/background`). If cleaner, edit the original rule in place instead.

- [ ] **Step 3: Freeze the new motion under reduced motion**

Extend the reduced-motion guards (append inside/after the block at `home.css:210-215`):
```css
@media (prefers-reduced-motion: reduce) { .aurora-home .hm-flame, .hm-flame .core, .hm-streak::before { animation:none !important; } }
html[data-motion="reduce"] .aurora-home .hm-flame,
html[data-motion="reduce"] .hm-flame .core,
html[data-motion="reduce"] .hm-streak::before { animation:none !important; }
```

- [ ] **Step 4: Verify build + harness**

Run:
```bash
cd frontend && npm run typecheck && npm run build
```
Expected: green. Then assert vs a warm server (per the harness gotcha) — PASS. Screenshot the streak card at desktop + 390px; confirm the flame is larger, flickering, and frozen when `data-motion=reduce`.

- [ ] **Step 5: Commit + push**

```bash
git add frontend/src/aurora/home.css
git commit -m "feat(home): enlarge + animate streak flame; warm the streak surface (come-alive A/D)"
git push origin main
```

---

## Task 2: Enlarge all words across every Home card

**Files:**
- Modify: `frontend/src/aurora/home.css` (greeting, streak, feature, badge, progress text rules)

- [ ] **Step 1: Bump the type scale + darken low-contrast grays**

Apply these exact edits in `home.css` (find each selector, change the listed props):
- `.hm-greet h1` (48): `font-size:46px` → `50px`.
- `.hm-sub` (50): `font-size:17px` → `19px`; `color:#65546F` → `#5A4B64`.
- `.hm-sh .hm-t` (86): `font-size:15px` → `16.5px`.
- `.hm-slbl` (94): `font-size:13px` → `14px`.
- `.hm-nexttier .hm-nl` (103): `font-size:13.5px` → `15px`.
- `.hm-kicker` (126): `font-size:11.5px` → `12.5px`.
- `.hm-fcard h3` (128): `font-size:26px` → `29px`.
- `.hm-fcard p` (129): `font-size:14.5px` → `16px`.
- `.hm-fcard .hm-open` (130): `font-size:14px` → `15px`.
- `.hm-ph` (139): `font-size:18px` → `20px`.
- `.hm-badge-name` (146): `font-size:12.5px` → `13.5px`.
- `.hm-badge-meta` (147): `font-size:10.5px` → `11.5px`.
- `.hm-stat .hm-sl` (182): `font-size:13px` → `14.5px`; `color:var(--hink2)` unchanged.

- [ ] **Step 2: Keep 390px safe**

In the `@media (max-width:900px)` block (line 186), ensure `.hm-greet h1 { font-size:40px }` still holds after the bump (it does — it overrides). Add a `@media (max-width:560px)` line so the greeting headline shrinks: `.hm-greet h1 { font-size:34px; }`.

- [ ] **Step 3: Verify build + harness + legibility**

Run `cd frontend && npm run typecheck && npm run build` → green. Assert vs warm server → PASS. Screenshot desktop + 390px; confirm no horizontal overflow and text is larger and legible (WCAG-AA contrast on the darkened grays).

- [ ] **Step 4: Commit + push**

```bash
git add frontend/src/aurora/home.css
git commit -m "feat(home): enlarge + clarify type across every card (come-alive B)"
git push origin main
```

---

## Task 3: Lift the plain badge + progress cards

**Files:**
- Modify: `frontend/src/aurora/home.css` (`.hm-panel` ~138, `.hm-ph` ~139, `.hm-stat` ~180-183, `.hm-badges` header)

- [ ] **Step 1: Give the panels depth + a header rule**

Replace `.hm-ph` (139) to add a gradient underline, and lift `.hm-panel`:
```css
.hm-panel { position:relative; border-radius:var(--hr); background:linear-gradient(180deg,#FFFDF9,var(--card));
  border:1px solid var(--line); box-shadow:var(--sh); padding:24px 26px; }
.hm-ph { position:relative; font-family:var(--font-home); font-weight:700; font-size:20px; margin:0 0 18px;
  padding-bottom:12px; display:flex; align-items:center; justify-content:space-between;
  border-bottom:1px solid var(--line); }
.hm-ph::after { content:""; position:absolute; left:0; bottom:-1px; width:52px; height:2px; border-radius:2px;
  background:linear-gradient(90deg,#8B5CF6,#EC4899 60%,#FB923C); }
```

- [ ] **Step 2: Give each progress stat a themed tint + top accent**

Replace `.hm-stat` (180) and add per-tone tints keyed off the existing `.a/.b/.c/.d` value classes on `.hm-sv`:
```css
.hm-stat { position:relative; overflow:hidden; background:#FAF4EA; border:1px solid var(--line);
  border-radius:17px; padding:17px 18px; }
.hm-stat::before { content:""; position:absolute; left:0; top:0; height:3px; width:100%; opacity:.9; }
.hm-stat:has(.hm-sv.a) { background:linear-gradient(180deg,#F4EEFF,#FAF4EA); } .hm-stat:has(.hm-sv.a)::before { background:var(--violet); }
.hm-stat:has(.hm-sv.b) { background:linear-gradient(180deg,#E8FBF5,#FAF4EA); } .hm-stat:has(.hm-sv.b)::before { background:var(--teal-d); }
.hm-stat:has(.hm-sv.c) { background:linear-gradient(180deg,#FFF1E6,#FAF4EA); } .hm-stat:has(.hm-sv.c)::before { background:#EA580C; }
.hm-stat:has(.hm-sv.d) { background:linear-gradient(180deg,#FFECF1,#FAF4EA); } .hm-stat:has(.hm-sv.d)::before { background:var(--coral); }
```

- [ ] **Step 3: Add a subtle shelf line under the badge grid**

Append after `.hm-badges` (142):
```css
.hm-badges { position:relative; }
.hm-badges::after { content:""; position:absolute; left:6%; right:6%; bottom:-6px; height:10px; border-radius:50%;
  background:radial-gradient(ellipse at center, rgba(120,60,30,.10), transparent 72%); }
```

- [ ] **Step 4: Verify build + harness**

`cd frontend && npm run typecheck && npm run build` → green. Assert vs warm server → PASS. Screenshot both panels; confirm they no longer read as flat white.

- [ ] **Step 5: Commit + push**

```bash
git add frontend/src/aurora/home.css
git commit -m "feat(home): lift plain badge + progress panels — depth, header rule, themed stat tiles (come-alive D)"
git push origin main
```

---

## Task 4: Greeting always-default + CSS-alive mascot + lock updates

**Files:**
- Modify: `frontend/src/aurora/components/home/GreetingHero.tsx`
- Modify: `frontend/src/aurora/screens/Dashboard.tsx:34-35,129-130`
- Modify: `frontend/src/aurora/home.css` (`.hm-iris` ~67-68, halo)
- Modify: `docs/design-locks.md`

- [ ] **Step 1: Make GreetingHero always render the default mascot**

In `GreetingHero.tsx`: remove the `portraitUrl` and `background` params from the props type + destructure; remove the `import { backdropGlow }` line; replace the whole `.hm-iriswrap` block (lines 68-84) with the always-default form:
```tsx
      <div className="hm-iriswrap" aria-hidden>
        <span className="hm-irisfloor" />
        <SelenaLogo motion="hello" className="hm-iris" />
      </div>
```
Keep the `SelenaLogo` import.

- [ ] **Step 2: Stop passing the removed props from Dashboard**

In `Dashboard.tsx`, delete the `portraitUrl={portraitUrl}` and `background={avatar?.config?.background}` props from the `<GreetingHero …>` call (lines 129-130). Then delete the now-unused `portraitUrl` const (lines 34-35). Keep `useAvatar()`/`useSelfHealPortrait(avatar)` (still used).
> Verify no other use of `portraitUrl` remains in `Dashboard.tsx` before deleting (grep the file). If `avatar` becomes otherwise unused, keep it — `useSelfHealPortrait(avatar)` uses it.

- [ ] **Step 3: Make the default mascot more alive (CSS)**

In `home.css`, enrich `.hm-iris` (67-68) with a breathing halo + a subtle blink-squash on top of the existing bob:
```css
.hm-iris { position:relative; width:216px; height:216px; margin-bottom:6px;
  animation:hm-iris-bob 4.8s ease-in-out infinite, hm-iris-blink 6.5s ease-in-out infinite; }
@keyframes hm-iris-bob { 0%,100% { transform:translateY(0) rotate(-1deg); } 50% { transform:translateY(-7px) rotate(1.5deg); } }
@keyframes hm-iris-blink { 0%,92%,100% { transform:scaleY(1); } 96% { transform:scaleY(.9); } }
.hm-iriswrap::before { content:""; position:absolute; left:50%; bottom:24px; width:150px; height:150px; transform:translateX(-50%);
  border-radius:50%; z-index:0; background:radial-gradient(circle, rgba(255,220,180,.55), transparent 66%);
  filter:blur(10px); animation:hm-halo-breathe 4.8s ease-in-out infinite; }
```
> `hm-halo-breathe` already exists (line 81); reuse it. `hm-iris-bob` already exists — do not duplicate; only add the `blink` animation to the `.hm-iris` shorthand. Combining two transforms on one element via two keyframes will conflict; instead put `blink` on an inner wrapper OR fold the squash into `hm-iris-bob` (preferred: add `scaleY` to the bob keyframe). Choose the fold: extend `hm-iris-bob` to `50% { transform:translateY(-7px) rotate(1.5deg) scaleY(1.02); }` and add a discrete blink via the halo only. Keep it tasteful; do not stack conflicting transform animations on the same node.

- [ ] **Step 4: Freeze added motion under reduced motion**

Ensure `.hm-iriswrap::before` is covered by the reduced-motion guards (extend the block at 210-215 to include `.aurora-home .hm-iriswrap::before { animation:none; }` under both `@media` and `html[data-motion="reduce"]`).

- [ ] **Step 5: Update the design locks**

In `docs/design-locks.md`:
- Under **Home / Dashboard (LOCKED 2026-07-01)** append a `refined 2026-07-10` note: enlarged type scale; alive enlarged streak flame; feature coverflow reskinned to full-bleed Selena scenes (mechanics unchanged); plain-card lift; greeting mascot always default + alive.
- Under **Custom Selena surfaces (LOCKED 2026-07-08)** append an `amended 2026-07-10` line: the greeting card now hosts the DEFAULT living mascot for every student (CSS-alive + optional Veo loop), not the custom render; the custom render remains on Studio + leaderboard; all other brand surfaces unchanged.

- [ ] **Step 6: Verify + commit + push**

`cd frontend && npm run typecheck && npm run build` → green. Assert vs warm server → PASS (greeting still renders the mascot; a "customized" mock user now sees the default). Screenshot.
```bash
git add frontend/src/aurora/components/home/GreetingHero.tsx frontend/src/aurora/screens/Dashboard.tsx frontend/src/aurora/home.css docs/design-locks.md
git commit -m "feat(home): greeting Selena always default + more alive; amend Custom-Selena lock (come-alive E1)"
git push origin main
```

---

## Task 5: Feature-scene generator tool + labeled placeholders (no paid calls)

**Files:**
- Create: `tools/brand/feature_art.py`
- Create: `tools/brand/generate_feature_art.py`
- Create: `tools/brand/make_feature_placeholders.py`
- Create: `frontend/public/brand/features/{tutor,vp,flash}.webp` (placeholders)
- Test: `tests/test_feature_art.py`

- [ ] **Step 1: Write the failing test**

`tests/test_feature_art.py`:
```python
from tools.brand import feature_art


def test_three_scenes_registered():
    assert set(feature_art.SCENES) == {"tutor", "vp", "flash"}


def test_prompt_anchors_to_reference_and_bans_text():
    p = feature_art.prompt(feature_art.SCENES["tutor"])
    assert "reference image" in p.lower()          # reference=True anchor language
    assert "no text" in p.lower()                    # legibility / clean art
    assert "lower third" in p.lower()                # reserved text-safe region
    assert "socratic" in p.lower()                   # tutor scene line present


def test_estimate_lists_all_scenes_without_calls():
    rows = feature_art.build_estimate()
    assert len(rows) == 3
    assert all(isinstance(pid, str) and isinstance(text, str) for pid, text in rows)
```

- [ ] **Step 2: Run it to watch it fail**

Run: `python -m pytest tests/test_feature_art.py -q`
Expected: FAIL (`ModuleNotFoundError: tools.brand.feature_art`).

- [ ] **Step 3: Implement `feature_art.py`**

`tools/brand/feature_art.py`:
```python
"""Feature-card Selena scenes — Nano-Banana flash prompt registry (PAID, gated).

Full-bleed themed backgrounds for the Home feature coverflow. reference=True
(anchored to iris.png so the mascot is unmistakably Iris/Selena). Opaque render
is fine — these are backgrounds, not transparent stickers. The lower third is
kept calm so the CSS scrim + card text stay legible.
"""
from __future__ import annotations

_BASE = (
    "The same one-eyed EyeBot mascot as the reference image — a soft, rounded, hairless "
    "teal-and-cream character with a single large friendly eye and a calm gentle smile, "
    "identical proportions, colours and rendering to the reference. {scene} "
    "Warm premium studio lighting, soft depth of field, a {tone} gradient atmosphere. "
    "The lower third of the frame is calmer and less busy to leave room for text. "
    "Landscape 3:2, mascot to one side. No text, no border, no watermark, no extra "
    "characters, no human faces."
)

# id -> (tone, scene line)
SCENES: dict[str, tuple[str, str]] = {
    "tutor": ("violet", "She is a friendly Socratic eye-coach beside a softly glowing lesson "
                        "board with floating knowledge motes, gesturing warmly as if explaining a concept."),
    "vp": ("teal", "She plays a caring clinician at an ophthalmic slit-lamp examination station, a "
                   "soft glowing eye-diagram floating beside her, clinical yet warm and approachable."),
    "flash": ("amber-to-coral", "She holds up a fan of glowing recall flashcards spread like a playful "
                                "hand of cards, each card emitting a soft gemini-gradient glow."),
}


def prompt(scene: tuple[str, str]) -> str:
    tone, line = scene
    return _BASE.format(scene=line, tone=tone)


def build_estimate() -> list[tuple[str, str]]:
    return [(pid, prompt(scene)) for pid, scene in SCENES.items()]
```

- [ ] **Step 4: Run the test to green**

Run: `python -m pytest tests/test_feature_art.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the CLI (mirrors generate_poses.py)**

`tools/brand/generate_feature_art.py` — `--estimate` (no calls) / `--generate` (PAID, to `.tmp/feature-art/`, refuses in MOCK_MODE) / `--install` (→ `frontend/public/brand/features/*.webp`). Reuse `tools/avatar/generate_sprites.generate_image_bytes(prompt, model=MODELS["flash"], reference=True)`:
```python
#!/usr/bin/env python3
"""Feature-card Selena scenes via Nano-Banana flash — PAID, go-ahead-gated.
Usage:
    python tools/brand/generate_feature_art.py --estimate          # prompts only, NO calls
    python tools/brand/generate_feature_art.py --generate [--only tutor,vp]
    python tools/brand/generate_feature_art.py --install
"""
import argparse, io, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from PIL import Image
from tools.avatar import generate_sprites
from tools.brand.feature_art import SCENES, prompt, build_estimate
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]
ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / ".tmp" / "feature-art"
PUB = ROOT / "frontend" / "public" / "brand" / "features"


def generate_one(pid: str) -> Path | None:
    if MOCK_MODE:
        raise RuntimeError("needs a live GEMINI_API_KEY; refusing in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(prompt(SCENES[pid]), model=MODEL, reference=True)
    if not data:
        print(f"  [{pid}] no image"); return None
    TMP.mkdir(parents=True, exist_ok=True)
    out = TMP / f"{pid}.png"; Image.open(io.BytesIO(data)).convert("RGB").save(out)
    print(f"  [{pid}] saved {out} ({out.stat().st_size:,} bytes)"); return out


def run_install() -> int:
    srcs = sorted(TMP.glob("*.png"))
    if not srcs:
        print(f"nothing in {TMP} (run --generate)", file=sys.stderr); return 1
    PUB.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        if src.stem not in SCENES: print(f"  skip {src.name}"); continue
        Image.open(src).convert("RGB").save(PUB / f"{src.stem}.webp", "WEBP", quality=86)
        print(f"  installed /brand/features/{src.stem}.webp")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--estimate", action="store_true"); ap.add_argument("--generate", action="store_true")
    ap.add_argument("--install", action="store_true"); ap.add_argument("--only", default="")
    a = ap.parse_args()
    if a.install: return run_install()
    if not a.generate:
        rows = build_estimate()
        print(f"ESTIMATE — {len(rows)} scene(s) via {MODEL} (reference=True). flash bills a few cents each.\n")
        for pid, p in rows: print(f"— {pid}:\n    {p}\n")
        return 0
    if MOCK_MODE: print("ERROR: MOCK_MODE — no key.", file=sys.stderr); return 2
    only = {s.strip() for s in a.only.split(",") if s.strip()}
    ids = [p for p in SCENES if not only or p in only]
    ok = sum(1 for pid in ids if generate_one(pid))
    print(f"\nDone: {ok}/{len(ids)}. Review {TMP} before --install."); return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 6: Placeholder generator + placeholder assets**

`tools/brand/make_feature_placeholders.py` (mirror `make_pose_placeholders.py`): draw a labeled tone-gradient 600×400 webp per scene into `frontend/public/brand/features/` so the CSS + scrim can be verified keyless. Each placeholder is a diagonal tone gradient with the scene id + "PLACEHOLDER" text so it can never be mistaken for real art. Run it:
```bash
python tools/brand/make_feature_placeholders.py
```
Expected: writes `tutor.webp`, `vp.webp`, `flash.webp`.

- [ ] **Step 7: Estimate output sanity + commit**

Run `python tools/brand/generate_feature_art.py --estimate` → prints 3 prompts, makes NO calls.
```bash
git add tools/brand/feature_art.py tools/brand/generate_feature_art.py tools/brand/make_feature_placeholders.py tests/test_feature_art.py frontend/public/brand/features/
git commit -m "feat(home): feature-scene flash generator + labeled placeholders (come-alive C, keyless)"
git push origin main
```

---

## Task 6: Reskin the feature coverflow cards to full-bleed scenes

**Files:**
- Modify: `frontend/src/aurora/home.css` (`.hm-fcard*` 112-131)

- [ ] **Step 1: Layer the scene image under a legibility scrim**

Add a background image layer + a bottom-up scrim to each `.hm-fcard`. The tone gradient (115-117) STAYS as the graceful fallback beneath the image. After the `.hm-fcard::before` rule (118), add:
```css
/* full-bleed Selena scene: image over the tone gradient, under a bottom-up scrim
   so kicker/title/sub/CTA stay legible (missing asset → tone gradient shows through) */
.hm-fcard { background-size:cover; background-position:center; }
.hm-fcard.tutor { background-image:linear-gradient(180deg,rgba(60,20,110,.05) 0%,rgba(50,15,95,.72) 78%), url("/brand/features/tutor.webp"), linear-gradient(155deg,#A78BFA 0%,#7C3AED 100%); }
.hm-fcard.vp    { background-image:linear-gradient(180deg,rgba(3,60,54,.05) 0%,rgba(4,60,54,.72) 78%), url("/brand/features/vp.webp"), linear-gradient(155deg,#2DD4BF 0%,#0D9488 100%); }
.hm-fcard.flash { background-image:linear-gradient(180deg,rgba(120,20,40,.05) 0%,rgba(120,20,45,.72) 78%), url("/brand/features/flash.webp"), linear-gradient(155deg,#FDBA74 0%,#F43F5E 100%); }
```
> This replaces the plain `background:` on `.tutor/.vp/.flash` (115-117) with a 3-layer `background-image` (scrim → scene → tone fallback). Keep the `.hm-fcard-orb` bloom + `.hm-deco` icon (they read fine over art). The text nodes are already `position:relative` (z-above the scrim).

- [ ] **Step 2: Ensure title/sub sit at the bottom over the scrim**

Confirm `.hm-fcard h3 { margin:auto 0 0 }` (128) still pushes the title to the card bottom (into the dark scrim). No change expected; verify visually.

- [ ] **Step 3: Verify build + harness + legibility**

`cd frontend && npm run typecheck && npm run build` → green. Assert vs warm server → PASS. Screenshot the coverflow; confirm each card shows its (placeholder) scene with legible text over the scrim, and that removing an asset falls back to the tone gradient. Confirm drift/tap/arrows still work.

- [ ] **Step 4: Commit + push**

```bash
git add frontend/src/aurora/home.css
git commit -m "feat(home): reskin feature coverflow to full-bleed Selena scenes + legibility scrim (come-alive C)"
git push origin main
```

---

## Task 7: PAID — generate + install the real feature scenes (GATED)

**Do not start without explicit user go-ahead.** This spends real money + prod quota.

- [ ] **Step 1: Show the estimate, get go-ahead**

Run `python tools/brand/generate_feature_art.py --estimate`; paste the 3 prompts + the flash per-image cost note to the user; wait for an explicit "go".

- [ ] **Step 2: Generate to .tmp**

Run `python tools/brand/generate_feature_art.py --generate`. Review `.tmp/feature-art/*.png`: mascot is recognizably Iris, scene matches, lower third calm enough for text. Regenerate `--only <id>` for any miss.

- [ ] **Step 3: Install + verify over real art**

Run `python tools/brand/generate_feature_art.py --install`. Rebuild + harness; screenshot the coverflow over the real scenes; confirm scrim keeps text WCAG-AA legible (tighten the scrim opacity in `home.css` if a scene is bright). 

- [ ] **Step 4: Commit + push**

```bash
git add frontend/public/brand/features/
git commit -m "feat(home): install real Nano-Banana feature scenes (paid art)"
git push origin main
```

---

## Task 8: Veo greeting-loop player + generator tool (scaffold, no paid calls)

**Files:**
- Create: `frontend/src/aurora/components/home/SelenaGreetingLoop.tsx`
- Modify: `frontend/src/aurora/components/home/GreetingHero.tsx`
- Create: `tools/media/greeting_loop.py`
- Create: `tools/media/generate_greeting_loop.py`
- Test: `tests/test_greeting_loop.py`

- [ ] **Step 1: Write the failing test for the loop tool logic**

`tests/test_greeting_loop.py`:
```python
from tools.media import greeting_loop


def test_prompt_is_seamless_loop_and_bans_text():
    p = greeting_loop.PROMPT.lower()
    assert "loop" in p and "identical to the first" in p
    assert "no text" in p
    assert "blink" in p and "wave" in p


def test_reference_image_is_iris():
    assert greeting_loop.IMAGE_REF.name == "iris.png"
    # path points inside the repo's brand assets
    assert "brand" in greeting_loop.IMAGE_REF.parts
```

- [ ] **Step 2: Run to watch it fail**

Run: `python -m pytest tests/test_greeting_loop.py -q`
Expected: FAIL (`ModuleNotFoundError: tools.media.greeting_loop`).

- [ ] **Step 3: Implement `greeting_loop.py`**

`tools/media/greeting_loop.py`:
```python
"""Veo greeting-loop config — image-to-video from iris.png (PAID, gated).

Veo can't emit alpha, so the prompt bakes a warm peach->lavender background that
matches the greeting card (.hm-greet). The exact Veo model id is confirmed by the
capability probe in generate_greeting_loop.py (availability varies by key/date).
"""
from __future__ import annotations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMAGE_REF = ROOT / "frontend" / "public" / "brand" / "iris.png"

PROMPT = (
    "Seamless looping animation of this one-eyed teal-and-cream EyeBot mascot: she gently "
    "breathes and bobs, blinks her single eye once, gives a small friendly wave, then settles "
    "— the final frame identical to the first for a perfect loop. Warm soft studio lighting on "
    "a warm peach-to-lavender gradient background. Calm, premium, subtle motion only, no camera "
    "movement. No text, no extra characters."
)

# candidate model ids to probe, best-first (confirm live before spending)
CANDIDATE_MODELS = ("veo-3.1-fast-generate-preview", "veo-3.0-fast-generate-001", "veo-3.0-generate-001")
```

- [ ] **Step 4: Run to green**

Run: `python -m pytest tests/test_greeting_loop.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the CLI (probe / generate / install)**

`tools/media/generate_greeting_loop.py`:
```python
#!/usr/bin/env python3
"""Veo greeting loop — PAID, go-ahead-gated. Image-to-video from iris.png.
Usage:
    python tools/media/generate_greeting_loop.py --probe      # list available Veo models on this key (cheap)
    python tools/media/generate_greeting_loop.py --estimate   # prompt + plan, NO calls
    python tools/media/generate_greeting_loop.py --generate --model <id>
    python tools/media/generate_greeting_loop.py --install    # .tmp -> public/media/loops/
"""
import argparse, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.media.greeting_loop import PROMPT, IMAGE_REF, CANDIDATE_MODELS
from tools.shared.gemini_client import MOCK_MODE, _API_KEYS

ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / ".tmp" / "greeting-loop"
DEST = ROOT / "frontend" / "public" / "media" / "loops"


def _client():
    from google import genai
    return genai.Client(api_key=_API_KEYS[0])


def run_probe() -> int:
    if MOCK_MODE:
        print("MOCK_MODE — cannot probe; candidates:", ", ".join(CANDIDATE_MODELS)); return 2
    c = _client()
    avail = [m.name for m in c.models.list()]
    hits = [m for m in avail if "veo" in m.lower()]
    print("Veo models on this key:", hits or "(none found)")
    return 0 if hits else 1


def run_generate(model: str) -> int:
    if MOCK_MODE:
        print("ERROR: MOCK_MODE — no key.", file=sys.stderr); return 2
    from google.genai import types
    c = _client()
    img = types.Image.from_file(location=str(IMAGE_REF))
    op = c.models.generate_videos(model=model, prompt=PROMPT, image=img)
    print(f"submitted {model}; polling…")
    while not op.done:
        time.sleep(10); op = c.operations.get(op)
    vid = op.result.generated_videos[0]
    TMP.mkdir(parents=True, exist_ok=True)
    c.files.download(file=vid.video)
    vid.video.save(str(TMP / "greeting-selena.mp4"))
    print(f"saved {TMP/'greeting-selena.mp4'} — review before --install"); return 0


def run_install() -> int:
    src = TMP / "greeting-selena.mp4"
    if not src.exists():
        print(f"missing {src} (run --generate)", file=sys.stderr); return 1
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "greeting-selena.mp4").write_bytes(src.read_bytes())
    poster = TMP / "greeting-selena.jpg"
    if poster.exists(): (DEST / "greeting-selena.jpg").write_bytes(poster.read_bytes())
    else: print("WARN no poster — extract one (ffmpeg) or the player falls back to iris.png")
    print("installed greeting-selena.mp4"); return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true"); ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--generate", action="store_true"); ap.add_argument("--install", action="store_true")
    ap.add_argument("--model", default=CANDIDATE_MODELS[0])
    a = ap.parse_args()
    if a.probe: return run_probe()
    if a.install: return run_install()
    if a.generate: return run_generate(a.model)
    print("ESTIMATE — 1 Veo clip, image=iris.png, model (default):", a.model)
    print("Veo bills per second of video — CONFIRM current pricing before --generate.\n\n", PROMPT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```
> The google-genai video API surface (`generate_videos`, operation polling, `files.download`, `Image.from_file`) should be confirmed against context7 docs at implementation time; adjust names if the SDK differs. This code path only runs under `--generate`/`--probe` with a live key — pytest never exercises it.

- [ ] **Step 6: Self-contained loop player component**

`SelenaGreetingLoop.tsx` — no `useFx` (MotionProvider isn't mounted). Renders nothing when the asset is absent (GreetingHero then shows the CSS mascot); when present, poster paints, video plays muted/loop/inline in view, reduced-motion/save-data/error ⇒ poster (or nothing → CSS mascot):
```tsx
"use client";
import { useEffect, useRef, useState } from "react";

const SRC = "/media/loops/greeting-selena.mp4";
const POSTER = "/media/loops/greeting-selena.jpg";

/** Plays the baked Veo loop when installed; renders null (→ CSS mascot fallback)
    when the asset is missing, reduced-motion is set, or the video errors. */
export function SelenaGreetingLoop({ available }: { available: boolean }) {
  const [reduce, setReduce] = useState(false);
  const [failed, setFailed] = useState(false);
  const vref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const dm = document.documentElement.getAttribute("data-motion") === "reduce";
    setReduce(mq.matches || dm);
  }, []);
  if (!available || failed) return null;
  return (
    <span className="hm-selenaloop" aria-hidden>
      {reduce ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={POSTER} alt="" className="hm-selenaloop-v" onError={() => setFailed(true)} />
      ) : (
        <video ref={vref} src={SRC} poster={POSTER} muted loop playsInline autoPlay
          className="hm-selenaloop-v" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
```
Wire into `GreetingHero.tsx` `.hm-iriswrap`: render `<SelenaGreetingLoop available={GREETING_LOOP} />` above the CSS mascot, where `GREETING_LOOP` is a module const (`false` now; flip to `true` in Task 9 once the mp4 is installed). Add `.hm-selenaloop{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center}` + `.hm-selenaloop-v{width:216px;height:216px;object-fit:contain;border-radius:22px}` to `home.css`, and hide the CSS `.hm-iris` when the loop is present (`.hm-iriswrap:has(.hm-selenaloop) .hm-iris{display:none}`).

- [ ] **Step 7: Verify keyless + commit**

`python -m pytest tests/test_greeting_loop.py -q` → PASS. `cd frontend && npm run typecheck && npm run build` → green (loop absent → CSS mascot shows, unchanged from Task 4). Assert vs warm server → PASS.
```bash
git add frontend/src/aurora/components/home/SelenaGreetingLoop.tsx frontend/src/aurora/components/home/GreetingHero.tsx frontend/src/aurora/home.css tools/media/greeting_loop.py tools/media/generate_greeting_loop.py tests/test_greeting_loop.py
git commit -m "feat(home): Veo greeting-loop player + generator scaffold (come-alive E2, keyless; loop off)"
git push origin main
```

---

## Task 9: PAID — Veo capability probe + generate + install the greeting loop (GATED)

**Do not start without explicit user go-ahead.** Veo bills per second of video — potentially several dollars for one clip.

- [ ] **Step 1: Probe + report**

Run `python tools/media/generate_greeting_loop.py --probe` to list the Veo models actually available on the key. Report the available model(s) + the Veo per-second pricing + the `--estimate` prompt to the user; wait for explicit "go" and a chosen model.

- [ ] **Step 2: Generate + review**

Run `python tools/media/generate_greeting_loop.py --generate --model <chosen>`. Review `.tmp/greeting-loop/greeting-selena.mp4`: mascot resembles Iris, motion is calm, the loop seam is clean, the baked background matches the card warmth. If the loop seam jumps, regenerate. Extract/confirm a poster frame (ffmpeg) beside it.

- [ ] **Step 3: Install + flip the flag + verify**

Run `python tools/media/generate_greeting_loop.py --install`. Set `GREETING_LOOP = true` in `GreetingHero.tsx`. Rebuild; verify the greeting card plays the loop, loops seamlessly, and falls back to poster/static `iris.png` under `data-motion=reduce` and on a simulated load error. Screenshot desktop + 390px.

- [ ] **Step 4: Commit + push**

```bash
git add frontend/public/media/loops/greeting-selena.mp4 frontend/public/media/loops/greeting-selena.jpg frontend/src/aurora/components/home/GreetingHero.tsx
git commit -m "feat(home): install Veo greeting loop; enable video mascot (paid)"
git push origin main
```

---

## Final verification (after Task 6 for the free scope; after Task 9 for full)

- [ ] `python -m pytest -q` (backend) green.
- [ ] `cd frontend && npm run typecheck && npm run build` green.
- [ ] Aurora assert harness green vs a warm server.
- [ ] Screenshots at desktop + 390px, normal + `data-motion=reduce`: flame larger & alive/frozen; type larger & legible; feature cards show Selena scenes with legible text; badge/progress no longer flat; greeting shows the default alive mascot (loop when installed, else CSS).
- [ ] `docs/design-locks.md` reflects the Home refine + Custom-Selena amend.

---

## Self-review

**Spec coverage:** A→T1; B→T2; C→T5(tool+placeholder)+T6(skin)+T7(paid); D→T1(streak)+T3(badge/progress); E-default→T4; E-CSS-alive→T4; E-Veo→T8(scaffold)+T9(paid); lock changes→T4; prompt contracts→T5(feature_art)+T8(greeting_loop). All covered.

**Placeholder scan:** No "TBD/handle edge cases" — every code step shows code. The only deliberately-deferred value is the Veo model id, resolved by the `--probe` step (T9-S1) and defaulted to a candidate list; not a placeholder.

**Type consistency:** `SCENES`/`prompt`/`build_estimate` used identically across T5 tool + test. `generate_image_bytes(prompt, model, reference)` matches `generate_sprites` (verified). `SelenaGreetingLoop({ available })` + `GREETING_LOOP` const consistent across T8/T9. `MODELS["flash"]` = `gemini-3.1-flash-image` (verified in `generate_sprites.py`).

**Known implementation-time confirmations (flagged inline, not blockers):** (a) the Task 4 note about not stacking two conflicting transform animations on `.hm-iris` — fold the blink squash into the bob keyframe; (b) the google-genai video API surface in T8 — confirm against context7 before the paid run.
