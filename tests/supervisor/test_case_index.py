"""The analytics case index: correct groups, built off the event loop, built once.

`case_progress` carries only `case_id`, so every P2 aggregate buckets attempts through
this map. Three failure modes it has to be immune to:

1. Building it inside a request. `list_available_cases()` re-globs cases/ and `load_case()`
   reads a file with no cache (tools/cases/load_case.py:20,44) — 155 blocking reads on the
   single prod uvicorn worker would stall every concurrent request (invariant #1).
2. Building it N times. Without single-flight, N concurrent cold requests each re-read the
   whole library.
3. Grouping differently from the student-facing case list. Trainers and students must see
   the same topic groups, so this asserts the index against the REAL 155 files using
   production's precedence (tools/api/routers/cases.py:334,397).
"""
import asyncio
import threading
import time
from unittest.mock import patch

import pytest

from tools.cases.load_case import list_available_cases, load_case
from tools.cases.topic_sets import case_pool, case_visible, label_for, resolve_set
from tools.supervisor import case_index
from tools.supervisor.case_index import classify_case


@pytest.fixture(autouse=True)
def _fresh_index():
    """Reset the per-worker cache AND its lock around every test.

    pytest-asyncio gives each test its own event loop, and `asyncio.Lock` binds to the
    loop of its first *contended* acquire (`_LoopBoundMixin`), so the single-flight test
    below would otherwise poison the lock for any later contended test in the suite.
    """
    case_index._INDEX = None
    case_index._INDEX_LOCK = asyncio.Lock()
    yield
    case_index._INDEX = None
    case_index._INDEX_LOCK = asyncio.Lock()


@pytest.mark.asyncio
async def test_case_index_built_off_event_loop():
    loop_thread = threading.get_ident()
    read_on: list[int] = []

    def _fake_load(case_id: str) -> dict:
        read_on.append(threading.get_ident())
        return {
            "case_id": case_id, "role": "OA",
            "topic": "history_taking_basics", "difficulty": "beginner",
        }

    with patch("tools.supervisor.case_index.list_available_cases", return_value=["case_oa_001"]), \
         patch("tools.supervisor.case_index.load_case", side_effect=_fake_load):
        index = await case_index.get_case_index()

    assert index["case_oa_001"]["set_key"] == "history_taking"
    assert read_on, "load_case was never called — the index did not actually build"
    assert all(t != loop_thread for t in read_on), (
        "case files were read on the event-loop thread; on the single prod uvicorn worker "
        "that stalls every concurrent request (invariant #1)"
    )


@pytest.mark.asyncio
async def test_case_index_single_flight():
    builds: list[int] = []

    def _slow_build() -> dict:
        builds.append(1)
        time.sleep(0.05)  # widen the window so all five callers overlap the build
        return {"case_oa_001": {
            "pool": "CLINICAL", "set_key": "history_taking",
            "label": "History Taking", "difficulty": "beginner",
        }}

    with patch("tools.supervisor.case_index._build_case_index", side_effect=_slow_build):
        results = await asyncio.gather(*[case_index.get_case_index() for _ in range(5)])

    assert len(builds) == 1, f"index rebuilt {len(builds)}x under concurrency; single-flight is broken"
    # Same object, not merely equal: the map is published by one whole-dict rebind, so no
    # caller can ever observe a half-filled index and mis-bucket attempts as unclassified.
    assert all(r is results[0] for r in results)


@pytest.mark.asyncio
async def test_case_index_matches_student_case_list_grouping():
    index = await case_index.get_case_index()

    case_ids = list_available_cases()
    cases = [load_case(cid) for cid in case_ids]

    assert len(index) == len(case_ids), (
        "a case in cases/ could not be classified and was dropped from analytics; give it "
        "an explicit `topic_set` (a new content topic must fail CI, never vanish silently)"
    )

    # The student list groups by the STUDENT's role; the index groups by the CASE's role.
    # Those agree only because no case is role-neutral — `resolve_set` buckets within a
    # pool, so an "any" case would group differently for a CLINICAL vs an OT student.
    # Pinned here so that assumption fails loudly the day someone authors one.
    assert not any((c.get("role") or "any") == "any" for c in cases)

    for c in cases:
        expected = c.get("topic_set") or resolve_set(c["role"], c.get("topic", ""))
        entry = index[c["case_id"]]
        assert entry["set_key"] == expected, f"{c['case_id']}: {entry['set_key']} != {expected}"
        assert entry["pool"] == case_pool(c["role"])
        assert entry["label"] == label_for(c["role"], expected)
        assert entry["difficulty"] == c.get("difficulty", "beginner")

    # Replay the student-facing case list verbatim (tools/api/routers/cases.py:334) for one
    # student role per pool: same visibility filter, same precedence, same answer.
    for student_role in ("OA", "OT"):
        for c in cases:
            if not case_visible(student_role, c.get("role", "any") or "any"):
                continue
            student_sk = c.get("topic_set") or resolve_set(student_role, c.get("topic", ""))
            assert index[c["case_id"]]["set_key"] == student_sk

    # The one real case whose topic matches no rule: `resolve_set` would file it under OT
    # `screening` via _DEFAULT; its declared `topic_set` is why precedence order matters.
    hazard = "case_ot_045_hirschberg_krimsky_child_esotropia"
    assert hazard in index
    assert case_index.resolve_set_strict("OT", "hirschberg_krimsky_strabismus_child") is None
    assert resolve_set("OT", "hirschberg_krimsky_strabismus_child") == "screening"
    assert index[hazard]["set_key"] == "orthoptics"


