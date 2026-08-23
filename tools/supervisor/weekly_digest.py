#!/usr/bin/env python3
"""Build and send the weekly EyeBot supervisor digest email.

Call directly for a manual send:
    python tools/supervisor/weekly_digest.py supervisor@example.com

Or trigger via the API endpoint POST /api/supervisor/send-digest.
"""

import asyncio
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.supervisor.cohort_summary import cohort_summary
from tools.supervisor.at_risk import get_at_risk
from tools.supervisor.cohort_benchmarks import get_cohort_benchmarks
from tools.shared.gmail_sender import send_email
from tools.shared.config import app_base_url
from tools.shared.identity import resolve_names

# ── colour palette (matches EyeBot brand) ──────────────────────────────────────
C_BG     = "#FBF8F1"
C_DARK   = "#1F1A12"
C_GOLD   = "#8C6D3F"
C_MUTED  = "#A39A8E"
C_RED    = "#8B2D2D"
C_GREEN  = "#4F6B3D"
C_BORDER = "#E8E1D5"


def _bar(score: float) -> str:
    pct = round(score * 100)
    color = C_GREEN if pct >= 75 else (C_GOLD if pct >= 50 else C_RED)
    filled = round(pct * 1.2)
    return (
        '<span style="display:inline-block;width:120px;height:6px;'
        'background:#E8E1D5;border-radius:3px;vertical-align:middle;margin:0 8px 1px;">'
        '<span style="display:inline-block;width:' + str(filled) + 'px;height:6px;'
        'background:' + color + ';border-radius:3px;"></span></span>'
        '<span style="color:' + color + ';font-weight:600">' + str(pct) + '%</span>'
    )


def _weak_topics_section(topics: list[dict]) -> str:
    if not topics:
        return ""
    pills = "".join(
        '<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 14px;'
        'border-radius:20px;border:1px solid ' + C_RED + '40;'
        'background:' + C_RED + '0d;color:' + C_RED + ';font-size:12px;font-weight:500">'
        + t["topic"].replace("_", " ") + '</span>'
        for t in topics
    )
    return (
        '<h3 style="margin:0 0 12px;font-size:11px;letter-spacing:0.18em;'
        'text-transform:uppercase;color:' + C_GOLD + ';font-weight:600">'
        '· Cohort weak spots</h3>'
        '<p style="margin:0 0 28px">' + pills + '</p>'
    )


def _top_reason(row: dict) -> str:
    """The highest-weighted reason as plain text, for the one surface with no drill-down."""
    reasons = row.get("reasons") or []
    if reasons:
        return str(reasons[0].get("detail") or "")
    weak = row.get("weak_topics") or []
    return ", ".join(weak[:3]).replace("_", " ")


def _who(row: dict) -> str:
    """The student's name, falling back to a traceable id fragment.

    Same defect the console's at-risk panel had, on the surface where it hurts most:
    this table went out by EMAIL as a column of truncated UUIDs, and — as _top_reason
    notes — this is "the one surface with no drill-down". A supervisor reading it could
    not look anyone up. Escaped, because it is now person-supplied text in an HTML email.
    """
    name = str(row.get("full_name") or "").strip()
    return escape(name) if name else escape(str(row.get("student_id", ""))[:12] + "…")


