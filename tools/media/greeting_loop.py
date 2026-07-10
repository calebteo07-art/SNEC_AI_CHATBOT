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
CANDIDATE_MODELS = (
    "veo-3.1-fast-generate-preview",
    "veo-3.0-fast-generate-001",
    "veo-3.0-generate-001",
)
