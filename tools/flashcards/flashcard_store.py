"""Async Supabase CRUD for the flashcards table.

Replaces Google Sheets snec_flashcards for all card persistence.
All functions are async — await them in FastAPI routes or asyncio.run() in scripts.

Usage:
    from tools.flashcards.flashcard_store import insert_cards, get_due_cards, update_card_sm2
"""
import uuid
from datetime import date

from tools.shared.db import _get_client


async def insert_cards(student_id: str, cards: list[dict]) -> list[dict]:
    """Insert flash cards into Supabase. Returns list of saved cards with card_id.

    Each card dict must have: front, back, topic_tag.
    A new UUID is minted per row unless the card already carries a card_id.
    """
    if not cards:
        return []
    client = await _get_client()
    rows = []
    for c in cards:
        card_id = c.get("card_id") or str(uuid.uuid4())
        rows.append({
            "card_id": card_id,
            "student_id": student_id,
            "topic_tag": c.get("topic_tag", "general"),
            "front": c["front"],
            "back": c["back"],
            "source": c.get("source", "session"),
        })
    await client.table("flashcards").insert(rows).execute()
    return [
        {"card_id": r["card_id"], "front": r["front"], "back": r["back"], "topic_tag": r["topic_tag"]}
        for r in rows
    ]


async def get_served_static_fronts(student_id: str) -> set[str]:
    """Front text of all source='static' cards already issued to this student."""
    client = await _get_client()
    result = (
        await client.table("flashcards")
        .select("front")
        .eq("student_id", student_id)
        .eq("source", "static")
        .execute()
    )
    return {r["front"] for r in (result.data or [])}


async def get_served_static_card_ids(student_id: str) -> dict[str, str]:
    """front -> card_id for this student's static cards.

    Lets a replayed deck reuse the rows it already has instead of inserting a second
    copy per card: duplicates would fork the card's SM-2 schedule and let the review
    deck serve the same stem twice. Newest row wins if a student somehow has two."""
    client = await _get_client()
    result = (
        await client.table("flashcards")
        .select("card_id, front")
        .eq("student_id", student_id)
        .eq("source", "static")
        .execute()
    )
    return {r["front"]: r["card_id"] for r in (result.data or [])}


async def get_due_cards(student_id: str, limit: int = 10) -> list[dict]:
    """Return up to `limit` cards due today or earlier for `student_id`."""
    client = await _get_client()
    today = date.today().isoformat()
    result = (
        await client.table("flashcards")
        .select("card_id, front, back, topic_tag, repetitions, easiness, interval_days, next_due")
        .eq("student_id", student_id)
        .lte("next_due", today)
        .order("next_due")
        .limit(limit)
        .execute()
    )
    return result.data or []


async def count_due_cards(student_id: str) -> int:
    """Number of cards due today or earlier for the student (for the dashboard)."""
    client = await _get_client()
    today = date.today().isoformat()
    result = (
        await client.table("flashcards")
        .select("card_id", count="exact")
        .eq("student_id", student_id)
        .lte("next_due", today)
        .execute()
    )
    return result.count or 0


async def update_card_sm2(
    card_id: str,
    interval: int,
    easiness: float,
    reps: int,
    next_due: str,
) -> None:
    """Persist SM-2 review result for a card."""
    client = await _get_client()
    await (
        client.table("flashcards")
        .update({
            "interval_days": interval,
            "easiness": easiness,
            "repetitions": reps,
            "next_due": next_due,
            "last_reviewed": "now()",
        })
        .eq("card_id", card_id)
        .execute()
    )