def _risk_section(at_risk: list[dict]) -> str:
    if not at_risk:
        return '<p style="color:' + C_GREEN + ';margin-bottom:32px">✓ No students flagged at risk this week.</p>'
    rows = "".join(
        '<tr>'
        '<td style="padding:10px 12px;border-bottom:1px solid ' + C_BORDER + ';'
        'font-size:13px;color:' + C_DARK + '">'
        + _who(s) + '</td>'
        '<td style="padding:10px 12px;border-bottom:1px solid ' + C_BORDER + ';'
        # C_GOLD, not C_MUTED, for medium: muted on C_BG is 2.6:1 — below WCAG AA, and
        # the same colour as the de-emphasised reason column and the headers, so the
        # whole medium band read as decoration rather than as a flag.
        'color:' + (C_RED if s.get("band") == "high" else C_GOLD) + ';font-weight:600">'
        + str(s.get("risk_score") or 0) + ' · ' + str(s.get("band") or "").title() + '</td>'
        '<td style="padding:10px 12px;border-bottom:1px solid ' + C_BORDER + ';'
        'color:' + C_MUTED + ';font-size:12px">'
        # The top reason, not the raw day count: days_inactive is None for a student
        # flagged on OSCE failure alone, and str(None) rendered "Noned inactive".
        + _top_reason(s) + '</td>'
        '</tr>'
        for s in at_risk[:10]
    )
    header_style = (
        'text-align:left;padding:8px 12px;background:' + C_BG + ';'
        'font-size:10px;letter-spacing:0.12em;text-transform:uppercase;'
        'color:' + C_MUTED + ';border-bottom:1px solid ' + C_BORDER
    )
    return (
        '<h3 style="margin:0 0 12px;font-size:11px;letter-spacing:0.18em;'
        'text-transform:uppercase;color:' + C_GOLD + ';font-weight:600">'
        '· Students needing attention</h3>'
        '<table style="width:100%;border-collapse:collapse;margin-bottom:32px">'
        '<thead><tr>'
        '<th style="' + header_style + '">Student</th>'
        # Relabelled with the columns: this row is now "score · band" and the top
        # scored reason, not "Nd inactive" and a weak-topic list.
        '<th style="' + header_style + '">Risk</th>'
        '<th style="' + header_style + '">Top reason</th>'
        '</tr></thead>'
        '<tbody>' + rows + '</tbody>'
        '</table>'
    )


def _bench_section(benchmarks: list[dict]) -> str:
    if not benchmarks:
        return ""
    rows = "".join(
        '<tr>'
        '<td style="padding:8px 12px;border-bottom:1px solid ' + C_BORDER + ';'
        'color:' + C_DARK + ';font-size:13px">'
        + b["topic"].replace("_", " ").title() + '</td>'
        '<td style="padding:8px 12px;border-bottom:1px solid ' + C_BORDER + '">'
        + _bar(b["avg_score"]) + '</td>'
        '<td style="padding:8px 12px;border-bottom:1px solid ' + C_BORDER + ';'
        'color:' + C_MUTED + ';font-size:12px">' + str(b["student_count"]) + ' students</td>'
        '</tr>'
        for b in benchmarks[:8]
    )
    return (
        '<h3 style="margin:0 0 12px;font-size:11px;letter-spacing:0.18em;'
        'text-transform:uppercase;color:' + C_GOLD + ';font-weight:600">'
        '· Cohort retention by topic</h3>'
        '<table style="width:100%;border-collapse:collapse;margin-bottom:32px">'
        '<tbody>' + rows + '</tbody></table>'
    )


