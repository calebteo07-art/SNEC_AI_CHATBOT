"""Veo greeting-loop config — prompt contract + reference (no paid calls)."""
from tools.media import greeting_loop


def test_prompt_is_seamless_loop_and_bans_text():
    p = greeting_loop.PROMPT.lower()
    assert "loop" in p and "identical to the first" in p
    assert "no text" in p
    assert "blink" in p and "wave" in p


def test_reference_image_is_iris():
    assert greeting_loop.IMAGE_REF.name == "iris.png"
    assert "brand" in greeting_loop.IMAGE_REF.parts


def test_candidate_models_are_veo():
    assert greeting_loop.CANDIDATE_MODELS
    assert all("veo" in m for m in greeting_loop.CANDIDATE_MODELS)
