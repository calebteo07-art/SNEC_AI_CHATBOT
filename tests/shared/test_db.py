"""Unit tests for tools/shared/db.py — async Supabase PostgreSQL client."""
import os

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import tools.shared.db as db


def _make_client(rows: list) -> MagicMock:
    """Return a mock Supabase client whose execute() returns the given rows.

    Uses MagicMock (not AsyncMock) for the client and table chain so that
    synchronous builder calls like client.table(...).select(...) work correctly.
    Only execute() is async, matching real supabase-py 2.x behaviour.
    """
    response = MagicMock()
    response.data = rows
    execute = AsyncMock(return_value=response)

    client = MagicMock()
    table = client.table.return_value
    table.select.return_value.eq.return_value.limit.return_value.execute = execute
    table.select.return_value.eq.return_value.order.return_value.limit.return_value.execute = execute
    table.select.return_value.eq.return_value.execute = execute
    table.upsert.return_value.execute = execute
    table.update.return_value.eq.return_value.execute = execute
    table.insert.return_value.execute = execute
    table.select.return_value.execute = execute          # for get_all_* functions
    table.select.return_value.order.return_value.execute = execute
    table.delete.return_value.eq.return_value.execute = execute  # for delete_* functions
    return client


@pytest.mark.asyncio
async def test_get_auth_returns_row_when_found():
    row = {"email": "a@b.com", "password_hash": "hashed", "must_change": True}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_auth("a@b.com")
    assert result == row


@pytest.mark.asyncio
async def test_get_auth_returns_none_when_not_found():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_auth("missing@b.com")
    assert result is None


@pytest.mark.asyncio
async def test_get_profile_returns_row_when_found():
    row = {"student_id": "stu-001", "role": "OA", "session_count": 3,
           "weak_topics": ["glaucoma"], "missed_findings": [], "retention_scores": {}}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_profile("stu-001")
    assert result["role"] == "OA"
    assert result["session_count"] == 3


@pytest.mark.asyncio
async def test_get_profile_returns_none_when_not_found():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_profile("unknown")
    assert result is None


@pytest.mark.asyncio
async def test_insert_session_writes_to_chat_sessions_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_session("stu-001", "glaucoma", "discussed IOP", 120, "gemini-2.5-flash")
    client.table.assert_called_with("chat_sessions")
    client.table.return_value.insert.assert_called_once()
    payload = client.table.return_value.insert.call_args[0][0]
    assert payload["student_id"] == "stu-001"
    assert payload["topic"] == "glaucoma"
    assert payload["token_count"] == 120


@pytest.mark.asyncio
async def test_get_sessions_returns_list():
    rows = [{"session_id": "s1", "topic": "glaucoma"}, {"session_id": "s2", "topic": "AMD"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client(rows))):
        result = await db.get_sessions("stu-001")
    assert len(result) == 2
    assert result[0]["topic"] == "glaucoma"


@pytest.mark.asyncio
async def test_get_sessions_returns_empty_list_when_none():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_sessions("stu-001")
    assert result == []


@pytest.mark.asyncio
async def test_insert_case_result_writes_to_case_progress_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_case_result("stu-001", "case_oa_001_history_triage", 32, True)
    client.table.assert_called_with("case_progress")
    payload = client.table.return_value.insert.call_args[0][0]
    assert payload["case_id"] == "case_oa_001_history_triage"
    assert payload["passed"] is True
    assert payload["total_score"] == 32


@pytest.mark.asyncio
async def test_get_case_results_returns_list():
    rows = [{"case_id": "case_oa_001", "passed": True, "total_score": 32}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client(rows))):
        result = await db.get_case_results("stu-001")
    assert result[0]["passed"] is True
    assert result[0]["total_score"] == 32


# ── approved_students ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_approved_returns_row_when_found():
    row = {"email": "a@test.com", "full_name": "Alice", "role": "OA", "student_id": None}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_approved("a@test.com")
    assert result == row


@pytest.mark.asyncio
async def test_get_approved_returns_none_when_not_found():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_approved("missing@test.com")
    assert result is None


@pytest.mark.asyncio
async def test_get_all_approved_returns_list():
    rows = [{"email": "a@test.com"}, {"email": "b@test.com"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client(rows))):
        result = await db.get_all_approved()
    assert len(result) == 2


@pytest.mark.asyncio
async def test_upsert_approved_writes_to_approved_students_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.upsert_approved("new@test.com", full_name="New", role="OT")
    client.table.assert_called_once_with("approved_students")
    payload = client.table.return_value.upsert.call_args[0][0]
    assert payload["email"] == "new@test.com"
    assert payload["role"] == "OT"


