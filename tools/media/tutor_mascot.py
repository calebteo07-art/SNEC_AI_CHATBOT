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
    "Seamless looping animation of this one-eyed peachy-cream EyeBot mascot doing a classic, "
    "funny, goofy cartoon DANCE — fast, bouncy and full of personality, staying centered and "
    "facing the camera the whole time: it bops and grooves side to side to a beat, sways and "
    "does a cheeky little shimmy and hip-wiggle, its two short stubby arms swing and wave while "
    "its two short stubby legs do a happy bouncy two-step, with a playful head-bob — silly, "
    "high-energy, adorable dancing. CRITICAL: its single big blue eye stays perfectly ROUND, "
    "clear, glossy and friendly at ALL times — never squash, stretch, warp, narrow, distort or "
    "angle the eye; the body keeps its solid rounded shape (do NOT squash it flat or melt it); "
    "keep the face cute and happy, never scary or creepy. Its entire body stays the exact same "
    "soft peachy-cream color shown, with short stubby limbs only (no long thin legs); never "
    "recolor it, never turn it teal or blue. Fast, goofy, cartoony tempo, always centered and "
    "fully in frame. The final frame is identical to the first for a perfect loop. Soft warm "
    "studio lighting on a flat calm ivory background. No camera movement, no zoom, no pan, no "
    "text, no extra characters."
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
