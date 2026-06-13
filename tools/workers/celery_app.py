"""Celery application — broker and worker configuration.

Start worker:
    celery -A tools.workers.celery_app worker --loglevel=info --queues=sm2,media

Or via Docker Compose:
    docker compose up worker
"""
import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

from celery import Celery  # noqa: E402 — must import after dotenv

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

app = Celery(
    "eyebot",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "tools.workers.tasks.sm2_review",
        "tools.workers.tasks.media_refresh",
    ],
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_expires=3600,
    task_acks_late=True,          # re-queue on worker crash
    worker_prefetch_multiplier=1,  # fair dispatch — no head-of-line blocking
    task_routes={
        "tools.workers.tasks.sm2_review.*":      {"queue": "sm2"},
        "tools.workers.tasks.media_refresh.*":   {"queue": "media"},
    },
)
