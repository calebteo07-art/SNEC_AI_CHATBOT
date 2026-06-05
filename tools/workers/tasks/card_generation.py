"""Celery task: generate flash-cards from a completed session in the background.

Fired by /api/end-session so the route returns immediately while cards
are extracted from the transcript and saved to Supabase asynchronously.
"""
import asyncio

from tools.workers.celery_app import app
from tools.flashcards.generate_cards import generate_and_return_cards


@app.task(
    name="tools.workers.tasks.card_generation.generate_cards_bg",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="cards",
)
def generate_cards_bg(
    self,
    student_id: str,
    session_id: str,
    messages: list,
    role: str = "",
) -> dict:
    """Run card generation + Supabase insert in a fresh event loop."""
    try:
        loop = asyncio.new_event_loop()
        try:
            cards = loop.run_until_complete(
                generate_and_return_cards(
                    student_id=student_id,
                    session_id=session_id,
                    messages=messages,
                    role=role,
                )
            )
        finally:
            loop.close()
        return {"cards_generated": len(cards)}
    except Exception as exc:
        raise self.retry(exc=exc)
