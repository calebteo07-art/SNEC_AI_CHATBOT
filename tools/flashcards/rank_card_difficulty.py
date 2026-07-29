"""One-time offline pass: rank each topic's cards easiest -> hardest.

Writes `card_levels.json`, the permutation `card_levels.py` slices into the 5
curated decks. Runtime never calls this — it reads the generated file.

The authored easy/medium/hard tier is deliberately NOT shown to the model: with
only 3 tiers of 17/17/16 the boundaries can't produce 5 coherent decks, so the
model judges each card fresh on a continuous scale and the tier is used only to
break ties. That is the whole point of the pass.

Usage:
    python -m tools.flashcards.rank_card_difficulty --topic glaucoma   # preview one
    python -m tools.flashcards.rank_card_difficulty --all              # the full bank
    python -m tools.flashcards.rank_card_difficulty --all --dry-run    # keyless, no spend
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from tools.flashcards.card_levels import (
    DECK_COUNT, DECK_SIZE, _RANKINGS_PATH, deck_tier_means, ramp_ok,
)
from tools.flashcards.flashcard_sets import topics_for
from tools.flashcards.static_cards import get_topic_cards
from tools.shared.gemini_client import FLASH_MODEL, MOCK_MODE, ask

_TIER_RANK = {"easy": 0, "medium": 1, "hard": 2}

_SYSTEM = """You design assessments for allied-health trainees at the Singapore National Eye \
Centre — Ophthalmic Assistants, Ophthalmic Technicians and Patient Service Associates.

Sort these multiple-choice questions into 5 difficulty levels for a JUNIOR trainee.

This is a FORCED RANKING, not a rating. Level 1 holds the 10 easiest questions and \
level 5 the 10 hardest, and you must assign EXACTLY 10 questions to each of the 5 \
levels. When two questions feel similar you must still decide which is harder — \
refusing to separate them is the one thing you cannot do.

Harder means the question demands more of the trainee:
- discriminating between conditions or techniques that look alike
- multi-step clinical reasoning, or applying a rule to an unusual case
- exact numeric thresholds, drug names, gradings or classifications
- judgement under ambiguity, safety trade-offs, escalation decisions
- knowledge a trainee meets late in training, or rarely

Easier means a single, common, frequently-encountered fact recalled directly.

