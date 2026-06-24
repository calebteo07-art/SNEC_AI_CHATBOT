"""Application clock — the daily boundary is Singapore time (SGT, UTC+8).

Render runs in UTC; SNEC students are in Singapore, so "today" and the daily
check-in / streak boundary must be SGT or evening check-ins land on the wrong day.
Centralised here so the whole gamification + check-in path agrees on the date.
"""
from datetime import datetime, timedelta, timezone

SGT = timezone(timedelta(hours=8))


def app_now() -> datetime:
    """Current time in SGT."""
    return datetime.now(SGT)


def app_today():
    """Today's date in SGT — the canonical day for streaks and check-ins."""
    return app_now().date()
