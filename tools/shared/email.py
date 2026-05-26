#!/usr/bin/env python3
"""Send email via Gmail API using the existing OAuth token.

No SMTP app password needed — reuses the same token.json as the Sheets integration.
Requires gmail.send scope (included in SCOPES in reauth.py and gsheets.py).

If token.json doesn't yet have this scope, run:
    python tools/shared/reauth.py
"""

import base64
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

TOKEN_FILE = PROJECT_ROOT / "token.json"
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/gmail.send",
]


def _gmail_service():
    if not TOKEN_FILE.exists():
        raise RuntimeError(
            "token.json not found. Run: python tools/shared/reauth.py"
        )
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    return build("gmail", "v1", credentials=creds)


def send_email(to: str | list[str], subject: str, html: str, text: str = "") -> None:
    """Send an HTML email via Gmail API.

    Args:
        to: recipient address or list of addresses
        subject: email subject line
        html: HTML body
        text: plain-text fallback (auto-generated if omitted)
    """
    sender_email = os.getenv("SMTP_EMAIL", "me")
    recipients = [to] if isinstance(to, str) else to
    plain = text or f"{subject}\n\nOpen in an HTML-capable email client to view properly."

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"EyeQ · SNEC <{sender_email}>"
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service = _gmail_service()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()
