"""Task 1 of the Selena 3D-portrait plan: the pure deterministic core.

config_hash + config_to_prompt must be pure and derived from the parts registry.
v2: the portrait is a transparent cutout keyed from a flat chroma-green render — the
`background` axis is a CSS backdrop applied client-side, so it never reaches the prompt
or the cache hash (revised back to the transparent-over-CSS design, 2026-07-08).
No network / API here.
"""
from tools.avatar.portrait import config_hash, config_to_prompt, PORTRAIT_AXES


def test_hash_is_deterministic():
    cfg = {"bodyColor": "aqua", "mouth": "grin"}
    assert config_hash(cfg) == config_hash(cfg)


def test_hash_is_order_and_extra_key_invariant():
    a = config_hash({"bodyColor": "aqua", "mouth": "grin"})
    b = config_hash({"mouth": "grin", "bodyColor": "aqua", "version": 2, "unknown": "x"})
    assert a == b


def test_hash_is_background_invariant():
    # v2 portraits are transparent cutouts — the backdrop is CSS, not pixels.
    base = {"bodyColor": "aqua", "irisColor": "green"}
    assert config_hash({**base, "background": "mist"}) == config_hash({**base, "background": "galaxy"})


def test_hash_changes_when_a_character_axis_changes():
    assert config_hash({"bodyColor": "aqua"}) != config_hash({"bodyColor": "coral"})


def test_defaults_fill_so_partial_equals_explicit():
    from tools.avatar.parts import DEFAULT_AVATAR
    partial = {"topper": "crown"}
    explicit = {k: DEFAULT_AVATAR[k] for k in PORTRAIT_AXES}
    explicit["topper"] = "crown"
    assert config_hash(partial) == config_hash(explicit)


def test_background_not_in_portrait_axes():
    assert "background" not in PORTRAIT_AXES
    assert "bodyColor" in PORTRAIT_AXES and "topper" in PORTRAIT_AXES


def test_hash_is_salted_v2():
    # The v2 salt must cache-bust every pre-existing opaque portrait.
    import hashlib, json
    from tools.avatar.parts import DEFAULT_AVATAR
    norm = {k: DEFAULT_AVATAR[k] for k in PORTRAIT_AXES}
    unsalted = hashlib.sha256(
        json.dumps(norm, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]
    assert config_hash({}) != unsalted


def test_prompt_demands_flat_chroma_green_background():
    p = config_to_prompt({"background": "galaxy"}).lower()
    assert "#00b140" in p
    assert "galaxy" not in p          # background axis no longer reaches the prompt


def test_prompt_always_carries_the_iris_contract():
    p = config_to_prompt({}).lower()
    assert "one" in p                # one-eyed mascot
    assert "eye" in p                # the single big eye is the defining feature
    assert "checkerboard" in p       # explicit negative: never paint the transparency checkerboard


def test_prompt_reflects_set_options_and_skips_none():
    p = config_to_prompt({"topper": "crown", "glasses": "none"})
    assert "crown" in p.lower()
    assert "glasses" not in p.lower()  # a none option contributes nothing


def test_prompt_includes_galaxy_iris_when_chosen():
    p = config_to_prompt({"irisColor": "galaxy"}).lower()
    assert "galaxy" in p


def test_contract_pushes_eye_catching_collectible_energy():
    # Every render should read as a premium, over-the-top collectible — not a flat sticker.
    p = config_to_prompt({}).lower()
    assert "collectible" in p
    assert "vibrant" in p
    assert "eye-catching" in p


def test_galaxy_iris_phrasing_is_over_the_top():
    # Marquee options get ridiculous, evocative phrasing (galaxy = nebula + stars, not "galaxy iris").
    p = config_to_prompt({"irisColor": "galaxy"}).lower()
    assert "nebula" in p
