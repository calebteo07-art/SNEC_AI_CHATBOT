#!/usr/bin/env python3
"""OTP store backed by Supabase — replaces the in-memory _reset_tokens dict.

Public API:
    set_otp(email, otp)                — upsert SHA-256 hash + 15-min expiry
    verify_and_consume_otp(email, otp) — check hash+expiry, delete row on success
    delete_otp(email)                  — unconditional row delete
"""

import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from tools.kb.supabase_client import get_client

_TABLE = "password_reset_otps"
_TTL_MINUTES = 15


def _hash(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


def set_otp(email: str, otp: str) -> None:
    """Upsert a hashed OTP with a 15-minute expiry for the given email."""
    client = get_client()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=_TTL_MINUTES)).isoformat()
    client.table(_TABLE).upsert(
        {
            "email": email,
            "otp_hash": _hash(otp),
            "expires_at": expires_at,
        },
        on_conflict="email",
    ).execute()


def verify_and_consume_otp(email: str, otp: str) -> bool:
    """Verify the OTP for email. Returns True if valid; deletes the row on True or expiry."""
    client = get_client()
    result = (
        client.table(_TABLE)
        .select("otp_hash,expires_at")
        .eq("email", email)
        .execute()
    )

    if not result.data:
        return False

    row = result.data[0]
    expires_at = datetime.fromisoformat(row["expires_at"])

    if datetime.now(timezone.utc) > expires_at:
        client.table(_TABLE).delete().eq("email", email).execute()
        return False

    if not hmac.compare_digest(row["otp_hash"], _hash(otp)):
        return False

    client.table(_TABLE).delete().eq("email", email).execute()
    return True


def delete_otp(email: str) -> None:
    """Unconditionally delete the OTP row for email. No-op if no row exists."""
    client = get_client()
    client.table(_TABLE).delete().eq("email", email).execute()
