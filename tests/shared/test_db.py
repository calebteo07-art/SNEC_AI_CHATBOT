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
