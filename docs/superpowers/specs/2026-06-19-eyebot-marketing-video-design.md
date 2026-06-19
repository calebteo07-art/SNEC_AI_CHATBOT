# EyeBot marketing video — design spec

**Date:** 2026-06-19
**Owner:** Caleb (snec.tne.edu@gmail.com)
**Status:** Approved brief → awaiting spec review

## Objective

Produce a finished, fully-assembled 60–90s marketing video for **EyeBot** (the SNEC
ophthalmology training platform) aimed at **IELA 2026 award judges** (submission deadline
22 Jun 2026). The video must both *market* the product and *show real features*, leaving
judges with a clear understanding of what EyeBot does and why it matters.

## Locked decisions

| Decision | Choice |
| --- | --- |
| Primary audience | IELA 2026 award judges |
| Production style | Hybrid — real app footage + AI-generated b-roll |
| App footage source | Mix: live Playwright capture + animated `final-*.png` screenshots |
| Length / format | 60–90s (target ~85s) · 16:9 landscape · mp4 master |
| Audio | On-screen captions + cinematic/inspiring licensed music bed (no voiceover) |
| Featured capabilities | AI Tutor chat · Living Eye virtual patients · Guided OSCE Station · Flashcards |
| Tagline | "EyeBot — Your AI partner in ophthalmology training." |
| Narrative structure | Approach A — "The Arc" (hook → 4 feature beats → oversight → tagline) |
| Music sourcing | Source a royalty-free cinematic track; log attribution; synthesized-bed fallback |
| Branding | EyeBot as a Singapore National Eye Centre (SNEC) initiative (end card) |
| AI b-roll budget | ~4–6 Higgsfield clips, prompts approved before any paid generation |

## Storyboard — Approach A "The Arc" (~85s)

Source legend: **B-roll** = Higgsfield AI clip · **Live** = Playwright screen capture ·
**Screens** = animated `final-*.png` · **Brand** = logo/title card.

| # | Time | Dur | Source | Visual | On-screen caption |
| --- | --- | --- | --- | --- | --- |
| 01 | 0:00–0:08 | 8s | B-roll | Macro push into a human iris — light flares, shallow focus, slow drift | In ophthalmology, every detail matters. |
| 02 | 0:08–0:12 | 4s | Brand | Iris dissolves into the EyeBot spark-eye logo on the light aurora surface | Meet EyeBot. |
| 03 | 0:12–0:26 | 14s | Live | Resident types a clinical question; grounded answer streams in with a source chip | Ask anything — grounded, cited answers. |
| 04 | 0:26–0:40 | 14s | Live + Screens | Photoreal Living Eye plate; pins light up; a click opens a labelled region | Explore real anatomy — click any structure. |
| 05 | 0:40–0:55 | 15s | Screens + Live | Two-pane OSCE station: virtual patient + checklist ticking + exam tray | Run a full OSCE — examine, decide, get marked. |
| 06 | 0:55–1:08 | 13s | Live | Springy flashcard flip, score count-up, restrained confetti on a high score | Lock it in with active recall. |
| 07 | 1:08–1:14 | 6s | B-roll + Screens | Soft clinician b-roll over a glimpse of the supervisor engagement heatmap | Safe by design — faculty stay in the loop. |
| 08 | 1:14–1:25 | 11s | B-roll + Brand | Eye motif resolves back into the logo; tagline holds; SNEC line | EyeBot — your AI partner in ophthalmology training.<br>A Singapore National Eye Centre initiative. |

Captions are sentence case, brand typeface (Google Sans family), animated in on the beat.
Each feature beat gets a small feature-name label (e.g. "AI Tutor") in the corner.

## Production pipeline

Deterministic assembly; AI only for b-roll generation.

1. **Live capture (Playwright).** Stand up the app locally (per the harness pattern:
   build standalone, serve at `127.0.0.1:3000` with mocked `/api`), then script
   Playwright to record video clips of: chat question→answer stream (sc 03), Living Eye
   pin interaction (sc 04), flashcard flip + score (sc 06), and any live OSCE motion
   (sc 05). Record at 1920×1080, 30fps.
2. **Screenshot animation (ffmpeg).** For scenes/segments not captured live, animate the
   existing `frontend/final-*.png` screenshots with Ken Burns pans/zooms and highlight
   callouts. Already pixel-perfect and on-brand.
3. **AI b-roll (Higgsfield).** Generate the cinematic clips listed below. Prompts are
   reviewed and approved (Checkpoint 1) before any paid generation.
4. **Music (sourced).** Acquire one royalty-free cinematic/inspiring track (~85s usable),
   log attribution in `frontend/ATTRIBUTIONS.md`. Approve track (Checkpoint 2).
5. **Composite (ffmpeg).** Assemble the timeline: clips in order, crossfade/dissolve
   transitions, animated captions + feature labels, music bed with a gentle duck/fade,
   end card. Export 16:9 H.264 mp4 master (1920×1080).

### Candidate AI b-roll shots (final prompts at Checkpoint 1)

1. **Hook** — macro push-in on a human iris, cinematic, shallow depth of field, soft light flares.
2. **Close** — abstract eye/aurora motif resolving toward a clean logo space.
3. **Oversight** — a clinician/educator at a workstation, warm, out-of-focus, documentary feel.
4. **Transition accent** — subtle aurora/light texture for scene transitions.
5. **(optional)** slit-lamp / clinic ambiance establishing shot.

All b-roll must be medically/anatomically plausible and beautiful (per project imagery
standard); reject "wrong-but-pretty" anatomy.

## Assets

- **Have:** EyeBot spark-eye logo + login eye imagery; full `final-*.png` screen set; the
  running app (mockable locally); brand tokens (AURORA light, Google Sans).
- **Need / confirm:** SNEC logo asset for the end card (else render the SNEC line as text);
  the chosen music track; the chosen clinical question text for the chat scene.

## Checkpoints (gates before spend / on key creative)

1. **B-roll prompts** — review final Higgsfield prompts + clip count before paid generation.
2. **Music track** — confirm the sourced track before it's baked into the cut.
3. **Rough cut** — review a silent rough cut (timing/clips) before final captions + music polish.

## Output locations

- **Master deliverable:** `marketing/eyebot_iela_2026.mp4` (uploadable to Drive for the submission).
- **Intermediates:** `.tmp/video/` (clips, frames, captures — disposable, regenerable).

## Risks & fallbacks

| Risk | Fallback |
| --- | --- |
| Local app won't run for live capture | Animate `final-*.png` screenshots for that beat (mix already planned) |
| Higgsfield clip is anatomically wrong / off-brand | Regenerate with tightened prompt; worst case drop to screenshots + eye imagery |
| Network/licensing blocks music download | Synthesize an original cinematic ambient bed with ffmpeg |
| SNEC logo unavailable | Render the SNEC affiliation as a clean text line |

## Success criteria

- A single 16:9 mp4, 60–90s, that plays cleanly start to finish.
- All four features are visibly shown doing something real (not just a static logo reel).
- Captions readable; music synced to cut; transitions smooth; end card carries tagline + SNEC.
- Judges can articulate "what EyeBot does" after one watch.
- No paid AI generation occurred without prior prompt approval.
