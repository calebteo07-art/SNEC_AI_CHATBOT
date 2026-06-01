"""Unit tests for tools/shared/db.py — async Supabase PostgreSQL client."""
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
