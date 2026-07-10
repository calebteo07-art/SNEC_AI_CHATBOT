"""Veo greeting-loop config — image-to-video from iris.png (PAID, gated).

The clip is the greeting card's FULL-BLEED base layer (landscape 16:9), so it's
composed with the mascot on the RIGHT and calm open gradient space on the LEFT for
the greeting copy. Veo can't emit alpha, so the conditioning frame bakes a warm
peach->lavender gradient matching the greeting card (.hm-greet). The exact Veo model
id is confirmed by the capability probe in generate_greeting_loop.py (varies by key).
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMAGE_REF = ROOT / "frontend" / "public" / "brand" / "iris.png"

PROMPT = (
    "Seamless looping animation of this one-eyed teal-and-cream EyeBot mascot, positioned on "
    "the RIGHT side of a wide landscape frame with calm open gradient space on the left: she "
    "gently breathes and bobs, blinks her single eye once, gives a small friendly wave, then "
    "settles — the final frame identical to the first for a perfect loop. Warm soft studio "
    "lighting on a warm peach-to-lavender gradient background; the left side stays calm and "
    "uncluttered to leave room for text. Calm, premium, subtle motion only, no camera movement, "
    "the mascot stays on the right. No text, no extra characters."
)

# candidate model ids to probe, best-first (confirm live before spending)
CANDIDATE_MODELS = (
    "veo-3.1-fast-generate-preview",
    "veo-3.0-fast-generate-001",
    "veo-3.0-generate-001",
)
