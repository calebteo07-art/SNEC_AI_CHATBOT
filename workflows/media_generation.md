# Workflow: Generative Media Library (PHOTOPIC)

## Objective
Keep the frontend's generative media library (`frontend/public/media/`) fresh:
SVG/raster accents from Gemini, cinematic loops from Higgsfield. Assets are
versioned static files resolved instantly by the app — **generation never
happens while a user waits**.

## Cost gate (read first)
Both pipelines spend money. **Always confirm with the user before a bulk
run.** A full SVG sweep ≈ 11 text-model calls; rasters use Nano Banana Pro
(`gemini-3-pro-image`, ~3 calls); Higgsfield loops consume platform credits
per clip. The free path is `tools/media/seed_accents.py` (hand-crafted,
sanitizer-validated).

## Inputs
- `GEMINI_API_KEY` in `.env` (Gemini paths refuse to run without it)
- Higgsfield access via the operator's CLI skills (no key in this repo)
- Prompt source of truth: `tools/media/prompts.py` (SVG_PROMPTS,
  RASTER_PROMPTS, LOOP_PROMPTS — palette-locked to PHOTOPIC)

## Tools
| Step | Tool | Notes |
|---|---|---|
| Seed/replace accents free | `python -m tools.media.seed_accents` | 5 hand-crafted SVGs, no API |
| Gemini SVG sweep (PAID) | `python -m tools.media.generate_accents --kinds svg` | every doc passes `sanitize_svg.py` fail-closed; rejects are skipped, never written |
| Gemini rasters (PAID) | `python -m tools.media.generate_accents --kinds raster` | Nano Banana Pro, 16:9 |
| Higgsfield loops (PAID) | operator: `higgsfield-generate` skill with a `LOOP_PROMPTS` brief (Seedance 2.0, 5–6s, 720p, seamless loop) → download MP4s | then `python -m tools.media.ingest_loops clip.mp4 --context login` (poster via ffmpeg or same-name .jpg) |
| Rebuild manifest only | `python -m tools.media.build_manifest` | runs automatically after the steps above |
| Async refresh from the app | Admin → Overview → "Refresh media library" | queues Celery `media` queue (`docker compose up worker redis`); Higgsfield kinds report `manual` |

## Outputs
- `frontend/public/media/accents/*.svg|png`, `loops/*.mp4 + *.jpg`
- `frontend/public/media/manifest.json` (version bumps each rebuild)
- Commit the library (budget ≈ 10–15 MB; posters are mandatory for every loop)

## Verification
1. `python -m pytest tools/media/tests/ -q` — sanitizer fixtures stay green
2. `GET /media/manifest.json` returns the new version through the app
3. `node frontend/tests/visual_sweep.mjs media /dashboard /checkin /summary`
   — accents render, zero page errors
4. For loops: the login backdrop slot cross-fades in; with reduced motion
   emulated only the poster shows

## Edge cases & learnings
- A model SVG that fails the sanitizer is **discarded wholesale** — never
  hand-fix hostile output; tighten the prompt instead.
- The frontend renders accents via `<img>` only; keep it that way (defence
  in depth — sanitized SVG still must never execute).
- Windows console: scripts print ASCII only (cp1252 chokes on unicode glyphs).
- Filenames must start with the NavContext (`dashboard-…`) — the manifest
  infers context from the prefix.
- Workers offline → the admin refresh button surfaces a graceful 503; the
  CLI path always works.
