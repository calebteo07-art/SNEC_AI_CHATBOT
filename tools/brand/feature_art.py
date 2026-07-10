"""Feature-card Selena scenes — Nano-Banana flash prompt registry (PAID, gated).

Full-bleed themed backgrounds for the Home feature coverflow (Tutor / Virtual
Patients / Flashcards). reference=True (anchored to iris.png) so the mascot is
unmistakably Iris/Selena. Opaque render is fine — these are backgrounds, not
transparent stickers. The lower third is kept calm so the CSS scrim + card text
stay legible. Prompts are recorded in the feature's brief
(docs/design-locks.md / the 2026-07-10 come-alive spec).
"""
from __future__ import annotations

_BASE = (
    "The same one-eyed EyeBot mascot as the reference image — a soft, rounded, hairless "
    "teal-and-cream character with a single large friendly eye and a calm gentle smile, "
    "identical proportions, colours and rendering to the reference. {scene} "
    "Warm premium studio lighting, soft depth of field, a {tone} gradient atmosphere. "
    "The lower third of the frame is calmer and less busy to leave room for text. "
    "Landscape 3:2, mascot to one side. No text, no border, no watermark, no extra "
    "characters, no human faces."
)

# id -> (tone, scene line)
SCENES: dict[str, tuple[str, str]] = {
    "tutor": (
        "violet",
        "She is a friendly Socratic eye-coach beside a softly glowing lesson board with "
        "floating knowledge motes, gesturing warmly as if explaining a concept.",
    ),
    "vp": (
        "teal",
        "She plays a caring clinician at an ophthalmic slit-lamp examination station, a soft "
        "glowing eye-diagram floating beside her, clinical yet warm and approachable.",
    ),
    "flash": (
        "amber-to-coral",
        "She holds up a fan of glowing recall flashcards spread like a playful hand of cards, "
        "each card emitting a soft gemini-gradient glow.",
    ),
}


def prompt(scene: tuple[str, str]) -> str:
    tone, line = scene
    return _BASE.format(scene=line, tone=tone)


def build_estimate() -> list[tuple[str, str]]:
    return [(pid, prompt(scene)) for pid, scene in SCENES.items()]
