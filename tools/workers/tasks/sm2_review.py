"""Celery task: persist SM-2 review result to Supabase in the background.

Fired by /api/flashcards/check so the route returns the score immediately
while the DB write is offloaded to the worker queue.
"""
import asyncio

from tools.workers.celery_app import app
from tools.flashcards.sm2 import next_review, due_date
from tools.flashcards.flashcard_store import update_card_sm2


@app.task(
    name="tools.workers.tasks.sm2_review.process_review",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    queue="sm2",
)
def process_review(
    self,
    card_id: str,
    quality: int,
    repetitions: int,
    easiness: float,
    interval: int,
) -> None:
    """Compute SM-2 schedule and write updated card state to Supabase."""
    try:
        new_interval, new_ease, new_reps = next_review(quality, repetitions, easiness, interval)
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(
                update_card_sm2(card_id, new_interval, new_ease, new_reps, due_date(new_interval))
            )
        finally:
            loop.close()
    except Exception as exc:
        raise self.retry(exc=exc)