@pytest.mark.asyncio
async def test_delete_approved_returns_true_when_deleted():
    client = _make_client([{"email": "gone@test.com"}])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        result = await db.delete_approved("gone@test.com")
    client.table.assert_called_once_with("approved_students")
    assert result is True


@pytest.mark.asyncio
async def test_delete_approved_returns_false_when_not_found():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        result = await db.delete_approved("nobody@test.com")
    client.table.assert_called_once_with("approved_students")
    assert result is False


@pytest.mark.asyncio
async def test_get_active_profiles_excludes_revoked_and_unmatched():
    """A profile only counts as active if its consent email is still in
    approved_students. Revoking access (deleting the approved row) or a profile with
    no matching consent email drops it — so cohort/leaderboard roll-ups shed it at once."""
    profiles = [
        {"student_id": "s1", "xp": 100},
        {"student_id": "s2", "xp": 200},   # access revoked (email not in approved)
        {"student_id": "s3", "xp": 50},    # no consent row at all
    ]
    approved = [{"email": "a@test.com"}]   # only s1's email remains approved
    consent = [
        {"student_id": "s1", "email": " A@test.com ", "student_name": "Ann"},  # case/space-insensitive match
        {"student_id": "s2", "email": "b@test.com", "student_name": "Bob"},
    ]
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=profiles)), \
         patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=approved)), \
         patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=consent)):
        result = await db.get_active_profiles()
    assert {p["student_id"] for p in result} == {"s1"}


@pytest.mark.asyncio
async def test_get_staff_roster_joins_profiles_and_flags_pending():
    """The analytics Staff section: every supervisors row (+ SUPER_ADMIN_EMAIL) with
    profile stats where they've logged in, else status='pending' (email + role only).
    Students are excluded; a legacy 'supervisor' row normalises to 'trainer'."""
    supervisors = [
        {"email": "coach@test.com", "role": "trainer"},   # activated trainer
        {"email": "boss@test.com", "role": "admin"},       # activated admin
        {"email": "new@test.com", "role": "supervisor"},   # legacy role, never logged in
    ]
    consent = [
        {"student_id": "sup1", "email": "Coach@test.com", "student_name": "Coach Lee"},  # case-insensitive
        {"student_id": "sup2", "email": "boss@test.com", "student_name": "Boss Tan"},
        {"student_id": "stu9", "email": "student@test.com", "student_name": "A Student"},
    ]
    profiles = [
        {"student_id": "sup1", "session_count": 7, "streak": 3, "last_active": "2026-07-10"},
        {"student_id": "sup2", "session_count": 0, "streak": 0, "last_active": ""},
        {"student_id": "stu9", "session_count": 20, "streak": 5, "last_active": "2026-07-16"},
    ]
    with patch("tools.shared.db.get_all_supervisors", new=AsyncMock(return_value=supervisors)), \
         patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=consent)), \
         patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=profiles)), \
         patch.dict(os.environ, {"SUPER_ADMIN_EMAIL": "super@test.com"}):
        result = await db.get_staff_roster()
    by_email = {r["email"]: r for r in result}
    # A student (not in supervisors, not super-admin) never appears here.
    assert "student@test.com" not in by_email
    # Activated trainer carries profile stats + the identity-of-record name.
    assert by_email["coach@test.com"]["role"] == "trainer"
    assert by_email["coach@test.com"]["status"] == "active"
    assert by_email["coach@test.com"]["session_count"] == 7
    assert by_email["coach@test.com"]["full_name"] == "Coach Lee"
    assert by_email["coach@test.com"]["student_id"] == "sup1"
    # 'admin' role passes through.
    assert by_email["boss@test.com"]["role"] == "admin"
    # Legacy 'supervisor' with no consent/profile → pending trainer, email only.
    assert by_email["new@test.com"]["role"] == "trainer"
    assert by_email["new@test.com"]["status"] == "pending"
    assert by_email["new@test.com"]["full_name"] == ""
    assert by_email["new@test.com"]["session_count"] == 0
    assert by_email["new@test.com"]["student_id"] == ""
    # SUPER_ADMIN_EMAIL is always present as an admin, even without a supervisors row.
    assert by_email["super@test.com"]["role"] == "admin"
    assert by_email["super@test.com"]["status"] == "pending"


# ── leaderboard read fan-out (hot path — dedup guarantee) ──────────────────────

