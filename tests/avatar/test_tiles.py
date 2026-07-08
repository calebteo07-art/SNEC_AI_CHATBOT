"""Tile registry + mandate: every non-colour, non-none option id ships a static
tile art file (placeholder first, paid art later) — same style of gate as the
50-cards-per-topic mandate. Colour axes render as swatches, not tiles."""
from pathlib import Path

from tools.avatar.parts import AVATAR_AXES
from tools.avatar.portrait import phrase_for
from tools.avatar.tiles import TILE_AXES, tile_ids, tile_path

TILES_ROOT = Path("frontend/public/avatar/tiles")


def test_tile_axes_are_the_prop_axes():
    assert TILE_AXES == ["eyeShape", "lashes", "mouth", "glasses", "topper", "accessory", "outfit"]


def test_tile_ids_skip_none():
    assert "none" not in tile_ids("topper")
    assert "crown" in tile_ids("topper")


def test_every_tile_id_has_a_committed_file():
    missing = [
        f"{axis}/{oid}" for axis in TILE_AXES for oid in tile_ids(axis)
        if not (TILES_ROOT / axis / f"{oid}.webp").exists()
    ]
    assert not missing, f"tile art missing (run tools/avatar/make_tile_placeholders.py): {missing}"


def test_tile_path_convention_matches_frontend():
    assert tile_path("topper", "crown") == TILES_ROOT / "topper" / "crown.webp"


def test_phrase_for_covers_every_tile_id():
    missing = [f"{a}/{o}" for a in TILE_AXES for o in tile_ids(a) if not phrase_for(a, o)]
    assert not missing
