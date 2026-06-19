from tools.media.generate_veo_clip import build_config, build_kwargs, MODEL

def test_config_defaults_landscape_1080p_8s():
    cfg = build_config(seconds="8", resolution="1080p")
    assert cfg.aspect_ratio == "16:9"
    assert cfg.resolution == "1080p"
    assert str(cfg.duration_seconds) == "8"

def test_kwargs_text_to_video_has_no_image():
    kw = build_kwargs("a calm iris", image_path=None, seconds="8", resolution="1080p")
    assert kw["model"] == MODEL
    assert kw["prompt"] == "a calm iris"
    assert "image" not in kw

def test_kwargs_image_to_video_attaches_image(tmp_path):
    p = tmp_path / "seed.png"; p.write_bytes(b"\x89PNG\r\n\x1a\n012345")
    kw = build_kwargs("animate this", image_path=str(p), seconds="8", resolution="1080p")
    assert "image" in kw and kw["image"].mime_type == "image/png"
