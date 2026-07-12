"""Reward banner backdrops — celebratory scenes that the reward title/medallion overlay onto.
Nano-Banana flash. PAID + go-ahead-gated. Landscape-ish, saved as webp."""

BANNERS: dict[str, dict] = {
    "achievement-flashcards": {"desc": "an explosive celebratory burst of blue and gold light with floating flashcards and confetti, Iris the one-eyed mascot cheering"},
    "achievement-tutor":      {"desc": "a warm celebratory scene of glowing question marks and indigo light rays with Iris the one-eyed mascot delighted"},
    "achievement-osce":       {"desc": "a triumphant clinical-themed celebration in teal and gold with a subtle eye-exam motif and Iris the one-eyed mascot proud"},
    "level-up":               {"desc": "a dramatic golden LEVEL UP style upward light burst with rising sparks and confetti, Iris the one-eyed mascot ascending"},
    "badge-unlock":           {"desc": "a radiant empty spotlight pedestal of golden light and confetti, centered, leaving the middle clear for a medallion to sit on"},
}


def prompt(b: dict) -> str:
    return (
        f"A vibrant celebratory game-reward banner backdrop: {b['desc']}. Iris has exactly ONE big "
        "round glossy eye on a smooth, rounded, perfectly HAIRLESS soft-3D blob body (glossy skin like "
        "the reference image) — absolutely no fur, no feathers, no hair, and never a second eye. Soft "
        "rounded modern game-UI style, rich saturated color, dramatic but friendly and beautiful, wide "
        "landscape composition, strong central focus. No text, no words, no watermark, no UI chrome."
    )
