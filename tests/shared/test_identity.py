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
async def test_get_or_create_student_defers_to_winner_on_insert_conflict():
    """Two concurrent first-logins race: both miss the email lookup and try to create.
    Once UNIQUE(lower(email)) exists, the loser's insert raises — it must re-read by email
    and return the WINNER's id, never a second uuid (which would strand the person's data
    under a duplicate identity and re-fire onboarding)."""
    from unittest.mock import AsyncMock
    winner = {"student_id": "winner-id", "email": "race@test.com", "student_name": "Ray"}
    get_mock = AsyncMock(side_effect=[None, winner])   # miss, then the winner on re-read
    upsert_mock = AsyncMock(side_effect=Exception("duplicate key value violates unique constraint"))
    with patch("tools.shared.db.get_consent_by_email", new=get_mock), \
         patch("tools.shared.db.upsert_consent", new=upsert_mock):
        from tools.shared.identity import get_or_create_student
        student_id, name = await get_or_create_student("Ray", "race@test.com")
    assert student_id == "winner-id"
    assert name == "Ray"


@pytest.mark.asyncio
async def test_get_or_create_student_reraises_when_create_fails_with_no_winner():
    """A genuine write failure (not a race) must not be swallowed into a bogus id: if the
    insert fails AND no row appears on re-read, surface the error rather than mint a fresh
    id that nothing else can find."""
    get_mock = AsyncMock(side_effect=[None, None])
    upsert_mock = AsyncMock(side_effect=Exception("connection reset"))
    with patch("tools.shared.db.get_consent_by_email", new=get_mock), \
         patch("tools.shared.db.upsert_consent", new=upsert_mock):
        from tools.shared.identity import get_or_create_student
        with pytest.raises(Exception):
            await get_or_create_student("Nemo", "nemo@test.com")


@pytest.mark.asyncio
async def test_sync_roster_name_heals_a_stale_stored_name():
    """The admin owns the name — a correction in the roster must overwrite the snapshot
    taken at first login, or /api/auth/me keeps serving the old one forever."""
    with patch("tools.shared.db.update_consent", new=AsyncMock()) as mock_update:
        from tools.shared.identity import sync_roster_name
        name = await sync_roster_name("stu-abc", "Jhon Tan", "John Tan")
    assert name == "John Tan"
    mock_update.assert_awaited_once()
    assert mock_update.await_args[1]["student_name"] == "John Tan"


@pytest.mark.asyncio
async def test_sync_roster_name_no_write_when_already_equal():
    """Login runs this every time — it must not write on every login."""
    with patch("tools.shared.db.update_consent", new=AsyncMock()) as mock_update:
        from tools.shared.identity import sync_roster_name
        name = await sync_roster_name("stu-abc", "John Tan", "John Tan")
    assert name == "John Tan"
    mock_update.assert_not_awaited()


@pytest.mark.asyncio
async def test_sync_roster_name_keeps_stored_name_when_no_roster_row():
    """Staff have no approved_students row. With no authoritative name there is nothing
    to heal with — their stored name must survive untouched, not be blanked."""
    with patch("tools.shared.db.update_consent", new=AsyncMock()) as mock_update:
        from tools.shared.identity import sync_roster_name
        name = await sync_roster_name("stu-abc", "Coach Lim", "")
    assert name == "Coach Lim"
    mock_update.assert_not_awaited()


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
