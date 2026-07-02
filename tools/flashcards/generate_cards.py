"""Structural validator for hand-authored flashcard MCQs (WAT tool).

Cards are hand-authored from *silly* (no Gemini). This module is the one
structural gate used before pasting cards into static_cards.py — it mirrors the
integrity contract in tests/flashcards/test_static_cards_integrity.py.
"""
from __future__ import annotations

# The exact card shape stored in static_cards.py.
CARD_KEYS = ("stem", "options", "correct", "qtype", "kind", "explanation", "reasoning_eligible")


def validate_cards(cards: list[dict]) -> list[dict]:
    """Drop any card that is not a well-formed MCQ. Returns cards trimmed to
    CARD_KEYS. Mirrors test_static_cards_integrity: >=2-option MCQ, valid qtype,
    kind in {theory, practical, situational}, non-empty stem/explanation, correct
    indices in range and consistent with qtype."""
    out: list[dict] = []
    for c in cards or []:
        try:
            if not (isinstance(c.get("stem"), str) and c["stem"].strip()):
                continue
            opts = c.get("options")
            if not (isinstance(opts, list) and len(opts) >= 2):
                continue
            if c.get("qtype") not in ("single", "multi"):
                continue
            if c.get("kind") not in ("theory", "practical", "situational"):
                continue
            if not (isinstance(c.get("explanation"), str) and c["explanation"].strip()):
                continue
            corr = c.get("correct")
            if not (isinstance(corr, list) and corr and all(
                    isinstance(i, int) and 0 <= i < len(opts) for i in corr)):
                continue
            if c["qtype"] == "single" and len(corr) != 1:
                continue
            if c["qtype"] == "multi" and len(corr) < 2:
                continue
            out.append({k: c[k] for k in CARD_KEYS if k in c})
        except Exception:
            continue
    return out
