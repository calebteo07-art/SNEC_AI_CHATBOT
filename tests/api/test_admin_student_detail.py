"""GET /api/admin/student/{id}/detail — mastery block and rate limit (spec §6.2)."""
import contextlib
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def _no_shared_read_cache():
    """Disable the cohort READ cache for this file, so each test's stubs are what the
    handler actually sees. Read-sharing is pinned in tests/api/test_admin_read_sharing.py,
    where it is the subject rather than a confound — here it would only mask a stub."""
    from tools.supervisor import cohort_reads

    with patch.object(cohort_reads, "_READ_TTL_S", 0):
        yield

_PROFILES = [
    {"student_id": "s1", "role": "OA", "retention_scores": {"red_eye": 0.8}},
    {"student_id": "s2", "role": "OA", "retention_scores": {"red_eye": 0.4}},
    {"student_id": "s3", "role": "OA", "retention_scores": {"red_eye": 0.6}},
    # s4 is OT and its keys BUCKET DIFFERENTLY per pool: under OT `aberrometry` and
    # `auto_refraction_myopic_patient` are one group (-> 50.0), under CLINICAL they split
    # (-> 40.0). Without a role-sensitive row, passing `role=""` for every student — which
    # silently resolves every OT student on the CLINICAL pool — is unobservable.
    {"student_id": "s4", "role": "OT", "retention_scores": {
        "aberrometry": 0.2, "auto_refraction_myopic_patient": 0.2, "anatomy_physiology": 0.8,
    }},
    # s5 has no retention data at all. Zero-filling them instead of excluding them is the
    # exact thing mastery_block's docstring forbids, and with s1-s4 alone it was invisible.
    {"student_id": "s5", "role": "OA"},
]
_CASES = [
    {"student_id": "s1", "case_id": "c1", "score_100": 90, "passed": True, "safe": True},
    {"student_id": "s2", "case_id": "c1", "score_100": 60, "passed": True, "safe": True},
    {"student_id": "s3", "case_id": "c1", "score_100": 30, "passed": False, "safe": False},
]
_CARDS = [{"student_id": "s2", "topic_tag": "red_eye", "correct": True}]


def _staff_cookies():
    return {"eyebot_token": create_access_token("user_001", "admin", "OA")}


def _detail_patches():
    """Every db call the endpoint makes. Leaving one unstubbed fails the test via
    conftest's global `_forbid_real_supabase`, which patches `db._get_client` to raise —
    so an unstubbed call cannot actually reach production, but it does abort the read it
    was part of, and the handler's degrade would otherwise hide that as `mastery: null`.
    Of the nine, only get_profile would WRITE (it creates a default row on a miss).

    insert_audit_event is in the shared set rather than in the one test that asserts on it,
    because it fires on the DEGRADE path: every test that makes a mastery read fail reaches
    it, so stubbing it per-test means each new degrade test starts by leaking a write.

    get_profile patches on the ROUTER's namespace, not tools.profile: admin.py binds it
    with `from tools.profile.get_profile import get_profile` at import time, so patching
    the source module is inert. It also never raises — it swallows the db failure and
    returns a default profile — so the leak would be invisible without conftest's guard.
    Same target `_stub_admin_db` uses (tests/api/test_admin_endpoints.py:109).
    """
    return [
        patch("tools.api.routers.admin.get_profile",
              new=AsyncMock(return_value={"student_id": "s1", "role": "OA",
                                          "retention_scores": {"red_eye": 0.8}})),
        patch("tools.shared.db.get_consent_by_student_id",
              new=AsyncMock(return_value={"student_name": "A B", "email": "a@b.c"})),
        patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])),
        # s1's OWN attempt. The handler now sources their own OSCE figure from this read
        # — the same list that renders `cases` — rather than from the cohort scan, so the
        # fixture has to carry it. Deliberately the same 90 that _CASES gives s1, so every
        # assertion below is unchanged by the re-sourcing.
        patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[
            {"student_id": "s1", "case_id": "c1", "score_100": 90,
             "passed": True, "safe": True},
        ])),
        # The RAW attempts: the handler aggregates accuracy in-process now, because
        # get_topic_accuracy discarded the `ts` the flashcard trajectory needs.
        patch("tools.shared.db.get_flashcard_attempts", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_active_student_profiles",
              new=AsyncMock(return_value=(_PROFILES, 0))),
        patch("tools.shared.db.get_all_case_scores",
              new=AsyncMock(return_value=(_CASES, True))),
        patch("tools.shared.db.get_all_flashcard_attempts",
              new=AsyncMock(return_value=(_CARDS, True))),
        patch("tools.shared.db.insert_audit_event", new=AsyncMock()),
    ]


