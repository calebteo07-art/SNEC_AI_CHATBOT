"""The virtual patient must talk like a patient, not like a case file.

Branda (2026-07-29): "The patient responses do not feel very realistic. In actual practice,
patients would typically provide shorter, less structured answers rather than a complete
history all at once." The old prompt forbade volunteering but never constrained LENGTH or
REGISTER, and max_tokens=1536 left room for an essay.
"""
import pathlib
import re

from tools.api.shared import PATIENT_SYSTEM


def test_prompt_caps_the_answer_length():
    assert re.search(r"one or two short sentences", PATIENT_SYSTEM, re.I)


def test_prompt_forbids_delivering_a_structured_history():
    assert re.search(r"never .*(whole|full|complete|structured) (story|history)", PATIENT_SYSTEM, re.I)


def test_prompt_asks_for_lay_vagueness():
    # A real patient says "maybe Tuesday?", not "3 days of progressive blurring".
    assert re.search(r"vague|unsure|approximate", PATIENT_SYSTEM, re.I)


def test_prompt_still_forbids_revealing_the_diagnosis():
    # Pre-existing guarantee — brevity edits must not drop it.
    assert "Do NOT reveal the diagnosis" in PATIENT_SYSTEM


def test_prompt_still_answers_identity_checks_exactly():
    # Confirming particulars is part of the OSCE encounter; brevity must not break it.
    assert "EXACTLY as recorded" in PATIENT_SYSTEM


def test_chat_max_tokens_is_a_structural_backstop():
    """Prompt drift alone must not be able to bring the essay back."""
    src = pathlib.Path("tools/api/routers/cases.py").read_text(encoding="utf-8")
    chat = src.split("def case_chat(")[1].split("\ndef ")[0]
    caps = [int(n) for n in re.findall(r"max_tokens=(\d+)", chat)]
    assert caps, "case_chat should declare max_tokens"
    assert max(caps) <= 320, f"case chat max_tokens too high: {caps}"