@pytest.mark.asyncio
async def test_get_active_leaderboard_profiles_reads_each_table_once():
    """The leaderboard is the busiest read endpoint; get_active_leaderboard_profiles must
    not scan any base table twice. It historically called get_active_profiles (which reads
    profiles+approved+consent) and THEN re-read profiles+consent for staff augmentation —
    2x profiles, 2x consent per load. Assert each base read fires exactly once."""
    profiles = AsyncMock(return_value=[{"student_id": "s1", "xp": 10}])
    approved = AsyncMock(return_value=[{"email": "a@test.com"}])
    consent = AsyncMock(return_value=[{"student_id": "s1", "email": "a@test.com", "student_name": "Ann"}])
    supervisors = AsyncMock(return_value=[])
    with patch("tools.shared.db.get_all_profiles", new=profiles), \
         patch("tools.shared.db.get_all_approved", new=approved), \
         patch("tools.shared.db.get_all_consent", new=consent), \
         patch("tools.shared.db.get_all_supervisors", new=supervisors):
        await db.get_active_leaderboard_profiles()
    assert profiles.await_count == 1, f"profiles scanned {profiles.await_count}x"
    assert consent.await_count == 1, f"consent scanned {consent.await_count}x"
    assert approved.await_count == 1
    assert supervisors.await_count == 1


@pytest.mark.asyncio
async def test_get_active_leaderboard_profiles_combines_active_students_and_staff():
    """Output guard across the dedup refactor: active students (consent email still in
    approved_students) PLUS staff (supervisors + super-admin, matched via consent email),
    with a revoked student dropped and no double-count of a student who is also staff."""
    profiles = [
        {"student_id": "stu_1", "xp": 300},   # active student
        {"student_id": "gone_1", "xp": 999},  # access revoked
        {"student_id": "trn_1", "xp": 800},   # trainer (staff)
    ]
    approved = [{"email": "stu@test.com"}]     # only stu_1 approved
    consent = [
        {"student_id": "stu_1", "email": "stu@test.com", "student_name": "Sam"},
        {"student_id": "gone_1", "email": "gone@test.com", "student_name": "Rick"},
        {"student_id": "trn_1", "email": "trainer@test.com", "student_name": "Terry"},
    ]
    supervisors = [{"email": "trainer@test.com", "role": "trainer"}]
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=profiles)), \
         patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=approved)), \
         patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=consent)), \
         patch("tools.shared.db.get_all_supervisors", new=AsyncMock(return_value=supervisors)):
        result = await db.get_active_leaderboard_profiles()
    assert {p["student_id"] for p in result} == {"stu_1", "trn_1"}  # gone_1 revoked, no dupes


@pytest.mark.asyncio
async def test_get_active_leaderboard_profiles_staff_read_is_best_effort():
    """Core reads (profiles/approved/consent) give the active-student board; if only the
    staff augmentation read (supervisors) fails, the students still come back — never a 500."""
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=[{"student_id": "s1", "xp": 5}])), \
         patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=[{"email": "a@test.com"}])), \
         patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=[{"student_id": "s1", "email": "a@test.com", "student_name": "Ann"}])), \
         patch("tools.shared.db.get_all_supervisors", new=AsyncMock(side_effect=Exception("supervisors table down"))):
        result = await db.get_active_leaderboard_profiles()
    assert {p["student_id"] for p in result} == {"s1"}


# ── student_consent ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_consent_by_email_returns_row():
    row = {"student_id": "stu-001", "email": "a@test.com", "student_name": "Alice", "consent_date": None}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_consent_by_email("a@test.com")
    assert result["student_id"] == "stu-001"


@pytest.mark.asyncio
async def test_get_consent_by_email_returns_none_when_not_found():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_consent_by_email("nobody@test.com")
    assert result is None


@pytest.mark.asyncio
async def test_get_consent_by_student_id_returns_row():
    row = {"student_id": "stu-001", "email": "a@test.com", "consent_date": "2026-01-01"}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_consent_by_student_id("stu-001")
    assert result["email"] == "a@test.com"


@pytest.mark.asyncio
async def test_get_all_consent_returns_list():
    rows = [{"student_id": "s1"}, {"student_id": "s2"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client(rows))):
        result = await db.get_all_consent()
    assert len(result) == 2


@pytest.mark.asyncio
async def test_upsert_consent_writes_to_student_consent_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.upsert_consent("stu-001", student_name="Alice", email="a@test.com")
    client.table.assert_called_once_with("student_consent")
    payload = client.table.return_value.upsert.call_args[0][0]
    assert payload["student_id"] == "stu-001"
    assert payload["email"] == "a@test.com"


# ── supervisors ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_supervisor_returns_row():
    row = {"email": "sup@snec.com", "role": "supervisor"}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_supervisor("sup@snec.com")
    assert result["role"] == "supervisor"


@pytest.mark.asyncio
async def test_get_supervisor_returns_none_when_not_found():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_supervisor("nobody@snec.com")
    assert result is None


@pytest.mark.asyncio
async def test_get_all_supervisors_returns_list():
    rows = [{"email": "a@snec.com", "role": "supervisor"}, {"email": "b@snec.com", "role": "admin"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client(rows))):
        result = await db.get_all_supervisors()
    assert len(result) == 2