def _get(path="/api/admin/student/s1/detail", extra=()):
    stack = _detail_patches() + list(extra)
    with contextlib.ExitStack() as es:
        for p in stack:
            es.enter_context(p)
        return client.get(path, cookies=_staff_cookies())


def test_detail_returns_three_named_mastery_scales():
    r = _get()
    assert r.status_code == 200
    mastery = r.json()["mastery"]
    assert set(mastery) == {"osce_mastery", "flashcard_mastery", "retention_mastery"}
    # Whole-dict, not field-by-field: the handler passes mastery_block's output straight
    # through with no response_model, so the only thing stopping a future refactor from
    # rebuilding this dict and silently dropping `peers_n` — the divisor a trainer is
    # shown as the peer count — is an assertion that names every key.
    # Leave-one-out over s2/s3: (60+30)/2 = 45; peers_n 2 while cohort_n 3.
    assert mastery["osce_mastery"] == {
        "value": 90.0, "cohort_avg": 45.0, "delta": 45.0, "cohort_n": 3, "peers_n": 2,
    }
    # The retention scale is wired through retention_mastery, which the other assertions
    # never reach: s1's {"red_eye": 0.8} -> 80.0, cohort (0.4, 0.6) -> 50.0. Without this
    # a scale that always returned None, or zero-filled a missing one, passed every test.
    assert mastery["retention_mastery"]["value"] == 80.0
    # (40 + 60 + 50)/3. s4's 50 only comes out at 50 if its OT role reached
    # retention_mastery; on the CLINICAL pool its keys split and this reads 46.7.
    assert mastery["retention_mastery"]["cohort_avg"] == 50.0
    # 4, not 5: s5 has no retention data and is excluded rather than counted as a 0.
    assert mastery["retention_mastery"]["cohort_n"] == 4


def test_scale_the_student_lacks_is_null_with_the_cohort_still_shown():
    # s1 has no flashcard attempts; s2 does. value null, cohort_avg populated.
    fc = _get().json()["mastery"]["flashcard_mastery"]
    assert fc["value"] is None
    assert fc["delta"] is None
    assert fc["cohort_avg"] == 100.0
    assert fc["cohort_n"] == 1


def test_mastery_degrades_to_null_without_taking_out_the_page():
    # Mastery is an ADDITION to a page that already works. A 500 here would blank the
    # sessions, cases and findings a trainer came for.
    extra = [patch("tools.shared.db.get_all_case_scores",
                   new=AsyncMock(side_effect=RuntimeError("supabase down")))]
    r = _get(extra=extra)
    assert r.status_code == 200
    assert r.json()["mastery"] is None
    assert "sessions" in r.json() and "cases" in r.json()


