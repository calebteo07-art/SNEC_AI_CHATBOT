"""Guard: the keep-alive cron ping must carry a timeout.

The free-tier keep-alive cron opens `/health` every 10 min to beat Render's idle
spin-down. Without a timeout a hung `/health` blocks the cron run indefinitely,
silently defeating the anti-cold-start scheme. Lock the timeout in so it can't
regress in a future render.yaml edit.
"""
from pathlib import Path

RENDER_YAML = Path(__file__).resolve().parents[1] / "render.yaml"


def test_keepalive_ping_has_timeout():
    text = RENDER_YAML.read_text(encoding="utf-8")
    # The keep-alive cron's startCommand pings /health via urllib.
    assert "urlopen(" in text, "keep-alive ping not found in render.yaml"
    ping_lines = [ln for ln in text.splitlines() if "urlopen(" in ln]
    assert ping_lines, "no urlopen ping line"
    for ln in ping_lines:
        assert "timeout=" in ln, f"keep-alive ping has no timeout: {ln.strip()}"