@pytest.mark.asyncio
async def test_phantom_topic_set_rejected():
    """An unknown `topic_set` must fail closed, never invent a topic group.

    `label_for` title-cases anything it's given, so a misspelled/garbage `topic_set`
    would otherwise render in the trainer console as a legitimate-looking group holding
    a real slice of cohort attempts.
    """
    assert case_index.classify_case({
        "case_id": "c1", "role": "OT", "topic": "hirschberg", "topic_set": "orthoptic",
    }) is None
    # Non-string garbage must be equally rejected, not stringified into a fake key.
    assert case_index.classify_case({
        "case_id": "c2", "role": "OT", "topic": "hirschberg", "topic_set": 123,
    }) is None

    files = {
        "case_ot_typo": {
            "case_id": "case_ot_typo", "role": "OT",
            "topic": "hirschberg", "topic_set": "orthoptic", "difficulty": "beginner",
        },
    }
    with patch("tools.supervisor.case_index.list_available_cases", return_value=list(files)), \
         patch("tools.supervisor.case_index.load_case", side_effect=lambda cid: files[cid]):
        index = await case_index.get_case_index()

    assert "case_ot_typo" not in index


@pytest.mark.asyncio
async def test_unclassifiable_case_excluded():
    files = {
        "case_oa_ok": {
            "case_id": "case_oa_ok", "role": "OA",
            "topic": "tonometry_goldmann", "difficulty": "intermediate",
        },
        "case_oa_mystery": {
            "case_id": "case_oa_mystery", "role": "OA",
            "topic": "underwater_basket_weaving", "difficulty": "beginner",
        },
    }

    with patch("tools.supervisor.case_index.list_available_cases", return_value=list(files)), \
         patch("tools.supervisor.case_index.load_case", side_effect=lambda cid: files[cid]):
        index = await case_index.get_case_index()

    assert index["case_oa_ok"] == {
        "pool": "CLINICAL", "set_key": "tonometry_iop",
        "label": "Intraocular Pressure", "difficulty": "intermediate",
        "topic": "tonometry_goldmann",
        # Keyword-matched to a real checklist, so its attempts can carry a safety fail.
        "has_critical": True,
    }
    # Fail closed. `resolve_set` never says "no match" — it would file this unrelated case
    # into History Taking and move that group's cohort score.
    assert "case_oa_mystery" not in index
    assert resolve_set("OA", "underwater_basket_weaving") == "history_taking"
    assert case_index.resolve_set_strict("OA", "underwater_basket_weaving") is None


@pytest.mark.asyncio
async def test_one_bad_file_does_not_cost_the_other_154(caplog):
    """A single unreadable file among many must not shrink the index beyond itself, and
    the drop must be counted and logged — a short index is otherwise wrong numbers that
    don't look wrong, and CI cannot cover a Dockerfile COPY drift that ships a partial
    cases/ directory."""
    good_ids = [f"case_oa_good_{i:03d}" for i in range(154)]
    ids = good_ids + ["case_oa_bad"]

    def _load(cid: str) -> dict:
        if cid == "case_oa_bad":
            raise FileNotFoundError("renamed/missing on disk")
        return {"case_id": cid, "role": "OA", "topic": "tonometry_goldmann", "difficulty": "beginner"}

    with caplog.at_level("WARNING", logger="eyebot.case_index"), \
         patch("tools.supervisor.case_index.list_available_cases", return_value=ids), \
         patch("tools.supervisor.case_index.load_case", side_effect=_load):
        index = await case_index.get_case_index()

    assert len(index) == 154
    assert all(cid in index for cid in good_ids)
    assert "case_oa_bad" not in index

    warnings = [r for r in caplog.records if r.name == "eyebot.case_index"]
    assert len(warnings) == 1, "expected exactly one warning for the whole build"
    msg = warnings[0].getMessage()
    assert "1" in msg and "155" in msg, f"warning should name both counts, got: {msg!r}"