Judge only the cognitive demand. Ignore how long the question or its options are, \
and ignore where it appears in the list."""

_SCHEMA = {
    "type": "object",
    "properties": {
        "ratings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "level": {"type": "integer"},
                },
                "required": ["id", "level"],
            },
        }
    },
    "required": ["ratings"],
}


def _prompt(cards: list[dict]) -> str:
    per = len(cards) // DECK_COUNT
    lines = [f"Sort all {len(cards)} questions into levels 1-{DECK_COUNT}, "
             f"exactly {per} questions per level. Return one level per id.", ""]
    for i, c in enumerate(cards):
        answers = ", ".join(c["options"][j] for j in c["correct"])
        lines.append(f"[{i}] {c['stem']}")
        lines.append(f"     options: {' | '.join(c['options'])}")
        lines.append(f"     answer: {answers}")
    return "\n".join(lines)


def rank_topic(role: str, topic_key: str) -> tuple[list[int], dict[int, int]]:
    """(order easiest->hardest, {index: score}) for one topic.

    Any card the model skips falls back to its authored tier midpoint, so a
    partial response degrades instead of dropping cards from the ladder."""
    cards = get_topic_cards(role, topic_key)
    raw = ask(
        _SYSTEM,
        [{"role": "user", "content": _prompt(cards)}],
        feature="card_ranking",
        model=FLASH_MODEL,
        # A forced ranking over 50 items makes the model reason before answering,
        # and those tokens count against the output cap — 8192 truncates mid-JSON.
        max_tokens=32768,
        json_mode=True,
        response_json_schema=_SCHEMA,
    )
    scores: dict[int, int] = {}
    try:
        for r in (json.loads(raw) or {}).get("ratings", []):
            idx = int(r["id"])
            if 0 <= idx < len(cards):
                scores[idx] = max(1, min(DECK_COUNT, int(r["level"])))
    except (ValueError, TypeError, KeyError):
        pass  # unusable response -> every card takes its tier midpoint below

    # Tier midpoints for gaps; tier also breaks ties, so a level the model
    # over-filled still ramps internally and the 10-card slicing stays exact.
    fallback = {0: 1.5, 1: 3.0, 2: 4.5}
    ranked = sorted(
        range(len(cards)),
        key=lambda i: (
            float(scores.get(i, fallback[_TIER_RANK[cards[i]["difficulty"]]])),
            _TIER_RANK[cards[i]["difficulty"]],
            i,
        ),
    )
    return ranked, scores


def _review(role: str, topic_key: str, order: list[int], scores: dict[int, int]) -> str:
    cards = get_topic_cards(role, topic_key)
    out = [f"## {topic_key}", ""]
    for level in range(1, DECK_COUNT + 1):
        chunk = order[(level - 1) * DECK_SIZE: level * DECK_SIZE]
        tiers = [cards[i]["difficulty"][0].upper() for i in chunk]
        mean = sum(_TIER_RANK[cards[i]["difficulty"]] for i in chunk) / max(1, len(chunk))
        out.append(f"### Deck {level}  (authored tiers {''.join(tiers)}, mean {mean:.2f})")
        for i in chunk:
            out.append(f"- `{scores.get(i, '--'):>3}` [{cards[i]['difficulty'][:4]}] {cards[i]['stem']}")
        out.append("")
    return "\n".join(out)


def _unique_topics() -> list[tuple[str, str]]:
    """(role, topic_key) for every topic any role studies. FOUNDATIONS is shared,
    so dedupe on topic_key — ranking it twice would be paying twice."""
    seen: dict[str, str] = {}
    for role in ("OA", "OT"):
        for topic_key, _ in topics_for(role):
            seen.setdefault(topic_key, role)
    return [(role, topic) for topic, role in seen.items()]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--topic", help="rank these topic_keys (comma-separated)")
    ap.add_argument("--all", action="store_true", help="rank every topic")
    ap.add_argument("--dry-run", action="store_true", help="force MOCK_MODE, no spend")
    ap.add_argument("--review-only", action="store_true",
                    help="re-render the review from the shipped rankings; makes NO AI calls")
    ap.add_argument("--out", default=str(_RANKINGS_PATH))
    ap.add_argument("--review", default=str(Path(_RANKINGS_PATH).with_name("card_levels_review.md")))
    args = ap.parse_args()

    if args.dry_run:
        import tools.shared.gemini_client as gc
        gc.MOCK_MODE = True

    out_path = Path(args.out)
    try:
        existing = json.loads(out_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        existing = {}

    # Re-render the audit trail from what actually ships, for free. The ranking is
    # curation applied to clinical content, so it has to stay reviewable long after
    # the pass that produced it — without paying for the pass again.
    if args.review_only:
        role_of = {topic: role for role, topic in _unique_topics()}
        rendered = [_review(role_of[t], t, existing[t]["order"], {})
                    for t in sorted(existing) if t in role_of]
        Path(args.review).write_text("\n".join(rendered), encoding="utf-8")
        print(f"re-rendered {args.review} from {len(rendered)} shipped rankings (no AI calls)")
        return

    wanted = {t.strip() for t in (args.topic or "").split(",") if t.strip()}
    targets = _unique_topics() if args.all else [
        (r, t) for r, t in _unique_topics() if t in wanted]
    if not targets:
        raise SystemExit(f"no such topic: {args.topic!r}")

    reviews, dropped = [], []
    print(f"model={FLASH_MODEL} mock={MOCK_MODE} topics={len(targets)}")
    for n, (role, topic) in enumerate(targets, 1):
        cards = get_topic_cards(role, topic)
        # Retry once: a single bad sample is common, a topic the model genuinely
        # misjudges fails both times and falls back below.
        for attempt in (1, 2):
            order, scores = rank_topic(role, topic)
            means = deck_tier_means(cards, order)
            if ramp_ok(means):
                break
        # How evenly the model filled the 5 levels — a lopsided split means it dodged
        # the forced ranking, so the deck boundaries would be arbitrary.
        dist = [sum(1 for v in scores.values() if v == lvl) for lvl in range(1, DECK_COUNT + 1)]
        if ramp_ok(means):
            existing[topic] = {"cards": len(cards), "order": order}
            reviews.append(_review(role, topic, order, scores))
            state = "OK  " if attempt == 1 else "OK*2"
        else:
            # Refuse to ship a ladder that doesn't ramp. Dropping the entry leaves the
            # topic on the identity fallback — the authored easy→medium→hard order,
            # which is monotonic by construction. A misjudged topic degrades to the
            # bank's own tiers instead of shipping a scrambled ladder.
            existing.pop(topic, None)
            dropped.append(topic)
            state = "DROP"
        print(f"[{n}/{len(targets)}] {topic:34s} {state} rated={len(scores)}/{len(cards)} "
              f"split={dist} means={[round(m, 2) for m in means]}")

    out_path.write_text(json.dumps(existing, indent=1, sort_keys=True), encoding="utf-8")
    Path(args.review).write_text("\n".join(reviews), encoding="utf-8")
    print(f"\nwrote {out_path}  ({len(existing)} topics ranked)\nreview {args.review}")
    if dropped:
        # Never silent: a dropped topic still WORKS, it just runs on the authored
        # tier order rather than a curated ranking.
        print(f"\n{len(dropped)} topic(s) fell back to the authored tier order: "
              + ", ".join(sorted(dropped)))


if __name__ == "__main__":
    main()
