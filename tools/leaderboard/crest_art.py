"""Leaderboard tier-crest + champion-crown emblems for "The Climb" — Nano-Banana flash,
PAID + go-ahead-gated. Standalone emblems (reference=False) rendered on flat chroma-green
then keyed to alpha + normalised to 512². Mirrors tools/brand/logo_poses.py."""

BG_KEY = "#00B140"  # flat chroma-green backdrop, keyed to alpha (hex — see tools/shared/keying.py)

CRESTS: dict[str, dict] = {
    "bronze": {"name": "Bronze", "desc": "a warm copper-bronze shield medallion with a faceted amber gem at its center"},
    "silver": {"name": "Silver", "desc": "a cool polished silver shield medallion with a faceted pale-blue gem at its center"},
    "gold": {"name": "Gold", "desc": "a radiant gold shield medallion with a faceted amber gem at its center"},
    "platinum": {"name": "Platinum", "desc": "a bright teal-cyan enamel shield medallion with a single faceted aqua gem at its center, simple symmetrical heraldic shield silhouette, no wings and no heart shapes"},
    "diamond": {"name": "Diamond", "desc": "a luminous violet enamel shield medallion with a single large brilliant-cut violet gem at its center, simple symmetrical heraldic shield silhouette, no wings and no banner"},
    "crown": {"name": "Champion crown", "desc": "a warm gold champion's crown with soft rounded jewels, for the top player"},
}


def prompt(crest: dict) -> str:
    return (
        f"A single premium game-UI achievement emblem: {crest['desc']}. "
        "Soft rounded enamel-and-gem style, gentle studio lighting, subtle bevel and inner "
        "glow, friendly and polished (not sharp or aggressive), centered, consistent with a "
        "warm, cute, modern learning app. Flat solid chroma-green (#00B140) background, no "
        "text, no border, no watermark, no extra objects."
    )
