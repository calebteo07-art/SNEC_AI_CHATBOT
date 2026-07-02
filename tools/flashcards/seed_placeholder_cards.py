"""One-shot: insert placeholder cards into static_cards.py for any topic that
has none yet (the FOUNDATIONS pool, plus OT gap-fill topics).

No Gemini. Idempotent — only inserts topics that are absent. Real cards replace
these later via generate_cards.generate_topic (gated paid run).

Run: python tools/flashcards/seed_placeholder_cards.py
"""
import sys
from pathlib import Path

sys.path.insert(0, ".")
from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS
from tools.flashcards.generate_cards import placeholder_cards
from tools.flashcards.static_cards import FLASHCARDS

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


def _fmt_topic(tk: str, label: str) -> str:
    by_tier = placeholder_cards(tk, label)
    lines = [f'        "{tk}": {{']
    for tier in ("easy", "medium", "hard"):
        lines.append(f'            "{tier}": [')
        for c in by_tier[tier]:
            lines.append(_fmt_card(c))
        lines.append("            ],")
    lines.append("        },")
    return "\n".join(lines) + "\n"


def _foundations_block() -> str:
    body = "".join(_fmt_topic(tk, lbl) for tk, lbl in FLASHCARD_TOPICS["FOUNDATIONS"])
    return '    "FOUNDATIONS": {\n' + body + "    },\n"


def main() -> None:
    text = STATIC.read_text(encoding="utf-8")
    changed = False

    # 1. Insert the whole FOUNDATIONS pool if absent.
    if '"FOUNDATIONS":' not in text:
        if ANCHOR not in text:
            raise SystemExit("anchor line not found; static_cards.py structure changed.")
        text = text.replace(ANCHOR, ANCHOR + _foundations_block(), 1)
        changed = True
        print("Inserted placeholder FOUNDATIONS pool.")

    # 2. Insert any per-pool topic that is missing (e.g. OT gap-fill topics).
    for pool, topics in FLASHCARD_TOPICS.items():
        pool_anchor = f'    "{pool}": {{\n'
        if pool_anchor not in text:
            continue
        for tk, label in topics:
            if tk in FLASHCARDS.get(pool, {}):
                continue
            text = text.replace(pool_anchor, pool_anchor + _fmt_topic(tk, label), 1)
            changed = True
            print(f"Inserted placeholder topic {pool}/{tk}.")

    if changed:
        STATIC.write_text(text, encoding="utf-8")
    else:
        print("Nothing to do — every topic already has cards.")


if __name__ == "__main__":
    main()
