# Virtual Patients — "The Living Eye" redesign

**Date:** 2026-06-16
**Status:** Approved (design), pending implementation
**Surface:** Student app · `/cases` (Virtual Patients selection)

## Problem

The Virtual Patients selection page is cluttered: a header, a horizontal
topic-chip rail, a separate fundus porthole, and a dense right-hand patient
list compete for attention. The hero anatomy graphic is a hand-built SVG; the
user wants a **beautiful, clinically-correct generated graphic** that combines a
**sagittal cross-section** with an **ophthalmoscopic fundus view**, carrying
**clickable anatomy labels that route to the correct cases**. Goal: students
*love* it and *enjoy learning*.

## Decisions (locked with user)

1. **Eye graphic = photoreal hybrid.** Nano Banana (`gemini-3-pro-image`)
   generates ONE combined plate (cross-section + fundus inset). A calibrated,
   normally-invisible pin overlay sits on top so clicks stay pixel-perfect and
   route to the right cases. The existing hand-built SVG remains as a graceful
   fallback — generation never blocks the page.
2. **Declutter = eye as hero.** Drop the topic-chip rail (fold topics into one
   quiet `All topics ▾` popover) and the separate porthole (fundus is now inside
   the plate). The interactive eye is the centerpiece; per-case noise trimmed.
3. **Default ("Whole eye") view = show all patients, grouped by difficulty
   tier.** Picking a region filters/refocuses. Exploration is a bonus, never a
   gate — a student can always find a case.

## The generated graphic

- **New tool:** `tools/media/generate_eye_atlas.py` — self-contained, the single
  file that calls Nano Banana. Mirrors `generate_login_eye.py`: `google.genai`,
  `gemini-3-pro-image`, `GEMINI_API_KEY`, writes PNG candidates to
  `frontend/public/media/accents/`. Exits cleanly if the key is absent.
- **Composition (prompt-locked):** sagittal cross-section with the **anterior
  pole (cornea / iris / lens) on the LEFT**, vitreous centre, **optic disc +
  macula on the RIGHT**, peripheral retina lower; a **circular ophthalmoscopic
  fundus** inset (warm retina, optic disc, macula, vessel arcades). Near-black
  `#07080c` field, soft Gemini-gradient rim light (blue `#4285F4` → purple
  `#9B72CB` → rose `#D96570`). Fixed aspect (3:2) so the overlay calibration is
  stable. This **mirrors the existing SVG layout** so ONE pin coordinate set fits
  both raster and fallback.
- **Calibration:** after generating N candidates, the agent reads the winning
  PNG visually and tunes the six pin coordinates to where the anatomy actually
  landed. Output: `eye-atlas-plate-00.png` (+ candidates).

## Clickable labels → cases (contract preserved)

- Six regions unchanged: Cornea · Iris & pupil · Lens · Optic disc · Macula ·
  Peripheral retina, each with its keyword→case mapping (`caseInRegion`).
- Pins live in an absolutely-positioned overlay (`.aurora-pin`) on the plate.
  Labels stay in the DOM always (preserves `:has-text("Optic disc")` test) but
  reveal visually on hover/active.
- **New:** each pin shows a live **patient count** for that region (computed
  client-side from loaded cases), e.g. "Optic disc · 3".

## Layout (decluttered)

```
┌ header (eyebrow + headline) ──────── All topics ▾ ┐
├───────────────────────────┬──────────────────────┤
│  EYE PLATE (hero, sticky) │  Your patient journey │
│  raster + pin overlay     │  active-region pill   │
│  focus-ring → region      │  + count              │
│  ophthalmoscope readout   │  tier spine:          │
│  (1-line teaching caption)│   Foundational        │
│                           │   Developing          │
│                           │   Advanced            │
└───────────────────────────┴──────────────────────┘
```

- Desktop: two columns, plate sticky-left. Mobile: stacks, plate on top, no
  horizontal overflow at 390px.
- "Ophthalmoscope readout" is a single caption line that updates per region
  (teaching microcopy), replacing the separate porthole image.

## Components

| File | Change |
|---|---|
| `tools/media/generate_eye_atlas.py` | NEW — Nano Banana combined-plate generation |
| `frontend/src/aurora/media.ts` | add `eyeAtlas` plate path |
| `frontend/src/aurora/components/AtlasMap.tsx` | raster hero `<img>` + SVG fallback under it; calibrated pin overlay; per-pin counts; fold fundus into plate; readout caption |
| `frontend/src/aurora/screens/Cases.tsx` | drop topic rail → quiet popover; compute per-region counts; eye-hero layout; trim |
| `frontend/src/aurora/components/CaseCard.tsx` | trim per-case noise (quiet chip) |
| `frontend/src/aurora/aurora.css` | hero layout, pins+labels+counts, focus ring, reveal/stagger, topic popover |

## Data flow

Cases fetched from `/api/cases` (+ `?topic_set=`) as today. `caseInRegion`
filters by region; counts derived client-side. `sessionStorage`
`eyebot_case_handoff` → `/cases/:id` preserved.

## Reliability / guardrails

- `<img onError>` → SVG fallback. UI fully functional before any image exists.
- Image generation is build-time/offline — no runtime event-loop risk for the
  single Render worker.
- **Paid API gate:** build + verify on the SVG fallback first; run Nano Banana
  generation only on explicit user go-ahead, then iterate on candidates.

## Test hooks preserved

`.aurora-atlas-plate` · `.aurora-pin` (label text incl. "Optic disc") ·
`[data-testid="case-list"] .aurora-case` · clicking "Optic disc" narrows the
list. Run `frontend/tests/aurora_assert.mjs` after.

## Out of scope

Case session page, backend `/api/cases`, topic taxonomy, difficulty assignment.
