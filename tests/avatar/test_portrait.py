"""Task 1 of the Selena 3D-portrait plan: the pure deterministic core.

config_hash + config_to_prompt must be pure and derived from the parts registry.
The portrait bakes its OWN background (flash-image can't emit true alpha), so `background`
IS part of the look — it affects both the hash and the prompt (revised from the original
transparent-over-CSS-backdrop design, 2026-07-06). No network / API here.
"""
from tools.avatar.portrait import config_hash, config_to_prompt, PORTRAIT_AXES


def test_hash_is_deterministic():
    cfg = {"bodyColor": "aqua", "mouth": "grin"}
    assert config_hash(cfg) == config_hash(cfg)


def test_hash_is_order_and_extra_key_invariant():
    a = config_hash({"bodyColor": "aqua", "mouth": "grin"})
    b = config_hash({"mouth": "grin", "bodyColor": "aqua", "version": 2, "unknown": "x"})
    assert a == b


def test_hash_changes_with_background():
    # background is now baked into the image, so it IS part of the cache key.
    base = {"bodyColor": "aqua", "irisColor": "green"}
    assert config_hash({**base, "background": "mist"}) != config_hash({**base, "background": "galaxy"})


def test_hash_changes_when_a_character_axis_changes():
    assert config_hash({"bodyColor": "aqua"}) != config_hash({"bodyColor": "coral"})


def test_defaults_fill_so_partial_equals_explicit():
    from tools.avatar.parts import DEFAULT_AVATAR
    partial = {"topper": "crown"}
    explicit = {k: DEFAULT_AVATAR[k] for k in PORTRAIT_AXES}
    explicit["topper"] = "crown"
    assert config_hash(partial) == config_hash(explicit)


def test_background_in_portrait_axes():
    assert "background" in PORTRAIT_AXES
    assert "bodyColor" in PORTRAIT_AXES and "topper" in PORTRAIT_AXES


def test_prompt_always_carries_the_iris_contract():
    p = config_to_prompt({}).lower()
    assert "one" in p                # one-eyed mascot
    assert "eye" in p                # the single big eye is the defining feature
    assert "checkerboard" in p       # explicit negative: never paint the transparency checkerboard


def test_prompt_reflects_set_options_and_skips_none():
    p = config_to_prompt({"topper": "crown", "glasses": "none"})
    assert "crown" in p.lower()
    assert "glasses" not in p.lower()  # a none option contributes nothing


def test_prompt_includes_background():
    # background is now baked into the render, so it must appear in the prompt.
    p = config_to_prompt({"background": "galaxy", "irisColor": "blue"}).lower()
    assert "galaxy" in p and "background" in p


def test_prompt_includes_galaxy_iris_when_chosen():
    p = config_to_prompt({"irisColor": "galaxy"}).lower()
    assert "galaxy" in p