async def build_digest_html(supervisor_email: str) -> str:
    summary    = await cohort_summary()
    at_risk    = await get_at_risk()
    benchmarks = await get_cohort_benchmarks()
    # Decorated here, not inside get_at_risk: those rows are cached and SHARED with the
    # /at-risk endpoint, so this builds new dicts rather than writing through them.
    # resolve_names() degrades to {} — a dead consent table costs the names, not the
    # digest.
    names = await resolve_names()
    at_risk = [{**r, "full_name": names.get(str(r.get("student_id")), "")} for r in at_risk]
    date_str   = datetime.now(timezone.utc).strftime("%d %b %Y")

    at_risk_color = C_RED if summary["at_risk_count"] > 0 else C_GREEN

    # Read per render, not at import: the origin is deployment config, and a module-level
    # capture would bake whichever env the worker happened to import under.
    # `/admin` is the staff console (frontend/src/app/(console)/admin) — the old
    # `/supervisor` was never a page, only the `/api/supervisor/*` endpoints it reads.
    console_url = app_base_url() + "/admin"

    body_content = (
        _weak_topics_section(summary["weakest_topics"])
        + _risk_section(at_risk)
        + _bench_section(benchmarks)
        + '<div style="text-align:center;padding-top:8px">'
          '<a href="' + console_url + '"'
          ' style="display:inline-block;padding:14px 32px;background:' + C_DARK + ';'
          'color:#FBF8F1;text-decoration:none;border-radius:40px;'
          'font-size:14px;font-weight:500;letter-spacing:0.02em">'
          'Open Dashboard →</a></div>'
    )

    return (
        '<!DOCTYPE html><html lang="en">'
        '<head><meta charset="UTF-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        '<body style="margin:0;padding:0;background:#F0EBE1;font-family:\'Georgia\',serif">'
        '<div style="max-width:640px;margin:32px auto;background:' + C_BG + ';'
        'border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(31,26,18,0.08)">'

        # header
        '<div style="background:' + C_DARK + ';padding:32px 40px">'
        '<p style="margin:0 0 4px;font-size:10px;letter-spacing:0.22em;'
        'text-transform:uppercase;color:' + C_GOLD + ';font-weight:600">'
        'EyeBot · Singapore National Eye Centre</p>'
        '<h1 style="margin:0;font-size:26px;font-weight:400;color:#FBF8F1;'
        'letter-spacing:-0.01em">Weekly Digest</h1>'
        '<p style="margin:6px 0 0;font-size:13px;color:' + C_MUTED + '">' + date_str + '</p>'
        '</div>'

        # KPI strip
        '<div style="display:flex;border-bottom:1px solid ' + C_BORDER + '">'
        '<div style="flex:1;padding:24px 28px;border-right:1px solid ' + C_BORDER + ';text-align:center">'
        '<p style="margin:0 0 4px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:' + C_MUTED + '">Students</p>'
        '<p style="margin:0;font-size:32px;font-weight:400;color:' + C_DARK + '">' + str(summary["total"]) + '</p>'
        '</div>'
        '<div style="flex:1;padding:24px 28px;border-right:1px solid ' + C_BORDER + ';text-align:center">'
        '<p style="margin:0 0 4px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:' + C_MUTED + '">Active this week</p>'
        '<p style="margin:0;font-size:32px;font-weight:400;color:' + C_GREEN + '">' + str(summary["active_this_week"]) + '</p>'
        '</div>'
        '<div style="flex:1;padding:24px 28px;text-align:center">'
        '<p style="margin:0 0 4px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:' + C_MUTED + '">At risk</p>'
        '<p style="margin:0;font-size:32px;font-weight:400;color:' + at_risk_color + '">' + str(summary["at_risk_count"]) + '</p>'
        '</div>'
        '</div>'

        # body
        '<div style="padding:36px 40px">' + body_content + '</div>'

        # footer
        '<div style="padding:20px 40px;border-top:1px solid ' + C_BORDER + '">'
        '<p style="margin:0;font-size:11px;color:' + C_MUTED + ';text-align:center;'
        'letter-spacing:0.12em;text-transform:uppercase">'
        'EyeBot · Singapore National Eye Centre · Confidential</p>'
        '</div>'
        '</div></body></html>'
    )


async def send_weekly_digest(supervisor_email: str) -> None:
    html = await build_digest_html(supervisor_email)
    date_str = datetime.now(timezone.utc).strftime("%d %b %Y")
    # send_email is blocking network I/O with a 15s timeout — keep it off the
    # single worker's event loop, matching every other send_email call site.
    await asyncio.to_thread(
        send_email,
        to=supervisor_email,
        subject="EyeBot Weekly Digest — " + date_str,
        html=html,
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tools/supervisor/weekly_digest.py supervisor@example.com")
        sys.exit(1)
    asyncio.run(send_weekly_digest(sys.argv[1]))
    print("Digest sent to " + sys.argv[1])
