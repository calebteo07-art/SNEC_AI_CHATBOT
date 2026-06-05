"""One-time migration: Google Sheets snec_flashcards → Supabase flashcards table.

Run once after applying 001_flashcards.sql:
    python -m tools.scripts.migrate_flashcards_from_sheets

Cards are upserted by card_id so it is safe to re-run if interrupted.
"""
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gsheets import get_rows
from tools.shared.db import _get_client


async def migrate() -> None:
    print("Reading rows from snec_flashcards Google Sheet…")
    rows = get_rows("snec_flashcards", {})
    if not rows:
        print("No rows found — sheet may be empty or already migrated.")
        return

    client = await _get_client()
    migrated = 0
    skipped = 0

    for row in rows:
        student_id = row.get("student_id", "").strip()
        front = row.get("front", "").strip()
        back = row.get("back", "").strip()
        if not student_id or not front or not back:
            skipped += 1
            continue

        payload = {
            "student_id": student_id,
            "topic_tag": row.get("topic_tag", "general").strip() or "general",
            "front": front,
            "back": back,
            "repetitions": int(row.get("repetition_count") or 0),
            "easiness": float(row.get("easiness_factor") or 2.5),
            "interval_days": int(row.get("interval_days") or 0),
            "source": "migrated",
        }

        # Preserve card_id if it looks like a valid UUID
        card_id = row.get("card_id", "").strip()
        if len(card_id) == 36:
            payload["card_id"] = card_id

        # Preserve next_due if valid ISO date string
        next_due = row.get("next_due_date", "").strip()
        if next_due and len(next_due) == 10:
            payload["next_due"] = next_due

        await client.table("flashcards").upsert(payload, on_conflict="card_id").execute()
        migrated += 1
        if migrated % 50 == 0:
            print(f"  …{migrated} rows migrated")

    print(f"\nDone: {migrated} migrated, {skipped} skipped (missing student_id/front/back).")


if __name__ == "__main__":
    asyncio.run(migrate())
