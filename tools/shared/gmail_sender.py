#!/usr/bin/env python3
"""Send transactional email (account credentials, password-reset codes).

Render BLOCKS outbound SMTP ports (25/465/587) at the platform level, so SMTP
fails there with "[Errno 101] Network is unreachable" no matter the credentials.
Production must therefore send over HTTPS (port 443) via a transactional email
API. This module dispatches on the EMAIL_PROVIDER env var:

    EMAIL_PROVIDER = resend | sendgrid | brevo | smtp   (default: smtp)

The callers are unchanged — they still call send_email(to, subject, html).

Sender address:
    EMAIL_FROM   — e.g. "snec.tne.edu@gmail.com" (falls back to SMTP_EMAIL)

Per-provider API key (set whichever provider you choose, on Render):
    RESEND_API_KEY        (https://resend.com — needs a verified domain)
    SENDGRID_API_KEY      (https://sendgrid.com — single-sender verification, no domain needed)
    BREVO_API_KEY         (https://brevo.com — single-sender verification, 300/day free)

SMTP (local dev only) still uses SMTP_EMAIL + SMTP_APP_PASSWORD.
"""

import json
import os
import smtplib
import urllib.error
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

_FROM_NAME = "EyeBot · SNEC"
_HTTP_TIMEOUT = 15  # seconds — bounds a hung provider so it can't pin a worker thread


def _sender() -> str:
    addr = (os.getenv("EMAIL_FROM") or os.getenv("SMTP_EMAIL") or "").strip()
    if not addr:
        raise RuntimeError("EMAIL_FROM (or SMTP_EMAIL) must be set for the sender address")
    return addr


def _post_json(url: str, headers: dict, payload: dict) -> None:
    """POST JSON over HTTPS and raise with a useful message on non-2xx."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
            if resp.status >= 300:
                raise RuntimeError(f"email provider HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"email provider HTTP {exc.code}: {body}") from exc


def _send_resend(recipients: list[str], subject: str, html: str, text: str) -> None:
    key = os.environ["RESEND_API_KEY"]
    _post_json(
        "https://api.resend.com/emails",
        {"Authorization": f"Bearer {key}"},
        {"from": f"{_FROM_NAME} <{_sender()}>", "to": recipients,
         "subject": subject, "html": html, "text": text},
    )


def _send_sendgrid(recipients: list[str], subject: str, html: str, text: str) -> None:
    key = os.environ["SENDGRID_API_KEY"]
    _post_json(
        "https://api.sendgrid.com/v3/mail/send",
        {"Authorization": f"Bearer {key}"},
        {
            "personalizations": [{"to": [{"email": r} for r in recipients]}],
            "from": {"email": _sender(), "name": _FROM_NAME},
            "subject": subject,
            "content": [
                {"type": "text/plain", "value": text},
                {"type": "text/html", "value": html},
            ],
        },
    )


def _send_brevo(recipients: list[str], subject: str, html: str, text: str) -> None:
    key = os.environ["BREVO_API_KEY"]
    _post_json(
        "https://api.brevo.com/v3/smtp/email",
        {"api-key": key},
        {
            "sender": {"email": _sender(), "name": _FROM_NAME},
            "to": [{"email": r} for r in recipients],
            "subject": subject,
            "htmlContent": html,
            "textContent": text,
        },
    )


def _send_smtp(recipients: list[str], subject: str, html: str, text: str) -> None:
    """Gmail SMTP — works locally, but NOT on Render (outbound SMTP is blocked)."""
    sender = os.environ["SMTP_EMAIL"]
    password = os.environ["SMTP_APP_PASSWORD"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{_FROM_NAME} <{sender}>"
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    # timeout is essential: without it a slow/blocked SMTP connection hangs the
    # caller indefinitely. Callers also run this off the event loop (asyncio.to_thread).
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=_HTTP_TIMEOUT) as server:
        server.ehlo()
        server.starttls()
        server.login(sender, password)
        server.sendmail(sender, recipients, msg.as_bytes())


_PROVIDERS = {
    "resend": _send_resend,
    "sendgrid": _send_sendgrid,
    "brevo": _send_brevo,
    "smtp": _send_smtp,
}


def send_email(to: str | list[str], subject: str, html: str, text: str = "") -> None:
    """Send an HTML email via the configured provider (EMAIL_PROVIDER).

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

    provider = (os.getenv("EMAIL_PROVIDER") or "smtp").strip().lower()
    sender_fn = _PROVIDERS.get(provider)
    if sender_fn is None:
        raise RuntimeError(
            f"unknown EMAIL_PROVIDER={provider!r} (expected one of: {', '.join(_PROVIDERS)})"
        )
    sender_fn(recipients, subject, html, plain)
