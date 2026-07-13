"""Feature-card Selena mascots — Nano-Banana flash prompt registry (PAID, gated).

Transparent CUT-OUTS of the Iris/Selena mascot for the Home feature coverflow
(Tutor / Virtual Patients / Flashcards). In the "split-hero" card the vibrant colour
comes from a CSS gradient and the mascot is a transparent PNG bleeding off the right —
so these renders are ISOLATED, alpha-channel cut-outs (no scene, no backdrop), each
mascot DOING its feature's action (coaching / examining / holding recall cards).
reference=True (anchored to iris.png) so it is unmistakably Iris. Prompts are recorded
in the Home design lock (docs/design-locks.md).
"""
from __future__ import annotations

_BASE = (
    "A single 3D character portrait of the same one-eyed EyeBot mascot as the reference image — "
    "a soft, rounded, hairless peach-and-cream character with one large friendly blue eye and a "
    "calm gentle smile, identical proportions, colours and glossy Pixar-style 3D rendering to the "
    "reference. Full body, standing upright, centred and filling most of the frame with a generous "
    "even margin on all sides. {action} "
    "Soft warm studio key light with a gentle rim light; a small soft contact shadow directly "
    "under the character only. IMPORTANT: the background is FULLY TRANSPARENT (alpha channel) — "
    "no scene, no room, no floor, no wall, no backdrop and no gradient or colour fill behind the "
    "character, just the character on transparency. Absolutely NO text, letters, numbers, labels, "
    "callout lines, captions, borders or watermarks anywhere; no extra characters, no human faces."
)

# id -> feature action (what the mascot is DOING). Props stay small + held in front so
# they read at card scale and keep a clean, consistent cut-out silhouette.
SCENES: dict[str, str] = {
    "tutor": (
        "She is a friendly Socratic eye-coach: turned slightly to her side, one little hand raised "
        "and pointing upward as if warmly explaining an idea, a single small softly glowing yellow "
        "lightbulb of insight floating just above her raised hand."
    ),
    "vp": (
        "She plays a caring clinician wearing a clean white doctor's coat, holding up a small "
        "handheld ophthalmoscope examination penlight in front of her with both hands and peering "
        "through it as if examining a patient — focused, gentle and reassuring."
    ),
    "flash": (
        "She holds up a neat fan of three or four glowing recall flashcards spread like a playful "
        "hand of cards in front of her, each blank card emitting a soft blue-to-violet gemini "
        "gradient glow, looking delighted and quick-witted."
    ),
}


def prompt(action: str) -> str:
    return _BASE.format(action=action)


def build_estimate() -> list[tuple[str, str]]:
    return [(pid, prompt(action)) for pid, action in SCENES.items()]
