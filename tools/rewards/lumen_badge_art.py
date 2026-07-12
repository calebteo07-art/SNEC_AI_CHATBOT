"""Lumens vault badge medallions — six light/wealth tiers with Iris (Selena) as the mascot.
Nano-Banana flash, anchored to iris.png (reference=True). PAID + go-ahead-gated. Opaque
medallions (like the streak badges), saved as jpg. Iris = one-eyed, hairless round blob."""

BADGES: dict[str, dict] = {
    "spark":      {"name": "Spark",          "desc": "cupping a single tiny spark of golden light in her hands, humble and delighted, a couple of loose gold coins nearby"},
    "glimmer":    {"name": "Glimmer",        "desc": "haloed in a soft glimmering ring of gold light with a small pile of glowing coins"},
    "glow-up":    {"name": "Glow-Up",        "desc": "literally glowing and radiating warm golden light, standing in a shallow pool of gold coins, confident"},
    "floodlight": {"name": "Floodlight",     "desc": "beaming a brilliant shaft of light while wearing tiny cool sunglasses, knee-deep in gold coins"},
    "blaze":      {"name": "Blaze of Glory", "desc": "wreathed in radiant friendly golden flames of light on a throne of gold coins, triumphant"},
    "supernova":  {"name": "Supernova",      "desc": "a cosmic being of pure radiant light, bursting starlight and golden coins across a galaxy backdrop, legendary"},
}


def prompt(b: dict) -> str:
    return (
        "A premium, adorable collectible achievement medallion of Iris — a one-eyed, hairless, "
        "round mascot blob with a single large friendly eye and no other facial features — "
        f"{b['desc']}. Circular medallion composition, soft rounded 3D enamel-and-gold game-UI "
        "style, gentle studio lighting, warm and cute and beautiful (never scary), centered, "
        "filling the frame on a rich deep-navy-to-gold radial background. No text, no watermark."
    )
