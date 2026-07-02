"""KB-grounded flashcard MCQ generator (WAT tool).

For a topic: retrieve *silly* source chunks (tools.kb.search), ask Gemini for
tiered MCQs grounded ONLY in that text (strict JSON schema), validate, and emit
Python-dict blocks ready to paste into static_cards.py.

Placeholders-first: `placeholder_cards()` wires the full pipeline with zero
Gemini calls; `generate_topic()` is the deferred live/paid path that replaces
placeholders — run only with an explicit user go-ahead. Tests run in MOCK_MODE.
"""
from __future__ import annotations

import json

# The exact card shape stored in static_cards.py (mirrors test_static_cards_integrity).
CARD_KEYS = ("stem", "options", "correct", "qtype", "kind", "explanation", "reasoning_eligible")

CARD_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "stem": {"type": "string"},
            "options": {"type": "array", "items": {"type": "string"}},
            "correct": {"type": "array", "items": {"type": "integer"}},
            "qtype": {"type": "string", "enum": ["single", "multi"]},
            "kind": {"type": "string", "enum": ["theory", "practical"]},
            "explanation": {"type": "string"},
            "reasoning_eligible": {"type": "boolean"},
        },
        "required": list(CARD_KEYS),
    },
}


def build_prompt(topic_key: str, label: str, source_text: str, tier: str, n: int) -> str:
    """Instruction that forces grounding in the provided SOURCE only."""
    return (
        f"You are writing {n} '{tier}'-difficulty exam MCQs for the topic "
        f"'{label}' for SNEC allied-health students (OA/OT/PSA). Use ONLY facts "
        f"grounded in the SOURCE below — never invent facts, drugs, doses, or "
        f"anatomy. Each MCQ: exactly 4 options; qtype 'single' (one correct) or "
        f"'multi' (>=2 correct); kind 'theory' or 'practical'; a one-sentence "
        f"model-answer explanation. Return a JSON array of {n} objects with keys "
        f"{list(CARD_KEYS)}.\n\nSOURCE:\n{source_text}"
    )


def validate_cards(cards: list[dict]) -> list[dict]:
    """Drop any card that is not a well-formed MCQ. Returns cards trimmed to
    CARD_KEYS (mirrors the integrity contract in test_static_cards_integrity)."""
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


def placeholder_cards(topic_key: str, label: str, per_tier: int = 4) -> dict[str, list[dict]]:
    """Structurally-valid, clearly-marked stub cards so the pipeline is testable
    WITHOUT any Gemini call. Real cards replace these via generate_topic().
    Stems are unique (topic+tier+index) to satisfy the no-duplicate-stem guards."""
    out: dict[str, list[dict]] = {}
    for tier in ("easy", "medium", "hard"):
        cards: list[dict] = []
        for i in range(1, per_tier + 1):
            cards.append({
                "stem": f"[PLACEHOLDER] {label} — {tier} question {i} "
                        f"(pending KB-grounded generation)",
                "options": ["Placeholder option A", "Placeholder option B",
                            "Placeholder option C", "Placeholder option D"],
                "correct": [0],
                "qtype": "single",
                "kind": "theory",
                "explanation": "[PLACEHOLDER — to be generated from silly.]",
                "reasoning_eligible": False,
                "placeholder": True,
            })
        out[tier] = cards
    return out


def generate_topic(topic_key: str, label: str, per_tier: int = 7) -> dict[str, list[dict]]:
    """DEFERRED live/paid path: retrieve chunks + call Gemini per tier. Returns
    {tier: [validated cards]}. Requires GEMINI_API_KEY (no-op in MOCK_MODE)."""
    from tools.kb.search import search, format_context
    from tools.shared.gemini_client import ask

    chunks = search(label, top_k=8)
    source = format_context(chunks)
    result: dict[str, list[dict]] = {}
    for tier in ("easy", "medium", "hard"):
        raw = ask(
            system_prompt="You write grounded medical exam MCQs as strict JSON.",
            messages=[{"role": "user",
                       "content": build_prompt(topic_key, label, source, tier, per_tier)}],
            feature="flashcard_generate",
            json_mode=True,
            response_json_schema=CARD_SCHEMA,
        )
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            parsed = []
        cards = parsed if isinstance(parsed, list) else parsed.get("cards", [])
        result[tier] = validate_cards(cards)
    return result


def emit_python_block(topic_key: str, by_tier: dict[str, list[dict]]) -> str:
    """Print a `"topic_key": {tier: [...]}` block as valid PYTHON (repr, so
    booleans stay True/False) for pasting into static_cards.py."""
    return f'        "{topic_key}": ' + repr(by_tier) + ","


if __name__ == "__main__":  # manual, gated run
    import sys
    tk, lbl = sys.argv[1], sys.argv[2]
    print(emit_python_block(tk, generate_topic(tk, lbl)))
