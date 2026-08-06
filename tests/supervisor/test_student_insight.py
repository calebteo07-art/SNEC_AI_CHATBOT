"""Consultation labels and the assembled payload (spec §4.6)."""
from tools.supervisor.student_insight import consultations, TOPIC_SENTINEL


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
