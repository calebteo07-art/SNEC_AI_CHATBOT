"""Veo greeting-loop config — prompt contract + references (no paid calls).

The clip is generated in TWO stages (cheap still, then Veo from it), and each stage's prompt
carries a promise the frontend depends on. `.hm-greet` lays its copy over the top of the
frame and anchors the crop to the right; if the frame prompt stops reserving the top half or
stops pinning the crew bottom-right, the CSS is silently wrong and only a screenshot would
catch it. These assert the promises, not the wording.
"""
from tools.media import greeting_loop


def test_prompt_is_seamless_loop_and_bans_text():
    p = greeting_loop.PROMPT.lower()
    assert "loop" in p and "identical to the first" in p
    assert "no text" in p
    assert "blink" in p and "wave" in p


def test_motion_prompt_keeps_the_camera_still():
    """A pan or a zoom moves the crew out of the region the CSS crops to."""
    p = greeting_loop.PROMPT.lower()
    assert "no camera movement" in p
    for banned in ("zoom", "pan", "camera movement"):
        assert banned in greeting_loop.NEGATIVE_PROMPT.lower()


def test_reference_image_is_iris():
    assert greeting_loop.IMAGE_REF.name == "iris.png"
    assert "brand" in greeting_loop.IMAGE_REF.parts


def test_identity_refs_lead_with_iris_and_exist():
    """iris.png is the rest frame and must come first; the poses are the other angles."""
    assert greeting_loop.IMAGE_REFS[0] == greeting_loop.IMAGE_REF
    assert len(greeting_loop.IMAGE_REFS) > 1
    for p in greeting_loop.IMAGE_REFS:
        assert p.exists(), f"missing identity reference {p}"


def test_frame_prompt_reserves_the_top_and_pins_the_crew():
    """The composition IS the layout — see `.hm-greet` / `.hm-greetvid` in home.css."""
    f = greeting_loop.FRAME_PROMPT.lower()
    assert "top half" in f and "bottom-right" in f
    assert "four" in f
    # the character brief has to survive into the frame prompt or the crew drifts off-model
    assert "one huge glossy blue iris" in f
    assert "no text" in f


def test_candidate_models_are_veo():
    assert greeting_loop.CANDIDATE_MODELS
    assert all("veo" in m for m in greeting_loop.CANDIDATE_MODELS)


def test_image_model_is_a_gemini_image_model():
    assert "image" in greeting_loop.IMAGE_MODEL
