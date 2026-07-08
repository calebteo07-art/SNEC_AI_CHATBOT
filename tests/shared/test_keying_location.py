"""Keying now lives in tools/shared — it runs in the prod portrait path, not just
asset builds. BG_KEY is canonical here so portrait + brand prompts can't drift."""
from tools.shared.keying import BG_KEY, despill_green, key_out, normalize_512


def test_bg_key_is_the_chroma_green():
    assert BG_KEY == "#00B140"


def test_functions_are_importable():
    assert callable(key_out) and callable(despill_green) and callable(normalize_512)
