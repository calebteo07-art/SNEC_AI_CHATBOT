from PIL import Image
from tools.video.captions import render_caption

def test_caption_png_is_1080p_rgba(tmp_path):
    out = tmp_path / "cap.png"
    render_caption("Ask anything — grounded, cited answers.", str(out), label="AI Tutor")
    im = Image.open(out)
    assert im.size == (1920, 1080)
    assert im.mode == "RGBA"
