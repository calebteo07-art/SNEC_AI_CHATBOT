"""Unit tests for tools/shared/identity.py — async Supabase identity manager."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_get_or_create_student_returns_existing_id():
    existing = {"student_id": "stu-abc", "email": "a@test.com", "student_name": "Alice"}
    with patch("tools.shared.db.get_consent_by_email", new=AsyncMock(return_value=existing)):
        from tools.shared.identity import get_or_create_student
        student_id, name = await get_or_create_student("Alice", "a@test.com")
    assert student_id == "stu-abc"
    assert name == "Alice"


@pytest.mark.asyncio
async def test_get_or_create_student_stored_name_beats_caller_seed():
    """The stored consent name is the identity of record and must win over whatever
    the caller guessed — login passes the raw email for staff, who have no roster row."""
    existing = {"student_id": "stu-abc", "email": "coach@test.com", "student_name": "Coach Lim"}
    with patch("tools.shared.db.get_consent_by_email", new=AsyncMock(return_value=existing)):
        from tools.shared.identity import get_or_create_student
        student_id, name = await get_or_create_student("coach@test.com", "coach@test.com")
    assert student_id == "stu-abc"
    assert name == "Coach Lim"


@pytest.mark.asyncio
async def test_get_or_create_student_creates_new_row_when_missing():
    with patch("tools.shared.db.get_consent_by_email", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.upsert_consent", new=AsyncMock()) as mock_upsert:
        from tools.shared.identity import get_or_create_student
        student_id, name = await get_or_create_student("Bob", "b@test.com")
    assert len(student_id) == 36  # UUID format
    assert name == "Bob"
    mock_upsert.assert_called_once()
    call_kwargs = mock_upsert.call_args
    assert call_kwargs[1]["student_name"] == "Bob"
    assert call_kwargs[1]["email"] == "b@test.com"


@pytest.mark.asyncio
async def test_has_consented_returns_false_when_no_row():
    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=None)):
        from tools.shared.identity import has_consented
        result = await has_consented("stu-001")
    assert result is False


@pytest.mark.asyncio
async def test_has_consented_returns_false_when_no_consent_date():
    row = {"student_id": "stu-001", "consent_date": None, "withdrawn_date": None}
    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=row)):
        from tools.shared.identity import has_consented
        result = await has_consented("stu-001")
    assert result is False


@pytest.mark.asyncio
async def test_has_consented_returns_true_when_consent_date_set():
    row = {"student_id": "stu-001", "consent_date": "2026-01-01T00:00:00Z", "withdrawn_date": None}
    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=row)):
        from tools.shared.identity import has_consented
        result = await has_consented("stu-001")
    assert result is True


@pytest.mark.asyncio
async def test_has_consented_returns_false_when_withdrawn():
    row = {"student_id": "stu-001", "consent_date": "2026-01-01T00:00:00Z", "withdrawn_date": "2026-02-01T00:00:00Z"}
    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=row)):
        from tools.shared.identity import has_consented
        result = await has_consented("stu-001")
    assert result is False


@pytest.mark.asyncio
async def test_record_consent_sets_consent_date_and_pdpa_version():
    with patch("tools.shared.db.update_consent", new=AsyncMock()) as mock_update:
        from tools.shared.identity import record_consent
        await record_consent("stu-001")
    call_kwargs = mock_update.call_args[1]
    assert call_kwargs["pdpa_version"] == "1.0"
    assert "consent_date" in call_kwargs
    assert call_kwargs["withdrawn_date"] is None


@pytest.mark.asyncio
async def test_withdraw_consent_sets_withdrawn_date():
    with patch("tools.shared.db.update_consent", new=AsyncMock()) as mock_update:
        from tools.shared.identity import withdraw_consent
        await withdraw_consent("stu-001")
    call_kwargs = mock_update.call_args[1]
    assert "withdrawn_date" in call_kwargs
