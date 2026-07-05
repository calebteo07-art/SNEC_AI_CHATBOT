"""Selena avatar — server-authoritative parts registry + config validation.

Selena *is* Iris: the one-eyed soft-3D EyeBot mascot from the homepage greeting
(`frontend/public/brand/iris.png`) — a round body with ONE big customizable iris,
tiny arms, a little smile, and a floor shadow. Every custom Selena is an Iris
variant; there is no hair and no second eye. This module is the SINGLE SOURCE OF
TRUTH for which option ids are valid on each axis.

Rendering (RICOE D10): the frontend `<Selena>` is a layered **sprite compositor**.
Each option id here maps to a pre-generated 3D part sprite in a curated library
(built once, offline, via Nano Banana on explicit go-ahead — RICOE D11); the
renderer swaps sprites at runtime, so it stays free/instant/deterministic while
keeping the 3D look. A parity test in the renderer plan keeps the sprite manifest
in sync with these ids. Validation fails closed: any id not listed here is
rejected, so a tampered request body cannot inject arbitrary values.
"""
from __future__ import annotations

CONFIG_VERSION = 2

# axis -> ordered list of valid option ids (order = display order in the builder).
# Rich, with a few deliberately unconventional options (galaxy iris, star eyes,
# star/freckle blush, horns/crown/flame toppers, heart glasses, cape, galaxy bg)
# so customization is fun. Each id maps to a sprite in the 3D part library.
AVATAR_AXES: dict[str, list[str]] = {
    "bodyColor":  ["porcelain", "light", "warm", "tan", "brown", "deep", "rich", "ebony",
                   "peach", "coral", "rose", "butter", "mint", "sage", "sky", "periwinkle",
                   "lavender", "slate", "bubblegum", "aqua"],
    "irisColor":  ["darkBrown", "brown", "hazel", "amber", "green", "blue", "gray", "violet",
                   "teal", "rose", "gold", "galaxy"],
    "eyeShape":   ["round", "wide", "almond", "sleepy", "upturned", "sparkle", "starry"],
    "lashes":     ["none", "natural", "glam", "cyber"],
    "mouth":      ["smile", "grin", "soft", "open", "smirk", "ooh", "tongue"],
    "blush":      ["none", "rose", "coral", "peach", "plum", "berry", "sky", "mint",
                   "gold", "grape", "teal", "stars", "freckles"],
    "glasses":    ["none", "round", "square", "catEye", "monocle", "reading", "goggles",
                   "heart", "visor"],
    "topper":     ["none", "sprout", "bow", "cap", "beanie", "halo", "clip", "flower",
                   "antenna", "crown", "horns", "flame"],
    "accessory":  ["none", "headphones", "earmuffs", "bandage", "sticker", "sparkles"],
    "outfit":     ["none", "scarf", "bowtie", "collar", "lanyard", "hoodie", "labcoat",
                   "turtleneck", "overalls", "cape"],
    "background": ["mist", "blush", "sky", "mint", "lilac", "sun", "graphite", "gemini",
                   "galaxy", "confetti", "sunset", "ocean", "forest"],
}

# The default Selena — matches the homepage Iris: peachy body, big blue iris,
# gentle smile, soft blush, clean background, no extras.
DEFAULT_AVATAR: dict[str, object] = {
    "version": CONFIG_VERSION,
    "bodyColor": "peach",
    "irisColor": "blue",
    "eyeShape": "round",
    "lashes": "natural",
    "mouth": "smile",
    "blush": "peach",
    "glasses": "none",
    "topper": "none",
    "accessory": "none",
    "outfit": "none",
    "background": "mist",
}


class InvalidAvatarConfig(ValueError):
    """Raised when a submitted avatar config contains an unknown option id."""


def validate_config(cfg: dict | None) -> dict:
    """Return a clean, complete avatar config built ONLY from known option ids.

    - Missing axes are filled from DEFAULT_AVATAR.
    - Unknown axes are ignored.
    - Any provided axis whose value is not a valid option id raises
      InvalidAvatarConfig (fail closed).
    Always stamps the current CONFIG_VERSION.
    """
    cfg = cfg or {}
    clean: dict[str, object] = {"version": CONFIG_VERSION}
    for axis, options in AVATAR_AXES.items():
        value = cfg.get(axis)
        if value is not None:
            if value not in options:
                raise InvalidAvatarConfig(f"{axis}={value!r} is not a valid option")
            clean[axis] = value
        else:
            clean[axis] = DEFAULT_AVATAR[axis]
    return clean
