"""The daily activity blob — one writer, and a stale stamp means empty.

This is the substrate the whole Home game loop computes from. Two rules matter and each
has a test because each is a way to silently corrupt a student's day:
  · A daily_state_date that is not today reads as EMPTY, never as yesterday's counts.
    Without that, the first earn of a new day inherits yesterday's quest progress.
  · record_activity only counts sources it knows. A typo'd source must not invent a key
    that no quest can ever read.
"""
from datetime import date

from tools.gamification.daily_state import EMPTY_STATE, read_daily_state, record_activity

TODAY = date(2026, 8, 4)


def test_a_stale_stamp_reads_as_empty():
    profile = {"daily_state": {"activity": {"flashcards": 9}}, "daily_state_date": "2026-08-03"}
    assert read_daily_state(profile, TODAY) == EMPTY_STATE


def test_an_absent_column_reads_as_empty():
    # Pre-migration: the columns do not exist at all.
    assert read_daily_state({}, TODAY) == EMPTY_STATE


def test_todays_stamp_reads_the_stored_blob():
    stored = {"activity": {"flashcards": 3, "osce": 0, "tutor": 0, "topics": {}},
              "quests_claimed": ["adaptive"], "chest_claimed": True}
    profile = {"daily_state": stored, "daily_state_date": "2026-08-04"}
    assert read_daily_state(profile, TODAY) == stored


def test_record_activity_accumulates_a_known_source():
    state = record_activity(EMPTY_STATE, "flashcards", topic="gonioscopy")
    state = record_activity(state, "flashcards", topic="gonioscopy")
    assert state["activity"]["flashcards"] == 2
    assert state["activity"]["topics"]["gonioscopy"] == 2


def test_record_activity_ignores_an_unknown_source():
    state = record_activity(EMPTY_STATE, "typo", topic="gonioscopy")
    assert state["activity"] == EMPTY_STATE["activity"]


def test_record_activity_without_a_topic_still_counts_the_source():
    state = record_activity(EMPTY_STATE, "osce")
    assert state["activity"]["osce"] == 1
    assert state["activity"]["topics"] == {}


def test_record_activity_does_not_mutate_its_input():
    # The caller holds the profile's dict; mutating it in place would write yesterday's
    # object back under today's stamp.
    original = record_activity(EMPTY_STATE, "tutor")
    record_activity(original, "tutor")
    assert original["activity"]["tutor"] == 1
