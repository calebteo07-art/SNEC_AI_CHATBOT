"""Consultation labels and the assembled payload (spec §4.6)."""
import json

from tools.supervisor.student_insight import (
    build_student_insight, consultations, TOPIC_SENTINEL,
)


def test_consultations_use_the_recorded_label():
    rows = [{"topic": "how do I calibrate a Goldmann tonometer", "summary": "...",
             "created_at": "2026-08-02T10:00:00Z"}]
    out = consultations(rows, vocabulary=["tonometry"])
    assert out[0].label == "how do I calibrate a Goldmann tonometer"
    assert out[0].count == 1 and out[0].derived is False
    assert out[0].last_seen == "2026-08-02"


def test_consultations_group_repeats_and_keep_the_latest_date():
    rows = [{"topic": "gonioscopy", "created_at": "2026-08-01T09:00:00Z"},
            {"topic": "gonioscopy", "created_at": "2026-08-04T09:00:00Z"}]
    out = consultations(rows, vocabulary=[])
    assert out[0].count == 2 and out[0].last_seen == "2026-08-04"


def test_consultations_never_print_the_sentinel_as_a_subject():
    """Every legacy tutor row carries the chat default. Printing it as a topic is the defect
    this replaces -- it made every conversation look identical."""
    rows = [{"topic": TOPIC_SENTINEL, "summary": "Intraocular pressure is measured by...",
             "created_at": "2026-08-01T09:00:00Z"}]
    out = consultations(rows, vocabulary=["intraocular pressure", "pressure"])
    assert out[0].label == "intraocular pressure"    # longest match wins
    assert out[0].derived is True


def test_consultations_admit_when_nothing_can_be_derived():
    rows = [{"topic": TOPIC_SENTINEL, "summary": "Let us think about that together.",
             "created_at": "2026-08-01T09:00:00Z"}]
    out = consultations(rows, vocabulary=["gonioscopy"])
    assert out[0].label == "" and out[0].derived is False


def test_consultations_exclude_station_sessions():
    """Stations are logged into the same table with a server-written "Case: " prefix."""
    rows = [{"topic": "Case: Acute angle closure", "created_at": "2026-08-01T09:00:00Z"},
            {"topic": "gonioscopy", "created_at": "2026-08-01T09:00:00Z"}]
    out = consultations(rows, vocabulary=[])
    assert [c.label for c in out] == ["gonioscopy"]


def test_consultations_sort_by_count_then_recency():
    rows = [{"topic": "a", "created_at": "2026-08-01T09:00:00Z"},
            {"topic": "b", "created_at": "2026-08-05T09:00:00Z"},
            {"topic": "b", "created_at": "2026-08-06T09:00:00Z"}]
    assert [c.label for c in consultations(rows, vocabulary=[])] == ["b", "a"]


def test_consultations_rank_an_undated_group_last_not_first():
    """A missing date is not "today". Sorting an undated group to the top of its count group
    would present the one consultation we can say least about as the most recent."""
    rows = [{"topic": "undated"},
            {"topic": "dated", "created_at": "2026-08-01T09:00:00Z"}]
    out = consultations(rows, vocabulary=[])
    assert [c.label for c in out] == ["dated", "undated"]
    assert out[1].last_seen == ""       # blank, never a stand-in date


def test_consultations_flag_a_group_as_derived_if_any_member_was_inferred():
    """`derived` is a trust caveat, so it must not depend on which row happened to arrive
    first. If any session in the group only matched a summary, the group's count is partly
    inferred and the trainer is told so."""
    recorded = {"topic": "tonometry", "created_at": "2026-08-01T09:00:00Z"}
    inferred = {"topic": TOPIC_SENTINEL, "summary": "Tonometry measures the pressure.",
                "created_at": "2026-08-02T09:00:00Z"}
    for rows in ([recorded, inferred], [inferred, recorded]):
        out = consultations(rows, vocabulary=["tonometry"])
        assert len(out) == 1 and out[0].count == 2
        assert out[0].derived is True


def _payload(**over):
    args = dict(profile={}, sessions=[], case_rows=[], card_rows=[],
                case_topics={}, cohort_card_rows=[], cohort_case_rows=[], student_id="me")
    args.update(over)
    return build_student_insight(**args)


def test_payload_is_json_serialisable():
    json.dumps(_payload())   # must not raise -- this goes straight out of a FastAPI handler


def test_payload_of_an_empty_student_is_shaped_not_missing():
    """A brand-new student must produce every key, so a renderer never has to distinguish
    'no data' from 'old payload shape'."""
    out = _payload()
    for key in ("topics", "mark_loss", "offenders", "critical_offenders",
                "osce_trajectory", "flashcard_trajectory", "consultations",
                "contrasts", "excluded"):
        assert key in out
    assert out["topics"] == []
    assert out["osce_trajectory"]["band"] == "insufficient"


def test_payload_orders_osce_attempts_chronologically_for_the_trajectory():
    """The rows arrive from Supabase unordered; trajectory trusts its input order."""
    rows = [{"case_id": "c1", "score_100": 90, "completed_at": "2026-08-04T00:00:00Z"},
            {"case_id": "c1", "score_100": 10, "completed_at": "2026-08-01T00:00:00Z"},
            {"case_id": "c1", "score_100": 80, "completed_at": "2026-08-05T00:00:00Z"},
            {"case_id": "c1", "score_100": 20, "completed_at": "2026-08-02T00:00:00Z"}]
    out = _payload(case_rows=rows)
    assert out["osce_trajectory"]["band"] == "improving"


def test_payload_orders_flashcards_chronologically_for_the_trajectory():
    """`get_flashcard_attempts` orders by `ts` DESCENDING, and `ts` -- not `created_at` --
    is the column that exists (migration 010). Sorting on the wrong key is a silent no-op
    that leaves the rows newest-first, which inverts the verdict exactly."""
    rows = [{"topic_tag": "t", "correct": day > 10, "ts": f"2026-08-{day:02d}T09:00:00Z"}
            for day in range(20, 0, -1)]     # newest first, as the reader returns them
    out = _payload(card_rows=rows)
    assert out["flashcard_trajectory"]["band"] == "improving"
    assert out["flashcard_trajectory"]["delta"] == 100.0


def test_payload_needs_more_cards_than_stations_to_call_a_flashcard_trend():
    """One card is a far smaller event than one station, so a handful says nothing."""
    rows = [{"topic_tag": "t", "correct": True, "ts": "2026-08-01T09:00:00Z"}] * 10
    out = _payload(card_rows=rows)["flashcard_trajectory"]
    assert out["band"] == "insufficient" and out["needed"] == 20 and out["delta"] is None


def test_payload_carries_the_flag_a_trainer_opens_the_report_for():
    out = _payload(
        card_rows=[{"topic_tag": "tonometry", "correct": True}] * 18,
        case_rows=[{"case_id": "c1", "score_100": 35,
                    "completed_at": "2026-08-01T00:00:00Z"}],
        case_topics={"c1": "Tonometry"},
    )
    assert out["topics"][0]["flag"] == "knows_cant_do"


def test_payload_keeps_a_missing_cohort_baseline_null_through_serialisation():
    """`cohort_mean` is None when no peer has data. Serialising it as 0 would print
    "cohort average 0" for a topic nobody has been measured on."""
    out = _payload(card_rows=[{"topic_tag": "tonometry", "correct": i < 3}
                              for i in range(10)])
    assert out["contrasts"][0]["label"] == "no_baseline"
    assert out["contrasts"][0]["cohort_mean"] is None
    assert '"cohort_mean": null' in json.dumps(out)
