# tests/shared/test_otp_store.py
"""Unit tests for tools.shared.otp_store.

The Supabase client is fully mocked — these tests never hit the network.
"""
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _future_iso(minutes: int = 15) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def _past_iso(minutes: int = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


def _make_mock_client(select_data: list[dict] | None = None):
    """Return a mock Supabase client whose table().upsert/select/delete chain works."""
    mock_client = MagicMock()

    mock_execute = MagicMock(return_value=MagicMock(data=[]))
    mock_client.table.return_value.upsert.return_value.execute = mock_execute

    select_result = MagicMock(data=select_data if select_data is not None else [])
    mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = select_result

    mock_client.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

    return mock_client


# ---------------------------------------------------------------------------
# set_otp
# ---------------------------------------------------------------------------

def test_set_otp_upserts_hash_not_plaintext():
    """set_otp must store the SHA-256 hash of the OTP, never the plaintext."""
    mock_client = _make_mock_client()

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import set_otp
        set_otp("alice@test.com", "123456")

    upsert_call_args = mock_client.table.return_value.upsert.call_args
    row = upsert_call_args[0][0]

    assert row["email"] == "alice@test.com"
    assert row["otp_hash"] == _sha256("123456")
    assert "123456" not in str(row)


def test_set_otp_stores_future_expiry():
    """set_otp must store an expires_at approximately 15 minutes in the future."""
    mock_client = _make_mock_client()

    before = datetime.now(timezone.utc)
    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import set_otp
        set_otp("bob@test.com", "999999")
    after = datetime.now(timezone.utc)

    upsert_call_args = mock_client.table.return_value.upsert.call_args
    row = upsert_call_args[0][0]

    expires = datetime.fromisoformat(row["expires_at"])
    assert before + timedelta(minutes=14) < expires < after + timedelta(minutes=16)


def test_set_otp_upserts_on_conflict_email():
    """set_otp must call upsert with on_conflict='email' so a second OTP overwrites the first."""
    mock_client = _make_mock_client()

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import set_otp
        set_otp("carol@test.com", "111111")

    upsert_call = mock_client.table.return_value.upsert.call_args
    kwargs = upsert_call[1]
    assert kwargs.get("on_conflict") == "email"


# ---------------------------------------------------------------------------
# verify_and_consume_otp
# ---------------------------------------------------------------------------

def test_verify_and_consume_correct_otp_returns_true():
    """Correct OTP within the expiry window must return True and delete the row."""
    stored_hash = _sha256("654321")
    row = {"email": "dave@test.com", "otp_hash": stored_hash, "expires_at": _future_iso()}
    mock_client = _make_mock_client(select_data=[row])

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("dave@test.com", "654321")

    assert result is True
    mock_client.table.return_value.delete.return_value.eq.assert_called_once_with(
        "email", "dave@test.com"
    )


def test_verify_and_consume_wrong_otp_returns_false():
    """Wrong OTP must return False and must NOT delete the row."""
    stored_hash = _sha256("correct")
    row = {"email": "eve@test.com", "otp_hash": stored_hash, "expires_at": _future_iso()}
    mock_client = _make_mock_client(select_data=[row])

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("eve@test.com", "wrong_otp")

    assert result is False
    mock_client.table.return_value.delete.assert_not_called()


def test_verify_and_consume_expired_otp_returns_false():
    """Expired OTP must return False and delete the row (clean up stale data)."""
    stored_hash = _sha256("777777")
    row = {"email": "frank@test.com", "otp_hash": stored_hash, "expires_at": _past_iso()}
    mock_client = _make_mock_client(select_data=[row])

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("frank@test.com", "777777")

    assert result is False
    mock_client.table.return_value.delete.return_value.eq.assert_called_once_with(
        "email", "frank@test.com"
    )


def test_verify_and_consume_no_row_returns_false():
    """No row in DB must return False without attempting a delete."""
    mock_client = _make_mock_client(select_data=[])

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("ghost@test.com", "000000")

    assert result is False
    mock_client.table.return_value.delete.assert_not_called()


# ---------------------------------------------------------------------------
# delete_otp
# ---------------------------------------------------------------------------

def test_delete_otp_calls_delete_on_correct_email():
    """delete_otp must issue a DELETE filtered by email."""
    mock_client = _make_mock_client()

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import delete_otp
        delete_otp("grace@test.com")

    mock_client.table.return_value.delete.return_value.eq.assert_called_once_with(
        "email", "grace@test.com"
    )
    mock_client.table.return_value.delete.return_value.eq.return_value.execute.assert_called_once()


# ---------------------------------------------------------------------------
# Upsert overwrites
# ---------------------------------------------------------------------------

def test_set_otp_twice_overwrites_first():
    """Calling set_otp twice for the same email must call upsert twice."""
    mock_client = _make_mock_client()

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import set_otp
        set_otp("henry@test.com", "111111")
        set_otp("henry@test.com", "222222")

    assert mock_client.table.return_value.upsert.call_count == 2
    second_call_row = mock_client.table.return_value.upsert.call_args_list[1][0][0]
    assert second_call_row["otp_hash"] == _sha256("222222")


# ---------------------------------------------------------------------------
# Brute-force lockout — failed-attempt counter (migration 013)
# ---------------------------------------------------------------------------
# A 6-digit reset code has only 1e6 combinations; the per-IP endpoint throttle
# (5/min) doesn't stop a botnet rotating IPs. A per-email attempt counter burns
# the code after _MAX_ATTEMPTS wrong guesses, independent of source IP.

_MAX = 5  # keep in sync with otp_store._MAX_ATTEMPTS


def test_wrong_guess_increments_attempts_counter():
    """A wrong guess below the cap bumps the persisted attempts counter and keeps the
    code alive (does NOT delete it) — the legit user can still try again."""
    row = {"email": "eve@test.com", "otp_hash": _sha256("correct"),
           "expires_at": _future_iso(), "attempts": 1}
    mock_client = _make_mock_client(select_data=[row])

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("eve@test.com", "wrong")

    assert result is False
    assert mock_client.table.return_value.update.called, "wrong guess must bump attempts"
    update_row = mock_client.table.return_value.update.call_args[0][0]
    assert update_row == {"attempts": 2}
    mock_client.table.return_value.delete.assert_not_called()


def test_max_wrong_guesses_burns_the_code():
    """On the _MAX-th wrong guess the OTP row is deleted, so no further guessing is
    possible without a brand-new request-reset (which resets the counter)."""
    row = {"email": "mallory@test.com", "otp_hash": _sha256("correct"),
           "expires_at": _future_iso(), "attempts": _MAX - 1}
    mock_client = _make_mock_client(select_data=[row])

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("mallory@test.com", "wrong")

    assert result is False
    mock_client.table.return_value.delete.return_value.eq.assert_called_once_with(
        "email", "mallory@test.com")


def test_set_otp_resets_attempts_to_zero():
    """A freshly issued code starts with a clean attempts budget (else a user who
    exhausted a prior code could never recover via a new one)."""
    mock_client = _make_mock_client()

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import set_otp
        set_otp("newcode@test.com", "424242")

    row = mock_client.table.return_value.upsert.call_args[0][0]
    assert row.get("attempts") == 0


def test_set_otp_survives_missing_attempts_column():
    """Graceful pre-migration: if the attempts column doesn't exist yet, the first
    upsert fails, but set_otp retries WITHOUT attempts so a reset code is still issued —
    the reset flow must never break just because migration 013 hasn't been applied."""
    mock_client = _make_mock_client()
    calls: list[dict] = []

    def _upsert(row, **kwargs):
        calls.append(dict(row))
        exec_mock = MagicMock()
        if "attempts" in row:
            exec_mock.execute.side_effect = Exception('column "attempts" does not exist')
        else:
            exec_mock.execute.return_value = MagicMock(data=[])
        return exec_mock

    mock_client.table.return_value.upsert.side_effect = _upsert

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import set_otp
        set_otp("legacy@test.com", "555555")  # must NOT raise

    assert len(calls) == 2, "must retry without attempts when the column is absent"
    assert "attempts" in calls[0] and "attempts" not in calls[1]
    assert calls[1]["otp_hash"] == _sha256("555555")


def test_wrong_guess_survives_missing_attempts_column():
    """Graceful pre-migration: the increment update fails (no column) but verify still
    returns False without raising — falls back to the per-IP throttle alone."""
    row = {"email": "legacy2@test.com", "otp_hash": _sha256("correct"),
           "expires_at": _future_iso()}  # no attempts key → column absent
    mock_client = _make_mock_client(select_data=[row])
    mock_client.table.return_value.update.return_value.eq.return_value.execute.side_effect = \
        Exception('column "attempts" does not exist')

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("legacy2@test.com", "wrong")  # must NOT raise

    assert result is False
    mock_client.table.return_value.delete.assert_not_called()
