"""Task 1 of the Selena 3D-portrait plan: the pure deterministic core.

config_hash + config_to_prompt must be pure and derived from the parts registry.
The portrait is a TRANSPARENT character, so `background` is a CSS backdrop, NOT part
of the character — it must not affect the hash or the prompt (that's the cache-saving
optimization). No network / API here.
"""
from tools.avatar.portrait import config_hash, config_to_prompt, PORTRAIT_AXES


def test_hash_is_deterministic():
    cfg = {"bodyColor": "aqua", "mouth": "grin"}
    assert config_hash(cfg) == config_hash(cfg)


def test_hash_is_order_and_extra_key_invariant():
    a = config_hash({"bodyColor": "aqua", "mouth": "grin"})
    b = config_hash({"mouth": "grin", "bodyColor": "aqua", "version": 2, "unknown": "x"})
    assert a == b


def test_hash_ignores_background():
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


def test_prompt_always_carries_the_iris_contract():
    p = config_to_prompt({}).lower()
    assert "one" in p                # one-eyed mascot
    assert "transparent" in p        # transparent/alpha background


def test_prompt_reflects_set_options_and_skips_none():
    p = config_to_prompt({"topper": "crown", "glasses": "none"})
    assert "crown" in p.lower()
    assert "glasses" not in p.lower()  # a none option contributes nothing


def test_prompt_excludes_background():
    # background galaxy must not leak the word "galaxy" when the iris isn't galaxy
    p = config_to_prompt({"background": "galaxy", "irisColor": "blue"}).lower()
    assert "galaxy" not in p


def test_prompt_includes_galaxy_iris_when_chosen():
    p = config_to_prompt({"irisColor": "galaxy"}).lower()
    assert "galaxy" in p
