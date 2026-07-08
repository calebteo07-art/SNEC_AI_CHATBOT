"""Task 2 of the Selena 3D-portrait plan: generate + store (paid path, wired MOCK-safe).

These tests NEVER fire a live image generation. They verify the wiring only:
- render_portrait REFUSES to run in MOCK_MODE (so tests/CI can never fake art),
- when live, it builds the config→prompt, keys the opaque chroma-green render to a
  transparent 512² webp (tools.shared.keying), and retries once if the model ignored
  the green-screen instruction before giving up,
- store_portrait uploads `<hash>.<ext>` (webp in practice) to the public selena-avatars
  bucket and returns the public URL.
The live Gemini call and the Supabase upload are monkeypatched out.
"""
import io

import pytest
from PIL import Image

from tools.avatar import portrait
from tools.kb import supabase_client


def _green_png_with_subject() -> bytes:
    """What a well-behaved flash render looks like: a subject on flat chroma green."""
    img = Image.new("RGB", (64, 64), (0, 177, 64))
    for x in range(20, 44):
        for y in range(20, 44):
            img.putpixel((x, y), (240, 200, 170))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _solid_blue_png() -> bytes:
    """A render that ignored the green-screen instruction entirely."""
    img = Image.new("RGB", (64, 64), (30, 60, 200))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def test_render_portrait_refuses_in_mock_mode(monkeypatch):
    # The default test env is MOCK_MODE; assert we never fabricate art there.
    monkeypatch.setattr(portrait, "MOCK_MODE", True)
    with pytest.raises(RuntimeError, match="MOCK_MODE"):
        portrait.render_portrait({"bodyColor": "aqua"})


def test_render_portrait_builds_prompt_and_returns_bytes(monkeypatch):
    captured = {}

    def fake_gen(prompt, model=None, **kw):
        captured["prompt"] = prompt
        captured["model"] = model
        return _green_png_with_subject()

    monkeypatch.setattr(portrait, "MOCK_MODE", False)
    monkeypatch.setattr(portrait.generate_sprites, "generate_image_bytes", fake_gen)

    out = portrait.render_portrait({"topper": "crown", "glasses": "none"})

    assert out[:4] == b"RIFF"
    p = captured["prompt"].lower()
    assert "one" in p and "eye" in p              # the invariant Iris contract is carried
    assert "crown" in p                           # a set option is reflected
    assert "glasses" not in p                     # a `none` option contributes nothing
    assert captured["model"] == "gemini-3.1-flash-image"  # flash-image (pro 504s under load)


def test_render_portrait_raises_when_no_image(monkeypatch):
    # A falsy return means generate_image_bytes ALREADY exhausted its own internal
    # retries — the outer loop must not amplify that into more paid invocations.
    calls = {"n": 0}

    def none_gen(*a, **k):
        calls["n"] += 1
        return None

    monkeypatch.setattr(portrait, "MOCK_MODE", False)
    monkeypatch.setattr(portrait.generate_sprites, "generate_image_bytes", none_gen)
    with pytest.raises(RuntimeError, match="no image bytes"):
        portrait.render_portrait({"bodyColor": "aqua"})
    assert calls["n"] == 1                                # terminal, not retried


def test_render_portrait_retries_undecodable_bytes_then_succeeds(monkeypatch):
    # Garbage bytes are a render-quality failure like a missed green screen:
    # worth exactly one more attempt, then the good render goes through keying.
    calls = {"n": 0}

    def flaky(*a, **k):
        calls["n"] += 1
        return b"NOTANIMAGE" if calls["n"] == 1 else _green_png_with_subject()

    monkeypatch.setattr(portrait, "MOCK_MODE", False)
    monkeypatch.setattr(portrait.generate_sprites, "generate_image_bytes", flaky)

    out = portrait.render_portrait({"bodyColor": "aqua"})

    assert out[:4] == b"RIFF" and out[8:12] == b"WEBP"
    assert calls["n"] == 2


def test_render_portrait_keys_to_transparent_webp(monkeypatch):
    monkeypatch.setattr(portrait, "MOCK_MODE", False)
    monkeypatch.setattr(portrait.generate_sprites, "generate_image_bytes",
                        lambda *a, **k: _green_png_with_subject())

    out = portrait.render_portrait({"topper": "crown"})

    assert out[:4] == b"RIFF" and out[8:12] == b"WEBP"   # webp container
    img = Image.open(io.BytesIO(out))
    assert img.mode == "RGBA"
    assert img.size == (512, 512)
    assert img.getpixel((0, 0))[3] == 0                   # corner keyed to alpha


def test_render_portrait_retries_then_fails_when_green_screen_ignored(monkeypatch):
    calls = {"n": 0}

    def opaque(*a, **k):
        calls["n"] += 1
        return _solid_blue_png()

    monkeypatch.setattr(portrait, "MOCK_MODE", False)
    monkeypatch.setattr(portrait.generate_sprites, "generate_image_bytes", opaque)

    with pytest.raises(RuntimeError, match="chroma"):
        portrait.render_portrait({"bodyColor": "aqua"})
    assert calls["n"] == 2                                # exactly one retry


def test_store_portrait_defaults_to_png(monkeypatch):
    seen = {}

    def fake_upload(path, data, content_type="image/png"):
        seen["path"] = path
        seen["data"] = data
        seen["ctype"] = content_type
        return f"https://cdn.example/selena-avatars/{path}"

    monkeypatch.setattr(supabase_client, "upload_avatar", fake_upload)

    url = portrait.store_portrait("abc123def456ab00", b"PNGDATA")

    assert seen["path"] == "abc123def456ab00.png"   # stored by config hash
    assert seen["data"] == b"PNGDATA"
    assert seen["ctype"] == "image/png"
    assert url.endswith("abc123def456ab00.png")


def test_store_portrait_uses_jpg_for_jpeg_bytes(monkeypatch):
    # flash-image actually returns JPEG — store it with the right extension + content-type.
    seen = {}

    def fake_upload(path, data, content_type="image/png"):
        seen["path"] = path
        seen["ctype"] = content_type
        return f"https://cdn.example/selena-avatars/{path}"

    monkeypatch.setattr(supabase_client, "upload_avatar", fake_upload)

    jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 32
    url = portrait.store_portrait("deadbeefdeadbeef", jpeg)

    assert seen["path"] == "deadbeefdeadbeef.jpg"
    assert seen["ctype"] == "image/jpeg"
    assert url.endswith(".jpg")


def test_upload_avatar_targets_public_selena_avatars_bucket(monkeypatch):
    calls = {}

    class FakeBucket:
        def upload(self, path, file, file_options):
            calls["upload"] = (path, file, file_options)

        def get_public_url(self, path):
            return f"https://cdn/{path}"

    class FakeStorage:
        def from_(self, bucket):
            calls.setdefault("bucket", bucket)
            return FakeBucket()

    class FakeClient:
        storage = FakeStorage()

    monkeypatch.setattr(supabase_client, "get_client", lambda: FakeClient())

    url = supabase_client.upload_avatar("h.jpg", b"X", content_type="image/jpeg")

    assert calls["bucket"] == "selena-avatars"
    assert calls["upload"][0] == "h.jpg"
    assert calls["upload"][2]["content-type"] == "image/jpeg"
    assert url == "https://cdn/h.jpg"
