#!/usr/bin/env python3
"""Send email via SMTP (Gmail).

Requires env vars:
    SMTP_EMAIL        — sender address, e.g. snec.tne.edu@gmail.com
    SMTP_APP_PASSWORD — 16-char Google App Password (myaccount.google.com/apppasswords)

Both must be set in .env locally and in the Render dashboard for production.
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")


def send_email(to: str | list[str], subject: str, html: str, text: str = "") -> None:
    """Send an HTML email via Gmail SMTP.

    Args:
        to: recipient address or list of addresses
        subject: email subject line
        html: HTML body
        text: plain-text fallback (auto-generated if omitted)

    Raises:
        KeyError: if SMTP_EMAIL or SMTP_APP_PASSWORD is not set
        smtplib.SMTPException: on delivery failure
    """
    sender = os.environ["SMTP_EMAIL"]
    password = os.environ["SMTP_APP_PASSWORD"]
    recipients = [to] if isinstance(to, str) else to
    plain = text or f"{subject}\n\nOpen in an HTML-capable email client to view properly."

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"EyeBot · SNEC <{sender}>"
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.ehlo()
        server.starttls()
        server.login(sender, password)
        server.sendmail(sender, recipients, msg.as_bytes())
