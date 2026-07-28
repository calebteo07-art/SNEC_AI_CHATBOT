"""Portrait-tile library — the catalog in tools/avatar/parts.py must match the committed art
on disk, and validate_config must fail closed on unknown tiles. Backs the Eyecon Studio, which
is a fixed preset library: a student picks one pre-rendered tile as avatar_config["portrait"].
"""
from pathlib import Path

import pytest

from tools.avatar.parts import (
    PORTRAIT_TILES,
    InvalidAvatarConfig,
    is_valid_portrait,
    validate_config,
)

TILES_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "avatar" / "tiles"


def test_catalog_matches_committed_files():
    """Every PORTRAIT_TILES id maps to a real <category>/<id>.webp, and vice-versa — so a
    library pick can never point at missing art."""
    on_disk = {
        d.name: sorted(f.stem for f in d.glob("*.webp"))
        for d in sorted(TILES_DIR.iterdir())
        if d.is_dir() and any(d.glob("*.webp"))
    }
    catalog = {cat: sorted(ids) for cat, ids in PORTRAIT_TILES.items()}
    assert catalog == on_disk


def test_retired_looks_are_gone():
    """The 2026-07-28 roster cull (user directive). Retired picks must not creep back in via a
    regenerated catalog — a stale saved ref falls back to the default mascot, which is fine,
    but re-listing a look we deleted the art for would render a broken tile."""
    assert "glasses" not in PORTRAIT_TILES              # the whole spectacles category
    assert "laugh" not in PORTRAIT_TILES["mouth"]
    assert "ooh" not in PORTRAIT_TILES["mouth"]
    assert set(PORTRAIT_TILES["lashes"]) == {"butterfly", "feathery"}


def test_sparkles_renamed_so_labels_are_distinguishable():
    """`accessory/sparkles` and `eyeShape/sparkle` humanized to "Sparkles"/"Sparkle" — two
    different characters a student could not tell apart in the roster. The accessory (floating
    glitter, not a sparkly iris) is now `fairyDust` → "Fairy dust"."""
    assert "sparkles" not in PORTRAIT_TILES["accessory"]
    assert "fairyDust" in PORTRAIT_TILES["accessory"]
    assert "sparkle" in PORTRAIT_TILES["eyeShape"]      # the sparkly-iris look keeps the name


def test_is_valid_portrait_fails_closed():
    assert is_valid_portrait("outfit/cape")
    assert is_valid_portrait("accessory/fairyDust")
    assert not is_valid_portrait("outfit/nope")        # unknown id
    assert not is_valid_portrait("glasses/heart")      # retired category
    assert not is_valid_portrait("unknownCat/round")   # unknown category
    assert not is_valid_portrait("outfit")             # no id
    assert not is_valid_portrait("a/b/c")              # extra slash
    assert not is_valid_portrait("../etc/passwd")      # path traversal
    assert not is_valid_portrait(123)                  # non-string


def test_validate_config_keeps_valid_portrait():
    clean = validate_config({"portrait": "topper/crown"})
    assert clean["portrait"] == "topper/crown"
    assert clean["bodyColor"] == "peach"  # axes still filled from defaults


def test_validate_config_rejects_bad_portrait():
    with pytest.raises(InvalidAvatarConfig):
        validate_config({"portrait": "outfit/not-real"})


def test_validate_config_omits_portrait_when_absent():
    clean = validate_config({"bodyColor": "peach"})
    assert "portrait" not in clean
