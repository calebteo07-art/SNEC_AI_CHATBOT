#!/usr/bin/env python3
"""OTP store backed by Supabase — replaces the in-memory _reset_tokens dict.

Public API:
    set_otp(email, otp)                — upsert SHA-256 hash + 15-min expiry + fresh budget
    verify_and_consume_otp(email, otp) — check hash+expiry, count wrong guesses, delete on success
    delete_otp(email)                  — unconditional row delete
"""

import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from tools.kb.supabase_client import get_client

_TABLE = "password_reset_otps"
_TTL_MINUTES = 15
# A 6-digit code has only 1e6 combinations; the per-IP endpoint throttle can't stop a
# botnet rotating IPs. Burn the code after this many wrong guesses (IP-independent).
_MAX_ATTEMPTS = 5


def _hash(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


def set_otp(email: str, otp: str) -> None:
    """Upsert a hashed OTP with a 15-minute expiry and a fresh (zero) attempts budget.

    The attempts column ships in migration 013; until it's applied the upsert including
    it fails, so we retry without it — a reset code must always be issued regardless."""
    client = get_client()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=_TTL_MINUTES)).isoformat()
    row = {
        "email": email,
        "otp_hash": _hash(otp),
        "expires_at": expires_at,
        "attempts": 0,  # fresh code → fresh brute-force budget
    }
    try:
        client.table(_TABLE).upsert(row, on_conflict="email").execute()
    except Exception:
        # attempts column absent (migration 013 not yet applied) — store without it.
        row.pop("attempts", None)
        client.table(_TABLE).upsert(row, on_conflict="email").execute()


def verify_and_consume_otp(email: str, otp: str) -> bool:
    """Verify the OTP for email. Returns True if valid; deletes the row on True or expiry.

    Wrong guesses increment a per-email attempts counter; the _MAX_ATTEMPTS-th wrong
    guess deletes the row, burning the code so a botnet can't brute-force the 6-digit
    space across rotating IPs. Until migration 013 adds the `attempts` column the
    increment is a guarded no-op and the per-IP endpoint throttle is the only bound."""
    client = get_client()
    result = (
        client.table(_TABLE)
        .select("*")
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
        attempts = int(row.get("attempts", 0)) + 1
        if attempts >= _MAX_ATTEMPTS:
            client.table(_TABLE).delete().eq("email", email).execute()  # burn the code
        else:
            try:
                client.table(_TABLE).update({"attempts": attempts}).eq("email", email).execute()
            except Exception:
                pass  # attempts column absent (pre-migration) — throttle still applies
        return False

    client.table(_TABLE).delete().eq("email", email).execute()
    return True


def delete_otp(email: str) -> None:
    """Unconditionally delete the OTP row for email. No-op if no row exists."""
    client = get_client()
    client.table(_TABLE).delete().eq("email", email).execute()
