"""Veo tutor-mascot config — image-to-video from iris.png (PAID, gated).

A brand-new, tutor-ONLY dancing Iris loop for the /chat landing: cute, funny,
ridiculous, FAST — distinct from Home's calm greeting loop. Veo can't emit alpha,
so the conditioning frame bakes a soft IVORY spotlight matching the tutor surface
(.aurora-chat), and the clip is shown in a rounded stage (object-fit: cover). The
exact Veo model id is confirmed by the capability probe (varies by key).
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMAGE_REF = ROOT / "frontend" / "public" / "brand" / "iris.png"

PROMPT = (
    "Seamless looping animation of this one-eyed peachy-cream EyeBot mascot — a round, LEGLESS "
    "jelly-ball character — bouncing and squishing in place with fast, springy, ridiculous "
    "cartoon energy, staying centered and facing the camera the whole time: its whole round "
    "body springs straight up and down, squashing flat when it lands and stretching tall when "
    "it leaps, jiggling and wobbling side to side like a happy water balloon, while its two "
    "tiny stubby arm-nubs wiggle and its single big blue eye blinks and darts around cheekily. "
    "CRITICAL: it is a round ball-shaped blob with a smooth round bottom and absolutely NO "
    "legs, NO feet, and NO thin limbs — it never grows legs, it bounces as one solid round "
    "body. Its entire body stays the exact same soft peachy-cream color shown; never recolor "
    "it, never turn it teal or blue. High tempo, exaggerated squash-and-stretch, adorable and "
    "funny, always centered and fully in frame. The final frame is identical to the first for "
    "a perfect loop. Soft warm studio lighting on a flat calm ivory background. No camera "
    "movement, no zoom, no pan, no text, no extra characters."
)

# candidate model ids to probe, best-first (confirm live before spending)
CANDIDATE_MODELS = (
    "veo-3.1-fast-generate-preview",
    "veo-3.0-fast-generate-001",
    "veo-3.0-generate-001",
)

# Known-good aspect on this key (greeting loop shipped 16:9); the square stage
# center-crops via object-fit: cover. Switch to "9:16" after review if the crop is tight.
ASPECT = "16:9"
