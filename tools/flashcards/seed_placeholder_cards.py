"""One-shot: insert a placeholder FOUNDATIONS pool into static_cards.py.

No Gemini. Idempotent — refuses if a FOUNDATIONS pool already exists. Real cards
replace these later via generate_cards.generate_topic (gated paid run).

Run: python tools/flashcards/seed_placeholder_cards.py
"""
import sys
from pathlib import Path

sys.path.insert(0, ".")
from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS
from tools.flashcards.generate_cards import placeholder_cards

STATIC = Path("tools/flashcards/static_cards.py")
ANCHOR = 'FLASHCARDS: dict[str, dict[str, dict[str, list[dict]]]] = {\n'


def _fmt_card(c: dict) -> str:
    return (
        "                {"
        f'"stem": {c["stem"]!r}, "options": {c["options"]!r}, '
        f'"correct": {c["correct"]!r}, "qtype": {c["qtype"]!r}, '
        f'"kind": {c["kind"]!r}, "explanation": {c["explanation"]!r}, '
        f'"reasoning_eligible": {c["reasoning_eligible"]!r}, '
        f'"placeholder": {c["placeholder"]!r}}},'
    )


def _fmt_block() -> str:
    lines = ['    "FOUNDATIONS": {']
    for tk, label in FLASHCARD_TOPICS["FOUNDATIONS"]:
        by_tier = placeholder_cards(tk, label)
        lines.append(f'        "{tk}": {{')
        for tier in ("easy", "medium", "hard"):
            lines.append(f'            "{tier}": [')
            for c in by_tier[tier]:
                lines.append(_fmt_card(c))
            lines.append("            ],")
        lines.append("        },")
    lines.append("    },")
    return "\n".join(lines) + "\n"


def main() -> None:
    text = STATIC.read_text(encoding="utf-8")
    if '"FOUNDATIONS":' in text:
        print("FOUNDATIONS pool already present — nothing to do.")
        return
    if ANCHOR not in text:
        raise SystemExit("anchor line not found; static_cards.py structure changed.")
    text = text.replace(ANCHOR, ANCHOR + _fmt_block(), 1)
    STATIC.write_text(text, encoding="utf-8")
    print("Inserted placeholder FOUNDATIONS pool.")


if __name__ == "__main__":
    main()
