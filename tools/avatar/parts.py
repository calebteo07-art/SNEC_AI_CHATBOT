"""Selena avatar — server-authoritative parts registry + config validation.

The avatar is a layered-vector character composed from a small saved config.
This module is the SINGLE SOURCE OF TRUTH for which option ids are valid; the
frontend <Selena> renderer mirrors these ids for the actual SVG art (kept in
sync by a parity test in the renderer plan). Validation fails closed: any id not
listed here is rejected, so a tampered request body cannot inject arbitrary
values. Uniforms are intentionally excluded (RICOE D5/D8) — wardrobe is casual.
"""
from __future__ import annotations

CONFIG_VERSION = 1

# axis -> ordered list of valid option ids (order = display order in the builder)
AVATAR_AXES: dict[str, list[str]] = {
    "skinTone":   ["porcelain", "light", "warm", "tan", "brown", "deep", "rich", "ebony"],
    "hairStyle":  ["bob", "long", "ponytail", "bun", "short", "wavy", "curly", "braids", "pixie", "afro", "hijab", "buzz"],
    "hairColor":  ["black", "darkBrown", "brown", "chestnut", "auburn", "blonde", "platinum", "red", "blue", "pink", "teal", "lilac"],
    "eyeColor":   ["darkBrown", "brown", "hazel", "amber", "green", "blue", "gray", "violet"],
    "eyeShape":   ["round", "almond", "wide", "sleepy", "upturned"],
    "brows":      ["soft", "straight", "arched", "bold"],
    "mouth":      ["smile", "grin", "soft", "open", "smirk"],
    "blush":      ["none", "soft", "rosy"],
    "glasses":    ["none", "round", "square", "catEye", "reading"],
    "accessory":  ["none", "earrings", "hairclip", "headband", "hairflower", "beanie"],
    "outfit":     ["tee", "hoodie", "cardigan", "blouse", "polo", "varsity", "dress", "jacket"],
    "background": ["mist", "blush", "sky", "mint", "lilac", "sun", "graphite", "gemini"],
}

# The default Selena — soft-kawaii, matching the current default mascot's vibe.
DEFAULT_AVATAR: dict[str, object] = {
    "version": CONFIG_VERSION,
    "skinTone": "warm",
    "hairStyle": "bob",
    "hairColor": "brown",
    "eyeColor": "darkBrown",
    "eyeShape": "round",
    "brows": "soft",
    "mouth": "smile",
    "blush": "soft",
    "glasses": "none",
    "accessory": "none",
    "outfit": "tee",
    "background": "lilac",
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
