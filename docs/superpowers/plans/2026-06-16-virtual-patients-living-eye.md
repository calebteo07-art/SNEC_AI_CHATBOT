# "The Living Eye" — Virtual Patients Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/cases` Virtual Patients selection page around a single, beautiful Nano-Banana-generated eye plate (sagittal cross-section + ophthalmoscopic fundus) with calibrated clickable anatomy labels, and declutter the page so students enjoy exploring.

**Architecture:** A new self-contained Python tool generates the combined plate raster via `gemini-3-pro-image`. The React `AtlasMap` renders that raster as the hero with the existing hand-built SVG as an `onError` fallback, and overlays a calibrated, normally-invisible pin layer (one coordinate set fits both raster and SVG because the prompt mirrors the SVG's anatomy layout). `Cases` drops the topic-chip rail for a quiet popover, computes per-region patient counts, and keeps the difficulty-tier journey but lighter. The page is fully functional on the SVG fallback before any image exists; the paid generation is the last, gated step.

**Tech Stack:** Next.js / React (frontend), CSS (`aurora.css`), Python + `google.genai` (`gemini-3-pro-image`), Playwright smoke test (`aurora_assert.mjs`).

---

### Task 1: Nano Banana generation tool

**Files:**
- Create: `tools/media/generate_eye_atlas.py`

- [ ] **Step 1: Write the tool** (mirror `generate_login_eye.py`: load `.env`, refuse without `GEMINI_API_KEY`, `gemini-3-pro-image`, write candidates to `frontend/public/media/accents/`). Two prompts: `PLATE_PROMPT` (combined cross-section + fundus inset, anterior-left/posterior-right, near-black `#07080c` field, Gemini-gradient rim, ASCII-only) and `FUNDUS_PROMPT` (standalone ophthalmoscopic fundus, retained for fallback porthole/future use). CLI: `--count N`, `--aspect` (default `3:2`), `--fundus` flag to switch prompt/stem. Stems: `eye-atlas-plate`, `eye-atlas-fundus`.

- [ ] **Step 2: Verify it refuses without a key**

Run: `python tools/media/generate_eye_atlas.py --count 1` with no key in env
Expected: prints `GEMINI_API_KEY not set - refusing to run.` and exits 1. (Do NOT run a live generation here — that is the gated Task 8.)

- [ ] **Step 3: Commit**

```bash
git add tools/media/generate_eye_atlas.py
git commit -m "feat(media): Nano Banana generator for the combined eye-atlas plate"
```

---

### Task 2: Media path

**Files:**
- Modify: `frontend/src/aurora/media.ts`

- [ ] **Step 1:** Add `eyeAtlas: "/media/accents/eye-atlas-plate-00.png"` to `PLATE`, keep `fundus`. Update the doc comment to note the new combined plate + SVG fallback.

- [ ] **Step 2: Commit** with Task 3 (small change, no standalone value).

---

### Task 3: AtlasMap — raster hero + overlay + counts + readout

**Files:**
- Modify: `frontend/src/aurora/components/AtlasMap.tsx`

- [ ] **Step 1: Extend the component signature.** Add props:
  ```ts
  plateSrc?: string;                 // generated combined plate
  counts?: Partial<Record<Exclude<RegionId, "all">, number>>;  // patients per region
  ```
  Keep `activeRegion`, `onRegion`, `fundusSrc` (now optional/legacy). Keep exported `REGIONS`, `RegionId`, `caseInRegion` unchanged (keyword maps preserved).

- [ ] **Step 2: Render raster-over-SVG inside `.aurora-atlas-plate`.** Add `const [plateFailed, setPlateFailed] = useState(false)`. When `plateSrc && !plateFailed`, render `<img className="aurora-atlas-photo" src={plateSrc} onError={() => setPlateFailed(true)} alt="Sagittal cross-section of the eye with an ophthalmoscopic fundus view" />` ABOVE the existing `<svg className="aurora-atlas-svg">`; the SVG stays mounted underneath as the fallback (hidden via CSS when the photo is shown: parent gets `data-photo={showPhoto}`). Fold the fundus into the plate — remove the separate `.aurora-scope-row` block.

- [ ] **Step 3: Pins keep label text, gain counts.** In the `REGIONS.map`, render the count when present:
  ```tsx
  <span className="aurora-pin-label">{r.label}{counts?.[r.id] ? <i className="aurora-pin-count">{counts[r.id]}</i> : null}</span>
  ```
  Label text still contains `r.label` (preserves `:has-text("Optic disc")`).

- [ ] **Step 4: Replace the porthole with a one-line readout.** Under the plate render a `.aurora-atlas-readout` caption that teaches per region (active region → its teaching line; else a "pick a part of the eye" prompt). Pull short teaching strings from a local `READOUT` map keyed by region id.

- [ ] **Step 5: Type-check.** Run: `cd frontend && npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 6: Commit** (with Task 2).

```bash
git add frontend/src/aurora/media.ts frontend/src/aurora/components/AtlasMap.tsx
git commit -m "feat(cases): AtlasMap renders the generated plate with SVG fallback, pin counts and readout"
```

---

### Task 4: Cases — declutter, counts, quiet topic filter

**Files:**
- Modify: `frontend/src/aurora/screens/Cases.tsx`

- [ ] **Step 1: Compute per-region counts** from the full (topic-filtered) `cases` list using `caseInRegion(`${c.topic} ${c.title}`, region.id)` for each of the 6 regions; memoize.

- [ ] **Step 2: Replace the topic-chip rail with a quiet popover.** A single `All topics ▾` button toggling a small popover list of topics (radio-style: All topics + each `TopicInfo`). Preserves `setSelectedTopic` behavior and the `?topic_set=` fetch. Keep counts `t.completed/t.total` inside the popover rows.

- [ ] **Step 3: Pass `plateSrc={PLATE.eyeAtlas}` and `counts={regionCounts}`** into `<AtlasMap>`. Keep `fundusSrc` optional or drop it.

- [ ] **Step 4: Keep the tier journey** (`journey` memo, spine, `data-testid="case-list"`, `.aurora-case`) — "Whole eye" shows all grouped by tier (per decision 3). Light header: active-region pill + count, tighter eyebrow/headline.

- [ ] **Step 5: Type-check.** Run: `cd frontend && npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/aurora/screens/Cases.tsx
git commit -m "feat(cases): eye-as-hero layout, per-region counts, quiet topic popover"
```

---

### Task 5: CaseCard — trim per-case noise

**Files:**
- Modify: `frontend/src/aurora/components/CaseCard.tsx`

- [ ] **Step 1:** Keep avatar, name·age, one-line complaint, time, Start. Make the topic/`set_label` chip quieter (smaller / lower emphasis) and ensure foot doesn't wrap awkwardly. Preserve the `.aurora-case` hook and `onOpen`.

- [ ] **Step 2: Commit** with Task 6 (visual-only, verified via CSS step).

---

### Task 6: CSS — hero layout, pins, reveal, popover

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (cases/atlas block ~672–785)

- [ ] **Step 1: Plate photo layer.** `.aurora-atlas-photo { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }`. When `.aurora-atlas-plate[data-photo="true"]` show photo, hide `.aurora-atlas-svg` (`opacity:0`); fallback shows SVG when `data-photo="false"`. Keep the dark plate background as the image's letterbox.

- [ ] **Step 2: Pins.** Labels hidden by default, reveal on hover/active (`opacity`/`transform`), keep in DOM. Style `.aurora-pin-count` as a small mono badge. Keep active glow + focus ring.

- [ ] **Step 3: Readout + layout.** Style `.aurora-atlas-readout`. Remove now-dead `.aurora-scope*` rules (fundus folded in). Tighten `.aurora-cases-head`. Add `.aurora-topic-pop*` popover styles. Keep two-column grid + sticky plate; mobile stacks (no overflow at 390px).

- [ ] **Step 4: Commit.**

```bash
git add frontend/src/aurora/components/CaseCard.tsx frontend/src/aurora/aurora.css
git commit -m "feat(cases): living-eye hero styles, reveal-on-hover pins, topic popover"
```

---

### Task 7: Verify (fallback path, no paid call)

- [ ] **Step 1: Build/lint.** Run: `cd frontend && npx tsc --noEmit` and `npx next lint` (if configured). Expected: clean.

- [ ] **Step 2: Smoke test.** Run: `node frontend/tests/aurora_assert.mjs` (per its header — usually `npm run dev` first or it boots its own server). Expected: all PASS, including "Atlas Map region filters the case list". Fix any drift.

- [ ] **Step 3: Visual check** at 1440px and 390px (Playwright/Chrome MCP screenshot): hero eye renders (SVG fallback OK), pins reveal + counts show, topic popover works, no horizontal overflow at 390px.

- [ ] **Step 4: Commit** any fixes.

---

### Task 8: Generate the plate (PAID — gated)

- [ ] **Step 1: Get explicit user go-ahead** before any paid call (CLAUDE.md rule).

- [ ] **Step 2: Generate candidates.** Run: `python tools/media/generate_eye_atlas.py --count 4`. Expected: 4 PNGs in `frontend/public/media/accents/`.

- [ ] **Step 3: Calibrate.** Read the winning PNG visually; pick the most clinical/correct candidate, copy it to `eye-atlas-plate-00.png`, and tune the six `REGIONS[].pos` coordinates so each pin sits on its structure in the chosen image.

- [ ] **Step 4: Re-verify** (Task 7 steps) with the real image, then commit + push.

```bash
git add frontend/public/media/accents/eye-atlas-plate-00.png frontend/src/aurora/components/AtlasMap.tsx
git commit -m "feat(cases): ship generated eye-atlas plate + calibrated pins"
```

---

## Self-Review

- **Spec coverage:** generated graphic (T1, T8) · combined cross-section+fundus (T1 prompt, T3 fold-in) · clickable labels→cases (T3 pins + preserved `caseInRegion`) · counts (T3/T4) · declutter eye-hero (T4/T6) · quiet topics (T4/T6) · show-all-by-tier default (T4) · fallback/no-block (T3/T6) · paid gate (T8) · test hooks (T7). No gaps.
- **Type consistency:** `plateSrc`, `counts`, `REGIONS`, `RegionId`, `caseInRegion` names consistent across T3/T4; `PLATE.eyeAtlas` defined T2 used T4.
- **Placeholders:** none — each task names exact files and concrete changes.
