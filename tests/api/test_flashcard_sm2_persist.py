# tests/api/test_flashcard_sm2_persist.py
"""Regression: the flashcard SM-2 schedule write must ALWAYS persist in-request.

The bug: /api/flashcards/check fired ``process_review.delay()`` and only wrote
the SM-2 schedule synchronously inside ``except Exception`` — i.e. ONLY when
``.delay()`` raised. With no Redis broker ``.delay()`` raises, so the fallback
runs and the write happens. But the moment ``REDIS_URL`` is provisioned (which
render.yaml itself recommends, and which horizontal scaling requires), the
broker becomes reachable while NO Celery worker consumes queue ``sm2`` — so
``.delay()`` succeeds into an unconsumed queue, the except-fallback never fires,
and every student's spaced-repetition schedule is silently lost.

This test injects a fake ``sm2_review`` module whose ``.delay()`` SUCCEEDS —
simulating exactly that "Redis reachable, enqueue accepted" condition — and
asserts the DB write still happens with the correct SM-2 schedule. (It also runs
where ``celery`` isn't installed, since it never imports the real task.)
"""
import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.flashcards.sm2 import next_review
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _cookie():
    return {"eyebot_token": create_access_token("stu_sm2", "student", "OA")}


def _fake_sm2_review_module(enqueue):
    """A stand-in for tools.workers.tasks.sm2_review whose process_review.delay
    SUCCEEDS — i.e. a reachable broker with no worker consuming the queue."""
    mod = types.ModuleType("tools.workers.tasks.sm2_review")
    task = MagicMock()
    task.delay = enqueue
    mod.process_review = task
    return mod


def test_flashcard_check_persists_sm2_even_when_celery_enqueue_succeeds():
    body = {
        "question": "Normal IOP range?",
        "student_answer": "10 to 21 mmHg",
        "correct_answer": "10-21 mmHg",
        "card_id": "card-123",
        "repetitions": 2,
        "easiness": 2.5,
        "interval_days": 6,
    }
    # Deterministic grade so the SM-2 quality is fixed regardless of mock output.
    fixed_grade = '{"score": 100, "feedback": "spot on"}'
    quality = round(100 / 20)  # 0-100 -> 0-5
    exp_interval, exp_ease, exp_reps = next_review(quality, 2, 2.5, 6)

    write_spy = AsyncMock()
    enqueue_ok = MagicMock(return_value=None)  # broker reachable: enqueue accepted

    with patch("tools.api.routers.student.ask", return_value=fixed_grade), \
         patch("tools.api.routers.student.update_card_sm2", write_spy), \
         patch.dict(sys.modules, {"tools.workers.tasks.sm2_review": _fake_sm2_review_module(enqueue_ok)}):
        r = client.post("/api/flashcards/check", json=body, cookies=_cookie())

    assert r.status_code == 200

    # The schedule MUST be persisted in-request, regardless of Celery/Redis state.
    write_spy.assert_awaited_once()
    card_id, interval, easiness, reps, _next_due = write_spy.await_args.args
    assert card_id == "card-123"
    assert (interval, easiness, reps) == (exp_interval, exp_ease, exp_reps)