def test_a_failed_mastery_block_leaves_a_durable_record():
    """...and the degrade has to be *detectable*, which is a different requirement.

    `mastery: null` is ALSO the correct, healthy answer for a student outside the cohort
    (test_a_student_outside_the_cohort_is_not_scored_against_it below), so a lecturer
    reading a null cannot tell "the scorer crashed" from "not in this population" — and
    only one of those needs fixing. The swallow's own comment says it is there so a
    permanent null has a detector other than a human reading a raw response; writing it to
    .tmp/audit_log.jsonl, which nothing in this app reads and Render's ephemeral disk drops
    on the next restart, gave it no detector at all. audit_events is the one staff can query.

    Attributed like every other admin event: actor is the staff member who loaded the page,
    target is the student whose page it was."""
    audit = AsyncMock()
    extra = [patch("tools.shared.db.get_all_case_scores",
                   new=AsyncMock(side_effect=RuntimeError("supabase down"))),
             patch("tools.shared.db.insert_audit_event", new=audit)]
    r = _get(extra=extra)
    assert r.status_code == 200
    assert r.json()["mastery"] is None
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "mastery_block_failed"
    assert kw["actor"] == "user_001"
    assert kw["target"] == "s1"
    assert "supabase down" in kw["detail"]


def test_an_unavailable_flashcard_table_does_not_null_the_other_two_scales():
    # get_all_flashcard_attempts RAISES by design when the table is missing (the normal
    # pre-migration-010 state), so it is isolated. Sharing one try with the population and
    # OSCE reads threw away two scales that were fully computable — the same split
    # /cohort-analytics already makes.
    extra = [patch("tools.shared.db.get_all_flashcard_attempts",
                   new=AsyncMock(side_effect=RuntimeError("relation does not exist")))]
    mastery = _get(extra=extra).json()["mastery"]
    assert mastery is not None
    assert mastery["osce_mastery"]["value"] == 90.0
    assert mastery["retention_mastery"]["value"] == 80.0
    # Only the flashcard scale goes dark, and as "no data" rather than 0.0.
    assert mastery["flashcard_mastery"]["value"] is None
    assert mastery["flashcard_mastery"]["cohort_n"] == 0


def test_core_reads_still_500():
    # Unchanged behaviour: a detail page with no identity is not a detail page.
    extra = [patch("tools.shared.db.get_consent_by_student_id",
                   new=AsyncMock(side_effect=RuntimeError("supabase down")))]
    assert _get(extra=extra).status_code == 500


def test_the_endpoint_is_rate_limited_on_a_fixed_scope():
    # slowapi defaults to key_style="url", so a plain @limiter.limit would put
    # {student_id} in the bucket key and let a caller dodge the cap by looping ids.
    # Walking DIFFERENT ids must still exhaust one shared bucket.
    codes = []
    for i in range(35):
        codes.append(_get(path=f"/api/admin/student/s{i}/detail").status_code)
    assert 429 in codes, "different ids must share one rate-limit bucket"
    # Pin WHERE it trips, not just that it does: any cap of 34 or less satisfies a bare
    # `429 in codes`, so the declared 30/minute would be free to drift.
    assert codes.index(429) == 30


def test_an_empty_cohort_is_no_comparison_rather_than_a_row_of_zeroes():
    # No active students at all means the viewed student is not one either, so this lands
    # on the same "not in this population" path as the test below rather than emitting a
    # block of nulls that implies a cohort was consulted and came back empty.
    extra = [patch("tools.shared.db.get_active_student_profiles",
                   new=AsyncMock(return_value=([], 0)))]
    assert _get(extra=extra).json()["mastery"] is None


def test_a_student_outside_the_cohort_is_not_scored_against_it():
    # /api/admin/students is NOT staff-free, so a promoted trainer is on the roster and
    # clickable, while get_active_student_profiles correctly excludes them here. Scoring
    # them anyway printed "value: None" against a real cohort_avg — "no data" — two
    # panels above their own OSCE score in the same payload.
    others = [p for p in _PROFILES if p["student_id"] != "s1"]
    extra = [patch("tools.shared.db.get_active_student_profiles",
                   new=AsyncMock(return_value=(others, 1)))]
    body = _get(extra=extra).json()
    assert body["mastery"] is None
    # ...and the rest of the page still renders, exactly as on a failed read.
    assert "sessions" in body and "cases" in body


# ── the student's own values come from the student's own reads ───────────────

