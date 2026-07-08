"""Every shipped option id gets a bespoke over-the-top prompt phrase — no id may
fall through to the generic _humanize fallback (flat phrasing = flat art)."""
from tools.avatar.parts import AVATAR_AXES
from tools.avatar.portrait import PROMPT_MAPS


def test_every_prompt_axis_id_has_a_bespoke_phrase():
    missing = [
        f"{axis}/{oid}"
        for axis, mapping in PROMPT_MAPS.items()
        for oid in AVATAR_AXES[axis]
        if oid != "none" and oid not in mapping
    ]
    assert not missing, f"add bespoke phrases in portrait.py for: {missing}"


def test_expansion_landed():
    assert "trafficCone" in AVATAR_AXES["topper"]
    assert "dinoOnesie" in AVATAR_AXES["outfit"]
    assert "bobaTea" in AVATAR_AXES["accessory"]
    assert "dealWithIt" in AVATAR_AXES["glasses"]
    assert "aurora" in AVATAR_AXES["background"]
