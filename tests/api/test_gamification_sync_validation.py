"""POST /api/gamification/sync must not accept a hostile retention write.

`topic` and `score` land in `student_profiles.retention_scores` (update_profile.py),
a column every staff-facing reader treats as a **0-1 fraction under a real topic key**:
mastery multiplies it by 100, weak_topics compares it against WEAK_THRESHOLD, and the
cohort/report/progress readers average it raw. `xp_delta` beside them has been clamped
since the anti-abuse pass; these two were passed straight through, so a tampered client
could put an arbitrary number under an arbitrary key in front of a trainer — and an
unrecognised key is PERMANENT (it becomes a retention_scores entry, and under the
threshold a weak_topics entry too).

Rejected at the boundary rather than silently clamped: no production caller sends either
field (the only live sender is the tutor chat, which posts xp_delta/hearts_used alone), so
anything out of range is tampering and should fail loudly. update_profile clamps as well —
it is the shared write for the two callers that legitimately carry a score.

Every db.* seam is stubbed: the handler both reads and WRITES the live profile.
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _cookie(sid="stu_sync", role="student", srole="OA"):
    return {"eyebot_token": create_access_token(sid, role, srole)}


@pytest.fixture
def synced():
    """Patch the handler's profile read + write; yields the update_profile mock."""
    profile = {"xp": 100, "hearts": 5, "streak": 0, "checkin_history": []}
    with patch("tools.api.routers.student.update_profile", new=AsyncMock()) as upd, \
         patch("tools.api.routers.student.get_profile", new=AsyncMock(return_value=profile)):
        yield upd


def _post(body):
    return client.post("/api/gamification/sync", json=body, cookies=_cookie())


@pytest.mark.parametrize("score", [1.5, 100.0, -0.5, -5.0])
def test_sync_rejects_an_out_of_range_score(synced, score):
    r = _post({"xp_delta": 0, "hearts_used": 0, "topic": "glaucoma", "score": score})
    assert r.status_code == 422
    synced.assert_not_awaited()


@pytest.mark.parametrize("score", [0.0, 0.5, 1.0])
def test_sync_accepts_a_fraction(synced, score):
    r = _post({"xp_delta": 0, "hearts_used": 0, "topic": "glaucoma", "score": score})
    assert r.status_code == 200
    assert synced.await_args.kwargs["score"] == score


@pytest.mark.parametrize("topic", ["", "not_a_topic", "<script>alert(1)</script>", "../../etc"])
def test_sync_rejects_a_topic_outside_the_flashcard_namespace(synced, topic):
    r = _post({"xp_delta": 0, "hearts_used": 0, "topic": topic, "score": 0.5})
    assert r.status_code == 422
    synced.assert_not_awaited()


@pytest.mark.parametrize("topic", ["glaucoma", "oct_macula", "glaucoma__easy"])
def test_sync_accepts_a_real_flashcard_topic(synced, topic):
    r = _post({"xp_delta": 0, "hearts_used": 0, "topic": topic, "score": 0.5})
    assert r.status_code == 200
    assert synced.await_args.kwargs["topic"] == topic


def test_sync_still_accepts_the_live_payload(synced):
    """The only shape production sends: XP alone, no retention write."""
    r = _post({"xp_delta": 5, "hearts_used": 0})
    assert r.status_code == 200
    assert synced.await_args.kwargs["topic"] is None
    assert synced.await_args.kwargs["score"] is None


def test_sync_accepts_an_explicit_null_topic(synced):
    """A null topic means "no retention write", not "an unknown topic".

    Worth its own case: pydantic skips a field_validator for an OMITTED field, so the
    test above never reaches the validator at all — only an explicit null does.
    """
    r = _post({"xp_delta": 5, "hearts_used": 0, "topic": None, "score": None})
    assert r.status_code == 200
    assert synced.await_args.kwargs["topic"] is None