@pytest.mark.asyncio
async def test_upsert_supervisor_writes_to_supervisors_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.upsert_supervisor("sup@snec.com", role="admin")
    client.table.assert_called_once_with("supervisors")
    payload = client.table.return_value.upsert.call_args[0][0]
    assert payload["email"] == "sup@snec.com"
    assert payload["role"] == "admin"


@pytest.mark.asyncio
async def test_delete_supervisor_calls_delete_on_supervisors_table():
    client = _make_client([{"email": "sup@snec.com"}])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.delete_supervisor("sup@snec.com")
    client.table.assert_called_with("supervisors")


# ── flashcard_attempts (migration 010) ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_insert_flashcard_attempt_writes_to_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_flashcard_attempt("stu-001", "c1", "glaucoma", True, 20)
    client.table.assert_called_with("flashcard_attempts")
    payload = client.table.return_value.insert.call_args[0][0]
    assert payload == {"student_id": "stu-001", "card_id": "c1",
                       "topic_tag": "glaucoma", "correct": True, "score": 20}


@pytest.mark.asyncio
async def test_get_flashcard_attempts_returns_list():
    rows = [{"topic_tag": "glaucoma", "correct": True}]
    client = _make_client(rows)
    # get_flashcard_attempts uses select().eq().order().execute() (no limit) — wire it.
    resp = MagicMock(); resp.data = rows
    client.table.return_value.select.return_value.eq.return_value.order.return_value.execute = \
        AsyncMock(return_value=resp)
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        result = await db.get_flashcard_attempts("stu-001")
    assert result == rows


@pytest.mark.asyncio
async def test_get_topic_accuracy_aggregates_per_topic():
    attempts = [
        {"topic_tag": "glaucoma", "correct": True},
        {"topic_tag": "glaucoma", "correct": False},
        {"topic_tag": "amd", "correct": True},
    ]
    with patch("tools.shared.db.get_flashcard_attempts", new=AsyncMock(return_value=attempts)):
        acc = await db.get_topic_accuracy("stu-001")
    assert acc["glaucoma"] == {"correct": 1, "total": 2, "pct": 50.0}
    assert acc["amd"] == {"correct": 1, "total": 1, "pct": 100.0}


# ── case_progress rich grade (migration 011) ───────────────────────────────────

@pytest.mark.asyncio
async def test_insert_case_result_persists_rich_grade():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_case_result(
            "stu-001", "case_x", 32, True,
            score_100=80, safe=True, consult_technique=40, judgement_safety=40,
            missed_critical=["Measure IOP"], coaching={"focus": "escalate sooner"},
        )
    payload = client.table.return_value.insert.call_args[0][0]
    assert payload["score_100"] == 80
    assert payload["safe"] is True
    assert payload["consult_technique"] == 40
    assert payload["missed_critical"] == ["Measure IOP"]
    assert payload["coaching"] == {"focus": "escalate sooner"}


@pytest.mark.asyncio
async def test_insert_case_result_falls_back_to_base_when_columns_absent():
    client = _make_client([])
    resp = MagicMock(); resp.data = []
    # First (rich) insert raises as if score_100 is missing; the base insert succeeds.
    client.table.return_value.insert.return_value.execute = AsyncMock(
        side_effect=[Exception('column "score_100" does not exist'), resp]
    )
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_case_result("stu-001", "case_x", 32, True, score_100=80, safe=True)
    calls = client.table.return_value.insert.call_args_list
    assert len(calls) == 2
    assert calls[1][0][0] == {"student_id": "stu-001", "case_id": "case_x",
                              "total_score": 32, "passed": True}


# ── audit_events (migration 014 — durable audit trail) ─────────────────────────

@pytest.mark.asyncio
async def test_insert_audit_event_writes_row():
    """A durable audit event is inserted into audit_events with actor/action/target/ip."""
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_audit_event(action="promote", actor="user_001",
                                    target="coach@test.com", detail="role=trainer", ip="1.2.3.4")
    client.table.assert_called_with("audit_events")
    payload = client.table.return_value.insert.call_args[0][0]
    assert payload["action"] == "promote"
    assert payload["actor"] == "user_001"
    assert payload["target"] == "coach@test.com"
    assert payload["detail"] == "role=trainer"
    assert payload["ip"] == "1.2.3.4"


@pytest.mark.asyncio
async def test_insert_audit_event_is_best_effort_and_never_raises():
    """Audit is best-effort BY DESIGN: a DB failure (e.g. audit_events absent pre-migration
    014) must be swallowed so an audit write can never break the request that triggered it."""
    with patch("tools.shared.db._get_client",
               new=AsyncMock(side_effect=Exception("relation audit_events does not exist"))):
        await db.insert_audit_event(action="demote", actor="user_001")  # must NOT raise
