#!/usr/bin/env python3
"""Send email via Gmail SMTP using app password from .env.

Required .env vars:
    SMTP_EMAIL        — Gmail address to send from (e.g. snec.tne.edu@gmail.com)
    SMTP_APP_PASSWORD — Gmail app password (16-char, no spaces)
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587


def send_email(to: str | list[str], subject: str, html: str, text: str = "") -> None:
    """Send an HTML email.

    Args:
        to: recipient address or list of addresses
        subject: email subject line
        html: HTML body
        text: plain-text fallback (auto-generated from subject if omitted)
    """
    sender = os.getenv("SMTP_EMAIL", "")
    password = os.getenv("SMTP_APP_PASSWORD", "")
    if not sender or not password:
        raise RuntimeError(
            "SMTP_EMAIL and SMTP_APP_PASSWORD must be set in .env. "
            "Generate an app password at myaccount.google.com/apppasswords."
        )

    recipients = [to] if isinstance(to, str) else to
    plain = text or f"{subject}\n\nOpen this email in a client that supports HTML to view properly."

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"EyeQ · SNEC <{sender}>"
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(sender, password)
        server.sendmail(sender, recipients, msg.as_string())