def test_a_new_attempt_moves_the_cases_list_and_the_mastery_value_together():
    """The contradiction that made the obvious fix wrong.

    The cohort scan is cached for 45s; db.get_case_results is not. Sourcing the student's
    OWN figure from the scan meant a just-finished station appeared in `cases` while
    `osce_mastery.value` still showed the pre-attempt number — one page disagreeing with
    itself, which is worse than a page that is uniformly stale.

    Here the cohort scan still has only s1's original 90 (_CASES), while their own read has
    since gained a 40. Both panels must reflect the 40.
    """
    extra = [patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[
        {"student_id": "s1", "case_id": "c1", "score_100": 90, "passed": True, "safe": True},
        {"student_id": "s1", "case_id": "c2", "score_100": 40, "passed": False, "safe": True},
    ]))]
    body = _get(extra=extra).json()
    assert [c["case_id"] for c in body["cases"]] == ["c1", "c2"]
    # (90 + 40) / 2. Sourced from the cohort scan this would still read 90.0.
    assert body["mastery"]["osce_mastery"]["value"] == 65.0
    # ...and the peer mean is untouched by the student's own movement.
    assert body["mastery"]["osce_mastery"]["cohort_avg"] == 45.0


def test_the_flashcard_value_matches_the_accuracy_panel_on_the_same_page():
    # Same contract for the second scale: flashcard_accuracy renders from this student's own
    # attempts, so the mastery value must come from that read too. The rows are raw now —
    # the handler aggregates them itself, because get_topic_accuracy discarded the `ts`.
    attempts = ([{"topic_tag": "red_eye", "correct": i < 3} for i in range(4)]
                + [{"topic_tag": "glaucoma", "correct": i < 1} for i in range(6)])
    extra = [patch("tools.shared.db.get_flashcard_attempts",
                   new=AsyncMock(return_value=attempts))]
    body = _get(extra=extra).json()
    # Whole bucket, not just `correct`: the in-process aggregation has to stay shape-identical
    # to db.get_topic_accuracy, which is what the console's accuracy bars are built on.
    assert body["flashcard_accuracy"]["red_eye"] == {"correct": 3, "total": 4, "pct": 75.0}
    assert body["flashcard_accuracy"]["glaucoma"] == {"correct": 1, "total": 6, "pct": 16.7}
    # 4 of 10 attempts — the whole bank behind the panel above, not the cohort scan, which
    # has no flashcard rows for s1 at all.
    assert body["mastery"]["flashcard_mastery"]["value"] == 40.0


def test_the_retention_value_matches_the_retention_panel_on_the_same_page():
    # And the third: retention_scores renders from get_profile, so the value follows it.
    extra = [patch("tools.api.routers.admin.get_profile", new=AsyncMock(return_value={
        "student_id": "s1", "role": "OA", "retention_scores": {"red_eye": 0.2},
    }))]
    body = _get(extra=extra).json()
    assert body["retention_scores"] == {"red_eye": 0.2}
    # 20.0 from the profile on this page, not 80.0 from s1's row in the cohort scan.
    assert body["mastery"]["retention_mastery"]["value"] == 20.0


def test_detail_findings_say_the_flashcard_read_failed():
    """The detail page's findings are the same sentences /insights feeds the model, so a
    swallowed read must not surface here as "no attempts" either."""
    extra = [patch("tools.shared.db.get_flashcard_attempts",
                   new=AsyncMock(side_effect=Exception("no table")))]
    r = _get(extra=extra)
    assert r.status_code == 200
    text = next(f["text"] for f in r.json()["insights"]["findings"]
                if f["feature"] == "Flashcards")
    assert "could not be read" in text.lower(), text
    assert "No flashcard attempts logged" not in text


def test_the_student_is_not_counted_among_their_own_peers():
    # s1 is in the cohort profiles, so they must gate IN — but their cached row must not
    # reach the peer average. Peers are s2 (60) and s3 (30); s1's own 90 must not appear.
    body = _get().json()
    assert body["mastery"]["osce_mastery"]["cohort_avg"] == 45.0
    assert body["mastery"]["osce_mastery"]["peers_n"] == 2
