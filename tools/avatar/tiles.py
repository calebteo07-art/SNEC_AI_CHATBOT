"""Studio tile registry — which option ids get static tile art, and where it lives.

A tile is ONE render of the default Selena wearing JUST that option (the axis's
other choices at their defaults), keyed to a transparent cutout like the portrait.
Colour axes render as swatches in the Studio and need no art; `none` options show
the pristine default mascot (frontend convention in aurora/avatar/tiles.ts)."""
from __future__ import annotations

from pathlib import Path

from tools.avatar.parts import AVATAR_AXES

# Anchored to the repo root via __file__ (tools/avatar/tiles.py → parents[2]),
# so the CLI tools and the paid --install path resolve the same tile tree no
# matter what cwd they run from — matching every sibling tool in tools/avatar/.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TILES_ROOT = PROJECT_ROOT / "frontend" / "public" / "avatar" / "tiles"

# The prop/shape axes — everything that isn't a colour swatch or the CSS backdrop.
TILE_AXES: list[str] = ["eyeShape", "lashes", "mouth", "glasses", "topper", "accessory", "outfit"]


def tile_ids(axis: str) -> list[str]:
    """Option ids on a tile axis that need art (everything but `none`)."""
    return [o for o in AVATAR_AXES[axis] if o != "none"]


def tile_path(axis: str, option_id: str) -> Path:
    return TILES_ROOT / axis / f"{option_id}.webp"
