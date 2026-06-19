from tools.video.kenburns import kenburns_cmd


def test_cmd_targets_resolution_and_duration():
    cmd = kenburns_cmd("in.png", "out.mp4", seconds=5, fps=30, zoom_to=1.12)
    s = " ".join(cmd)
    assert "in.png" in s and "out.mp4" in s
    assert "zoompan" in s and "1920x1080" in s
    assert cmd[0] == "ffmpeg"
    assert "150" in s   # 5s * 30fps frames
