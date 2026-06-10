"""Deterministic per-student rotation over static content pools.

Used by check-in questions, flashcard generation, and case selection to
cycle each student through a full pool of pre-authored items before any
repeats — without AI generation or DB schema changes.
"""
import random
from datetime import date

_POOL_EPOCH = date(2025, 1, 1)


def get_rotation_order(student_id: str, pool_size: int, namespace: str) -> list[int]:
    """Deterministic per-student, per-feature shuffle of [0, pool_size)."""
    rng = random.Random(f"{student_id}:{namespace}")
    order = list(range(pool_size))
    rng.shuffle(order)
    return order


def pick_by_day_count(student_id: str, pool_size: int, namespace: str, today: date | None = None) -> int:
    """Stable 'today's index' into the rotation order — cycles through all
    pool_size items every pool_size days."""
    order = get_rotation_order(student_id, pool_size, namespace)
    day_index = ((today or date.today()) - _POOL_EPOCH).days % pool_size
    return order[day_index]


def pick_next_unseen(student_id: str, pool_size: int, namespace: str, served_indices: set[int], n: int = 1) -> list[int]:
    """Next n indices the student hasn't been served yet, in rotation
    order. Wraps around (allowing repeats) once everything is seen."""
    order = get_rotation_order(student_id, pool_size, namespace)
    unseen = [i for i in order if i not in served_indices]
    result = unseen[:n]
    i = 0
    while len(result) < n:
        result.append(order[i % pool_size])
        i += 1
    return result
