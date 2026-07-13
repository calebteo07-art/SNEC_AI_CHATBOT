"""Feature-card Selena scenes — Nano-Banana flash prompt registry (PAID, gated).

FULL baked cards for the Home feature coverflow (Tutor / Virtual Patients / Flashcards):
one landscape illustration per card with the themed gradient background AND the mascot hero
rendered together in a single opaque image. The card shows it edge-to-edge (object-fit:cover)
with the title/CTA text overlaid on a scrim over the calmer left third — so there is NO
transparent cut-out to key and nothing to crop distortedly (the earlier green-screen /
checkerboard cut-outs orphaned VP's body and left ragged fringes; baking the whole card avoids
keying entirely). reference=True (anchored to iris.png) so the mascot is unmistakably Iris.
Rendered landscape (3:2) via ImageConfig. Prompts are recorded in the Home design lock
(docs/design-locks.md).
"""
from __future__ import annotations

_BASE = (
    "A polished wide landscape feature-card illustration for a premium app home screen, filling the "
    "entire frame edge to edge as a full-bleed background with no border, frame or padding. Compose it "
    "as a clean two-zone card. {action} The character is the same one-eyed EyeBot mascot as the "
    "reference image — a soft, rounded, hairless peach-and-cream character with one large friendly blue "
    "eye and a calm gentle smile, identical proportions, colours and glossy Pixar-style 3D rendering to "
    "the reference. The mascot and EVERYTHING it holds or that floats near it sit ENTIRELY within the "
    "RIGHT 45% of the frame — a medium size, comfortably inside the canvas with a clear margin from the "
    "right, top and bottom edges so nothing is ever cut off or cropped, and never crossing the vertical "
    "centre line. The whole LEFT HALF of the frame is completely EMPTY negative space: just the smooth "
    "{tone} background with absolutely nothing in it — no character, no hand, no prop, no glow, no object "
    "— a calm, even, slightly darker area reserved for a title. The rich {tone} background bleeds to all "
    "four edges. Soft premium studio lighting, gentle depth. Absolutely NO text, letters, numbers, words, "
    "labels, callout lines, captions, borders, UI elements or watermarks anywhere in the image; no extra "
    "characters, no human faces."
)

# id -> (tone, action). tone = the background gradient mood; action = what the mascot is DOING.
SCENES: dict[str, tuple[str, str]] = {
    "tutor": (
        "deep violet to bright purple",
        "She is a friendly Socratic eye-coach, turned slightly to her side with one little hand raised "
        "and pointing upward as if warmly explaining an idea, a single small softly glowing yellow "
        "lightbulb of insight floating just above her raised hand.",
    ),
    "vp": (
        "deep teal to bright aqua",
        "She plays a caring clinician wearing simple blue medical scrubs (a soft mid-blue scrub top), "
        "holding up a small handheld ophthalmoscope examination penlight and peering through it as if "
        "gently and reassuringly examining a patient.",
    ),
    "flash": (
        "crimson-pink to warm amber",
        "She holds up a neat fan of three or four glowing recall flashcards spread like a playful hand "
        "of cards, each blank card emitting a soft blue-to-violet gemini gradient glow, looking "
        "delighted and quick-witted.",
    ),
}


def prompt(scene: tuple[str, str]) -> str:
    tone, action = scene
    return _BASE.format(action=action, tone=tone)


def build_estimate() -> list[tuple[str, str]]:
    return [(pid, prompt(scene)) for pid, scene in SCENES.items()]