@pytest.mark.asyncio
async def test_no_warning_logged_when_nothing_dropped(caplog):
    """A clean build must stay silent — a warning on every boot would train trainers/ops
    to ignore it, defeating the point of logging a drop at all."""
    with caplog.at_level("WARNING", logger="eyebot.case_index"), \
         patch("tools.supervisor.case_index.list_available_cases", return_value=["case_oa_ok"]), \
         patch("tools.supervisor.case_index.load_case", return_value={
             "case_id": "case_oa_ok", "role": "OA",
             "topic": "tonometry_goldmann", "difficulty": "beginner",
         }):
        await case_index.get_case_index()

    assert not [r for r in caplog.records if r.name == "eyebot.case_index"]


@pytest.mark.asyncio
async def test_index_keys_on_the_stripped_case_id():
    """A JSON with padded `case_id` whitespace must be indexed under the CANONICAL
    (stripped) id. `classify_case` validates the stripped form, so a padded id passes
    validation; if the index then keyed on the un-stripped form it could never match a
    `case_progress.case_id` (which is never padded), and the attempt would silently
    bucket as unclassified forever."""
    files = {
        "case_oa_padded": {
            "case_id": "  case_oa_padded  ", "role": "OA",
            "topic": "tonometry_goldmann", "difficulty": "beginner",
        },
    }
    with patch("tools.supervisor.case_index.list_available_cases", return_value=list(files)), \
         patch("tools.supervisor.case_index.load_case", side_effect=lambda cid: files[cid]):
        index = await case_index.get_case_index()

    assert "case_oa_padded" in index
    assert "  case_oa_padded  " not in index


@pytest.mark.asyncio
async def test_failed_build_leaves_cache_retryable_not_poisoned():
    """The invariant that matters most after Fix 1: a failed build must leave `_INDEX`
    at None (retryable), never cache a poisoned empty dict. A future refactor that
    caught TimeoutError/Exception and cached `{}` would make every attempt bucket as
    unclassified — forever, silently, with a green suite — so this pins the raise AND
    the None, then proves a subsequent call actually retries instead of reusing a bad
    cached value."""
    with patch("tools.supervisor.case_index._build_case_index",
               side_effect=RuntimeError("disk unavailable")):
        with pytest.raises(RuntimeError, match="disk unavailable"):
            await case_index.get_case_index()

    assert case_index._INDEX is None, "a failed build must not poison the cache"

    good_result = {"case_oa_001": {
        "pool": "CLINICAL", "set_key": "history_taking",
        "label": "History Taking", "difficulty": "beginner",
    }}
    with patch("tools.supervisor.case_index._build_case_index", return_value=good_result):
        index = await case_index.get_case_index()

    assert index == good_result, "the retry after a failed build must actually rebuild"


def test_classify_case_rejects_role_any():
    """role='any' is valid content for the student-facing case list, but CLINICAL and
    OT can resolve the same topic to different sets, so a role-neutral case has no
    single correct analytics group and must be rejected here."""
    assert case_index.classify_case({
        "case_id": "case_x", "role": "any", "topic": "tonometry",
    }) is None


def test_classify_case_rejects_missing_or_blank_case_id():
    assert case_index.classify_case({"role": "OA", "topic": "tonometry"}) is None
    assert case_index.classify_case({
        "case_id": "", "role": "OA", "topic": "tonometry",
    }) is None
    assert case_index.classify_case({
        "case_id": "   ", "role": "OA", "topic": "tonometry",
    }) is None


def test_classify_case_carries_the_raw_topic():
    """The station axis of the knowledge x performance map joins on the case's own topic
    string, not on the coarse topic-SET label -- flashcard topic_tags look like "tonometry",
    not like "history_taking"."""
    entry = classify_case({
        "case_id": "case_oa_001_poag",
        "role": "OA",
        "topic": "Tonometry",
        "topic_set": "tonometry_iop",
        "difficulty": "beginner",
    })
    assert entry is not None
    assert entry["topic"] == "Tonometry"


def test_classify_case_topic_defaults_to_empty_not_missing():
    """An entry always HAS the key, so a consumer never has to distinguish 'no topic' from
    'old index shape'."""
    entry = classify_case({
        "case_id": "case_oa_002",
        "role": "OA",
        "topic_set": "tonometry_iop",
        "difficulty": "beginner",
    })
    assert entry is not None
    assert entry["topic"] == ""
