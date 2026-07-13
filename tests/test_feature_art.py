"""Feature-scene registry — prompt contract + estimate (no paid calls)."""
from tools.brand import feature_art


def test_three_scenes_registered():
    assert set(feature_art.SCENES) == {"tutor", "vp", "flash"}


def test_prompt_anchors_to_reference_and_bans_text():
    p = feature_art.prompt(feature_art.SCENES["tutor"]).lower()
    assert "reference image" in p          # reference=True anchor language
    assert "no text" in p                  # legibility / clean art
    assert "full-bleed" in p               # baked whole card (bg + hero), not a keyed cut-out
    assert "socratic" in p                 # tutor action line present


def test_each_scene_prompt_carries_its_action_line():
    vp = feature_art.prompt(feature_art.SCENES["vp"]).lower()
    assert "ophthalmoscope" in vp
    assert "blue" in vp and "scrubs" in vp  # clinician wears blue scrubs, not a white coat
    assert "flashcards" in feature_art.prompt(feature_art.SCENES["flash"]).lower()


def test_estimate_lists_all_scenes_without_calls():
    rows = feature_art.build_estimate()
    assert len(rows) == 3
    assert all(isinstance(pid, str) and isinstance(text, str) and text for pid, text in rows)
