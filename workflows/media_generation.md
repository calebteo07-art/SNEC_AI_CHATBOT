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
  hand-fix hostile output; tighten the prompt instead (2026-06-12: added
  explicit "no <use>/<text>/font attrs/well-formed" clauses after rejects).
- The frontend renders accents via `<img>` only; keep it that way (defence
  in depth — sanitized SVG still must never execute).
- `AccentSvg` slots draw **kind "svg" only** (`accentsFor` filters by kind).
  Rasters are a separate editorial class — an opaque 16:9 photo in a
  linework slot reads as a hard-edged bug. Opt in explicitly if ever needed.
- Gemini specifics: `ask(system_prompt, messages)` signature; pass
  `max_tokens=32768` — Gemini 3.x thinking tokens drain the output budget
  (8192 truncated every SVG). `gemini-3.5-flash` throws 503 "high demand"
  spikes; the sweep skips failed contexts — just rerun those contexts later.
- Sustained flash 503s (hours+, not a spike): fall over with
  `--model gemini-3.1-pro-preview` — 2026-06-13 it generated all 7 retry
  contexts first-try, perfectly palette-locked, every doc sanitizer-clean.
  Model IDs drift: verify with a free ListModels call before assuming
  (`gemini-3.1-pro` 404s; only the `-preview` id serves generateContent).
- Higgsfield CLI: `higgsfield generate create <model> --prompt … --duration …
  --resolution 720p --aspect_ratio 16:9 --wait --json`, then download
  `result_url`. Session expiry → user runs `higgsfield auth login`.
- Credit economics (2026-06-12, 720p): Seedance 2.0 fast ≈ 17.5 credits per
  5 s clip; **Seedance 1.5 Pro ≈ 4.8 credits per 4 s clip** and is the
  default for ambient loops (single-plane, no cuts). Reserve 2.0 for the
  login marquee. Check `higgsfield account status` before/after each clip.
- Loops must be h264/yuv420p (verify with ffprobe) — universal in real
  browsers. Playwright's Chromium lacks h264, so headless sweeps show the
  poster fallback; that is the component working, not a bug.
- ffmpeg on this machine comes from winget (`Gyan.FFmpeg.Essentials`);
  fresh shells may need `$LOCALAPPDATA/Microsoft/WinGet/Links/ffmpeg.exe`.
- Windows console: scripts print ASCII only (cp1252 chokes on unicode glyphs).
- Filenames must start with the NavContext (`dashboard-…`) — the manifest
  infers context from the prefix.
- Workers offline → the admin refresh button surfaces a graceful 503; the
  CLI path always works.
- Loop placements (slots live in the screens): login = masked card-zone
  layer ABOVE The Gaze canvas (anything beneath it is invisible — the gaze
  shader paints the full frame); checkin/summary = full-bleed backdrops
  beneath the deco layers; dashboard = elliptical porthole in the masthead.
