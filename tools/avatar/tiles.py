"""Studio tile registry — which option ids get static tile art, and where it lives.

A tile is ONE render of the default Selena wearing JUST that option (the axis's
other choices at their defaults), keyed to a transparent cutout like the portrait.
Colour axes render as swatches in the Studio and need no art; `none` options show
the pristine default mascot (frontend convention in aurora/avatar/tiles.ts)."""
from __future__ import annotations

from pathlib import Path

from tools.avatar.parts import AVATAR_AXES

# Relative to the project root — every entry point here (pytest, the CLI tools,
# the harness) runs with the repo root as cwd, and keeping this relative (rather
# than resolved via __file__) makes it compare equal to the frontend-convention
# path the tests and other tools build the same way.
TILES_ROOT = Path("frontend") / "public" / "avatar" / "tiles"

# The prop/shape axes — everything that isn't a colour swatch or the CSS backdrop.
TILE_AXES: list[str] = ["eyeShape", "lashes", "mouth", "glasses", "topper", "accessory", "outfit"]


def tile_ids(axis: str) -> list[str]:
    """Option ids on a tile axis that need art (everything but `none`)."""
    return [o for o in AVATAR_AXES[axis] if o != "none"]


def tile_path(axis: str, option_id: str) -> Path:
    return TILES_ROOT / axis / f"{option_id}.webp"
