"""Selena avatar — server-authoritative parts registry + config validation.

Selena *is* Iris: the one-eyed soft-3D EyeBot mascot from the homepage greeting
(`frontend/public/brand/iris.png`) — a round body with ONE big customizable iris,
tiny arms, a little smile, and a floor shadow. Every custom Selena is an Iris
variant; there is no hair and no second eye. This module is the SINGLE SOURCE OF
TRUTH for which option ids are valid on each axis.

Rendering: Selena is composited client-side from this config by a layered
compositor (`frontend/src/aurora/avatar/layers.ts`'s `eyeconLayers()`), not a
single AI-rendered portrait. Validation fails closed: any id not listed here
is rejected, so a tampered request body cannot inject arbitrary values.
"""
from __future__ import annotations

CONFIG_VERSION = 2

# axis -> ordered list of valid option ids (order = display order in the builder).
# Rich and deliberately silly (galaxy iris, laser eyes, traffic-cone hat, boba tea,
# dino onesie, dealWithIt shades, aurora bg) so customization is genuinely fun.
# Each id maps to a bespoke prompt phrase in portrait.py and (for prop axes) a
# static preview tile.
AVATAR_AXES: dict[str, list[str]] = {
    "bodyColor":  ["porcelain", "light", "warm", "tan", "brown", "deep", "rich", "ebony",
                   "peach", "coral", "rose", "butter", "mint", "sage", "sky", "periwinkle",
                   "lavender", "slate", "bubblegum", "aqua", "gold", "silver", "midnight", "watermelon"],
    "irisColor":  ["darkBrown", "brown", "hazel", "amber", "green", "blue", "gray", "violet",
                   "teal", "rose", "gold", "galaxy", "lava", "ice", "rainbow"],
    "eyeShape":   ["round", "wide", "almond", "sleepy", "upturned", "sparkle", "starry",
                   "heart", "dizzy", "laser", "pixel", "rainbow"],
    "topper":     ["none", "sprout", "bow", "cap", "beanie", "halo", "clip", "flower",
                   "antenna", "crown", "horns", "flame", "wizardHat", "propeller",
                   "trafficCone", "rubberDuck", "croissant", "vikingHelm", "pirateHat",
                   "cowboyHat", "chefToque", "discoBall", "catEars", "mushroom"],
    "accessory":  ["none", "headphones", "earmuffs", "bandage", "sticker", "sparkles",
                   "snorkel", "bobaTea", "magicWand", "balloon", "goldChain", "mustache",
                   "fannyPack", "petSnail", "jetpack", "umbrella"],
    "outfit":     ["none", "scarf", "bowtie", "collar", "lanyard", "hoodie", "labcoat",
                   "turtleneck", "overalls", "cape", "dinoOnesie", "astronaut", "tuxedo",
                   "bananaSuit", "bubbleWrap", "hawaiian", "knightArmor", "chefApron",
                   "pufferJacket", "superSuit"],
    "background": ["mist", "blush", "sky", "mint", "lilac", "sun", "graphite", "gemini",
                   "galaxy", "confetti", "sunset", "ocean", "forest", "aurora", "lavaLamp",
                   "arcade", "rainyWindow", "candy", "sakura"],
}

# The default Selena — IDENTICAL to the homepage Iris raster: peachy body, big blue
# iris, clean background, no extras. The frontend renders the default as the
# literal iris.png, so every default axis must match it.
DEFAULT_AVATAR: dict[str, object] = {
    "version": CONFIG_VERSION,
    "bodyColor": "peach",
    "irisColor": "blue",
    "eyeShape": "round",
    "topper": "none",
    "accessory": "none",
    "outfit": "none",
    "background": "mist",
}

# Pre-rendered full-Eyecon "portrait" tiles — one baked character webp per id under
# frontend/public/avatar/tiles/<category>/<id>.webp (generated in past sessions by
# tools/avatar/generate_tiles.py). The Eyecon Studio is a fixed LIBRARY: a student picks
# ONE finished look and it becomes their avatar, stored as avatar_config["portrait"] =
# "<category>/<id>" and rendered as a single image by <Eyecon>. Unlike the compositor axes,
# categories here may be prop-only (glasses / lashes / mouth) with no layer art. Kept in
# lockstep with the committed files by tests/avatar/test_portrait_tiles.py (fails on drift).
PORTRAIT_TILES: dict[str, list[str]] = {
    "outfit":    ["astronaut", "bananaSuit", "bowtie", "bubbleWrap", "cape", "chefApron",
                  "collar", "dinoOnesie", "hawaiian", "hoodie", "knightArmor", "labcoat",
                  "lanyard", "overalls", "pufferJacket", "scarf", "superSuit", "turtleneck", "tuxedo"],
    "topper":    ["antenna", "beanie", "bow", "cap", "catEars", "chefToque", "clip",
                  "cowboyHat", "croissant", "crown", "discoBall", "flame", "flower", "halo",
                  "horns", "mushroom", "pirateHat", "propeller", "rubberDuck", "sprout",
                  "trafficCone", "vikingHelm", "wizardHat"],
    "glasses":   ["broken", "catEye", "cinema3d", "dealWithIt", "goggles", "heart",
                  "magnifier", "monocle", "reading", "round", "ski", "square", "star",
                  "steampunk", "visor"],
    "mouth":     ["catSmile", "chomp", "evilGrin", "grin", "laugh", "ooh", "open", "pout",
                  "shocked", "smile", "smirk", "soft", "tongue", "whistle"],
    "eyeShape":  ["almond", "dizzy", "heart", "laser", "pixel", "rainbow", "round", "sleepy",
                  "sparkle", "starry", "upturned", "wide"],
    "lashes":    ["butterfly", "cyber", "feathery", "glam", "natural"],
    "accessory": ["balloon", "bandage", "bobaTea", "earmuffs", "fannyPack", "goldChain",
                  "headphones", "jetpack", "magicWand", "mustache", "petSnail", "snorkel",
                  "sparkles", "sticker", "umbrella"],
}


def is_valid_portrait(ref: object) -> bool:
    """True iff ``ref`` is a ``"<category>/<id>"`` string naming a known portrait tile.

    Fail-closed: rejects non-strings, missing/extra slashes, unknown categories, and any
    id not in the committed catalog — so a tampered body can't smuggle a path (``../``)
    or arbitrary URL into an <img src>.
    """
    if not isinstance(ref, str) or ref.count("/") != 1:
        return False
    category, tile_id = ref.split("/", 1)
    return tile_id in PORTRAIT_TILES.get(category, ())


class InvalidAvatarConfig(ValueError):
    """Raised when a submitted avatar config contains an unknown option id."""


def validate_config(cfg: dict | None) -> dict:
    """Return a clean, complete avatar config built ONLY from known option ids.

    - Missing axes are filled from DEFAULT_AVATAR.
    - Unknown axes are ignored.
    - Any provided axis whose value is not a valid option id raises
      InvalidAvatarConfig (fail closed).
    - An optional ``portrait`` ("<category>/<id>") picks a pre-rendered library tile; it is
      kept only if it names a known tile, else it fails closed. Absent ⇒ omitted (the avatar
      is composited from the axes as before).
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
    portrait = cfg.get("portrait")
    if portrait is not None:
        if not is_valid_portrait(portrait):
            raise InvalidAvatarConfig(f"portrait={portrait!r} is not a valid tile")
        clean["portrait"] = portrait
    return clean
