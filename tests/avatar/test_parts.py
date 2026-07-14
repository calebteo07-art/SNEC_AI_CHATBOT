from tools.avatar.parts import AVATAR_AXES, DEFAULT_AVATAR, validate_config

REMOVED = {"blush", "lashes", "mouth", "glasses"}

def test_removed_axes_absent_from_registry():
    for axis in REMOVED:
        assert axis not in AVATAR_AXES
        assert axis not in DEFAULT_AVATAR

def test_seven_axes_remain():
    assert set(AVATAR_AXES) == {
        "bodyColor", "irisColor", "eyeShape", "topper", "accessory", "outfit", "background"
    }

def test_validate_config_drops_removed_axes():
    # A legacy stored config still carrying the removed keys validates and drops them.
    legacy = {"version": 2, "bodyColor": "peach", "irisColor": "blue", "eyeShape": "round",
              "topper": "crown", "accessory": "none", "outfit": "labcoat", "background": "mist",
              "blush": "rose", "lashes": "glam", "mouth": "grin", "glasses": "round"}
    clean = validate_config(legacy)
    assert set(clean) == {"version", "bodyColor", "irisColor", "eyeShape",
                          "topper", "accessory", "outfit", "background"}
    assert clean["topper"] == "crown" and clean["outfit"] == "labcoat"
