#!/usr/bin/env python3
"""Generate the weekly supervisor activity report.

Writes to the snec_supervisor_alerts Google Sheet and emails all supervisors
in snec_supervisors.

Usage:
    python tools/supervisor/activity_report.py
    -- or --
    from tools.supervisor.activity_report import generate_report
    generate_report()
"""

import json
import os
import smtplib
import sys
from datetime import date, timedelta
from email.mime.text import MIMEText
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from tools.shared.gsheets import get_rows, append_row
from tools.shared.audit_log import log
from tools.supervisor.cohort_summary import cohort_summary
from tools.supervisor.at_risk import get_at_risk

GMAIL_USER = os.getenv("GMAIL_USER", "").strip()
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "").strip()


def _build_email_body(summary: dict, at_risk: list[dict], week_start: str) -> str:
    lines = [
        f"EyeQ Supervisor Report — Week of {week_start}",
        "=" * 50,
        f"Total enrolled students: {summary['total']}",
        f"Active this week: {summary['active_this_week']}",
        f"At-risk students: {summary['at_risk_count']}",
        "",
        f"Cohort-wide weakest topics: {', '.join(summary['weakest_topics']) or 'None'}",
        "",
    ]

    if at_risk:
        lines.append("AT-RISK STUDENTS (5+ days inactive, 2+ weak topics):")
        for s in at_risk:
            lines.append(
                f"  - {s['student_id']} — last active {s['last_active']} "
                f"({s['days_inactive']} days ago), weak: {', '.join(s['weak_topics'])}"
            )
    else:
        lines.append("No students currently at risk.")

    if summary["inactive_7_plus_days"]:
        lines.append("")
        lines.append("STUDENTS NOT SEEN IN 7+ DAYS:")
        for s in summary["inactive_7_plus_days"]:
            lines.append(f"  - {s['student_id']} — last active {s['last_active']}")

    lines.append("")
    lines.append("This report is generated automatically every Monday.")
    return "\n".join(lines)


def _send_emails(subject: str, body: str, supervisor_emails: list[str]) -> None:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        log("email_skipped", feature="supervisor", detail="GMAIL_USER or GMAIL_APP_PASSWORD not set")
        return

    for email in supervisor_emails:
        try:
            msg = MIMEText(body)
            msg["Subject"] = subject
            msg["From"] = GMAIL_USER
            msg["To"] = email

            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
                smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
                smtp.send_message(msg)

            log("email_sent", feature="supervisor", detail=f"report sent to {email}")
        except Exception as exc:
            log("email_error", feature="supervisor", detail=f"{email}: {exc}")


def generate_report() -> dict:
    """Generate and deliver the weekly report. Returns the summary dict."""
    week_start = (date.today() - timedelta(days=date.today().weekday())).isoformat()

    summary = cohort_summary()
    at_risk = get_at_risk()

    try:
        append_row("snec_supervisor_alerts", {
            "week_start": week_start,
            "active_students": str(summary["active_this_week"]),
            "inactive_students": str(len(summary["inactive_7_plus_days"])),
            "weakest_topics": json.dumps(summary["weakest_topics"]),
            "at_risk_count": str(summary["at_risk_count"]),
            "report_json": json.dumps({"summary": summary, "at_risk": at_risk}),
        })
    except Exception as exc:
        log("report_sheet_error", feature="supervisor", detail=str(exc))

    try:
        supervisors = get_rows("snec_supervisors")
        emails = [s["email"] for s in supervisors if s.get("email")]
    except Exception:
        emails = []

    subject = f"EyeQ Weekly Supervisor Report — {week_start}"
    body = _build_email_body(summary, at_risk, week_start)
    _send_emails(subject, body, emails)

    return summary


if __name__ == "__main__":
    print("Generating weekly supervisor report...\n")
    result = generate_report()
    print(f"Done. {result['total']} students, {result['at_risk_count']} at risk.")
