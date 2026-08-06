"""Veo greeting-loop config — the Eyecon picnic crew (PAID, gated).

The clip is the greeting card's FULL-BLEED base layer (landscape 16:9): four
Eyecon friends in different outfits having a picnic in a sunny meadow. Veo can't
emit alpha and won't hold a character's identity from words alone, so this is a
TWO-STAGE brief:

  1. FRAME_PROMPT -> gemini-3.1-flash-image, anchored on the real iris.png (+ the
     three paid poses) as reference parts, produces the conditioning still. Cheap,
     so iterate here until the four genuinely read as Eyecons.
  2. PROMPT -> Veo image-to-video from that approved still (first AND last frame,
     for a seamless loop). Expensive, so it runs once on a still you've reviewed.

⚠ THE COMPOSITION IS LOAD-BEARING, NOT SCENERY. The card crops this 16:9 source
hard and differently per tier (near-square ~1.45:1 on desktop, ~4.6:1 at 900px),
so the crew is pinned BOTTOM-RIGHT (heads ~40% down, blanket to the bottom edge)
and the whole left half + top stays calm, low-detail sky. That is the only region
the shuffling greeting copy is ever laid over — see `.hm-greet` in home.css, which
also floats a light scrim there so the ink is certified against a known floor
rather than against whatever the video happens to be showing.

The exact Veo model id is confirmed by the capability probe in
generate_greeting_loop.py (varies by key).
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "frontend" / "public" / "brand"
IMAGE_REF = BRAND / "iris.png"
# every identity anchor sent with the frame prompt: the rest frame first, then the
# paid poses (they show the nub arms and the smile from other angles).
IMAGE_REFS = (
    IMAGE_REF,
    BRAND / "poses" / "wave.webp",
    BRAND / "poses" / "cheer.webp",
    BRAND / "poses" / "groove.webp",
)

IMAGE_MODEL = "gemini-3.1-flash-image"

# What an Eyecon IS — repeated to the image model because "one-eyed mascot" alone
# reliably drifts into a two-eyed cartoon or a floating eyeball with legs.
CHARACTER = (
    "The reference images are the EyeBot mascot, an 'Eyecon': a soft rounded 3D-rendered "
    "creature whose whole body is one cream-and-peach eyeball. ONE huge glossy blue iris with "
    "a white sclera fills most of the front, a soft eyelid fold arches over it, and a small "
    "warm smile sits below. Two tiny stubby nub arms, no legs, no nose, no ears, no hair, no "
    "second eye. Matte-soft shading, gentle rim light, warm children's-storybook 3D look."
)

FRAME_PROMPT = (
    f"{CHARACTER}\n\n"
    "Draw a wide 16:9 landscape scene in exactly that character style and render quality: "
    "FOUR of these Eyecon friends having a picnic together in a beautiful sunlit grassy "
    "meadow.\n\n"
    "COMPOSITION (strict, this is a layout not a suggestion):\n"
    "- The ENTIRE TOP HALF of the frame is open sky and far, soft, out-of-focus horizon. "
    "Nothing at all happens up there: no characters, no branches, no birds, no clouds with hard "
    "edges. It must stay quiet and even in tone.\n"
    "- All four friends sit close together in the BOTTOM-RIGHT quadrant, on and around a soft "
    "checked picnic blanket with a wicker basket. Stagger them in depth so each one is fully "
    "readable. The group starts around 55% across and stops before the right edge; the tops of "
    "their heads sit just past halfway down the frame; the blanket runs off the bottom edge.\n"
    "- The BOTTOM-LEFT stays soft and low-contrast: gently blurred meadow grass fading into "
    "haze. No sharp foreground flowers, no props, no objects.\n\n"
    "OUTFITS — one each, clearly different, small and soft so the character still reads: a "
    "knitted beanie; a long trailing scarf; an open hoodie; round spectacles resting over the "
    "eye.\n\n"
    "LIGHT AND MOOD: golden late-afternoon sun raking in from the upper left, warm haze, "
    "distant bokeh wildflowers, a few pollen motes floating in the light. Joyful, gentle, "
    "premium — beautiful enough to hold a whole screen.\n\n"
    "Absolutely no text, letters, numbers, logos or watermarks anywhere. Exactly four "
    "characters. No humans, no animals."
)

PROMPT = (
    "Bring this picnic scene gently to life as a seamless loop: the four one-eyed Eyecon "
    "friends breathe and sway where they sit, one blinks its single eye, one lifts a nub arm "
    "in a small friendly wave, the meadow grass and wildflowers ripple in a soft breeze and "
    "pollen motes drift through the warm sunlight — then everything settles so the final frame "
    "is identical to the first for a perfect loop. Locked-off camera, no camera movement. The "
    "left half of the frame stays calm and open to leave room for text. Subtle premium motion "
    "only. No text, no extra characters."
)

NEGATIVE_PROMPT = (
    "text, letters, numbers, watermark, logo, subtitles, extra characters, humans, animals, "
    "two eyes, camera movement, zoom, pan, dolly, morphing, distortion, flicker"
)

# candidate model ids to probe, best-first (confirm live before spending)
CANDIDATE_MODELS = (
    "veo-3.1-fast-generate-preview",
    "veo-3.1-generate-preview",
    "veo-3.1-lite-generate-preview",
)
