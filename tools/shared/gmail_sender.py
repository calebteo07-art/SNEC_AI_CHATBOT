#!/usr/bin/env python3
"""Send transactional email (account credentials, password-reset codes) via the
Gmail API.

Render BLOCKS outbound SMTP ports (25/465/587), so sending must go over HTTPS
(port 443). The From address is a gmail.com account, which cannot be
domain-authenticated (DKIM/SPF/DMARC) by anyone but Google — so the only way to
send *as* it and pass Google/Yahoo/Microsoft sender requirements is through
Google's own servers, i.e. the Gmail API. Google DKIM-signs the message.

Auth is OAuth2 with a long-lived refresh token (the account owner mints it once
with scripts/gmail_oauth_setup.py). At send time we exchange the refresh token
for a short-lived access token and call users.messages.send — both over HTTPS.

Required env (set on Render; local dev can put them in .env):
    GMAIL_CLIENT_ID       OAuth client id      (Google Cloud → Credentials)
    GMAIL_CLIENT_SECRET   OAuth client secret
    GMAIL_REFRESH_TOKEN   from scripts/gmail_oauth_setup.py
    EMAIL_FROM            the account address, e.g. "snec.tne.edu@gmail.com"

Callers are unchanged — they still call send_email(to, subject, html).
"""

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

_FROM_NAME = "EyeBot · SNEC"
_HTTP_TIMEOUT = 15  # seconds — bounds a hung Google endpoint so it can't pin a worker thread

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

# Per-worker cache of the short-lived access token. This is an idempotent read
# cache of a ~1h credential (same shape as the case cache): each worker derives
# its own, so it holds no shared state and respects horizontal scaling. Avoids
# re-minting a token for every message during a bulk-CSV cohort.
_TOKEN_CACHE = {"token": None, "exp": 0.0}


def _sender() -> str:
    addr = (os.getenv("EMAIL_FROM") or "").strip()
    if not addr:
        raise RuntimeError("EMAIL_FROM must be set to the Gmail account address")
    return addr


def _http_post(url: str, data: bytes, headers: dict) -> bytes:
    """POST over HTTPS, returning the response body; raise on non-2xx."""
    req = urllib.request.Request(url, data=data, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
            if resp.status >= 300:
                raise RuntimeError(f"Gmail API HTTP {resp.status}")
            return resp.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"Gmail API HTTP {exc.code}: {body}") from exc


def _fetch_access_token() -> str:
    """Return a valid access token, minting a fresh one from the refresh token
    only when the cached one is missing or within 60s of expiry."""
    now = time.time()
    if _TOKEN_CACHE["token"] and now < _TOKEN_CACHE["exp"]:
        return _TOKEN_CACHE["token"]

    try:
        client_id = os.environ["GMAIL_CLIENT_ID"]
        client_secret = os.environ["GMAIL_CLIENT_SECRET"]
        refresh_token = os.environ["GMAIL_REFRESH_TOKEN"]
    except KeyError as exc:
        raise RuntimeError(
            f"missing {exc.args[0]} — run scripts/gmail_oauth_setup.py and set the "
            "GMAIL_* OAuth env vars"
        ) from exc

    body = urllib.parse.urlencode(
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        }
    ).encode("utf-8")
    raw = _http_post(_TOKEN_URL, body, {"Content-Type": "application/x-www-form-urlencoded"})
    data = json.loads(raw)

    token = data["access_token"]
    expires_in = int(data.get("expires_in", 3600))
    _TOKEN_CACHE["token"] = token
    _TOKEN_CACHE["exp"] = now + expires_in - 60
    return token


def send_email(to: str | list[str], subject: str, html: str, text: str = "") -> None:
    """Send an HTML email through the Gmail API.

    Args:
        to: recipient address or list of addresses
        subject: email subject line
        html: HTML body
        text: plain-text fallback (auto-generated if omitted)

    Raises:
        RuntimeError on misconfiguration or delivery failure (the caller surfaces
        this as email_sent=false and still shows the temp password).
    """
    recipients = [to] if isinstance(to, str) else list(to)
    plain = text or f"{subject}\n\nOpen in an HTML-capable email client to view properly."

    token = _fetch_access_token()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{_FROM_NAME} <{_sender()}>"
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    payload = json.dumps({"raw": base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")}).encode("utf-8")
    _http_post(
        _SEND_URL,
        payload,
        {"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
