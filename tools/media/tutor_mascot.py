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
    "Seamless looping animation of this one-eyed teal-and-cream EyeBot mascot doing a "
    "goofy, adorable, ridiculous FAST little dance, centered in frame: it bounces and "
    "wiggles with springy squash-and-stretch, does a quick spin and a playful bop, its "
    "single eye blinking cheekily — exaggerated bouncy cartoon energy, high tempo, always "
    "staying centered and fully in frame. The final frame is identical to the first for a "
    "perfect loop. Soft warm studio lighting on a calm ivory spotlight background. No "
    "camera movement, no zoom, no pan, no text, no extra characters."
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
