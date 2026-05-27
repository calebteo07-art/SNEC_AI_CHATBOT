#!/usr/bin/env python3
"""Generate a one-page PDF student report for a supervisor."""

import io
import json
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer, SimpleDocTemplate, HRFlowable, Table, TableStyle

from tools.shared.gsheets import get_rows
from tools.profile.get_profile import get_profile
from tools.cases.get_case_progress import get_case_progress

BRAND = colors.HexColor("#8C6D3F")
MUTED = colors.HexColor("#A39A8E")
DARK = colors.HexColor("#1F1A12")
RED = colors.HexColor("#8B2D2D")
GREEN = colors.HexColor("#4F6B3D")


def _get_student_name(student_id: str) -> str:
    try:
        rows = get_rows("snec_consent", filters={"student_id": student_id})
        if rows:
            return rows[0].get("student_name", "") or rows[0].get("email", student_id[:8])
    except Exception:
        pass
    return student_id[:8] + "…"


def generate_student_report(student_id: str) -> bytes:
    """Return a one-page PDF report as bytes."""
    profile = get_profile(student_id)
    name = _get_student_name(student_id)
    case_progress = get_case_progress(student_id)

    weak_topics: list[str] = json.loads(profile.get("weak_topics", "[]") or "[]")
    retention: dict[str, float] = json.loads(profile.get("retention_scores", "{}") or "{}")
    supervisor_note: str = profile.get("supervisor_note", "") or ""
    role: str = profile.get("role", "—")
    session_count: int = int(profile.get("session_count", 0) or 0)
    streak: int = int(profile.get("streak", 0) or 0)
    last_active: str = profile.get("last_active", "—") or "—"
    velocity: str = profile.get("learning_velocity", "stable") or "stable"

    # Recent case attempts (up to 5, most recent first)
    recent_cases: list[dict] = []
    if case_progress:
        try:
            all_rows = get_rows("snec_case_progress", filters={"student_id": student_id})
            all_rows.sort(key=lambda r: r.get("completed_at", ""), reverse=True)
            seen: set[str] = set()
            for row in all_rows:
                cid = row.get("case_id", "")
                if cid and cid not in seen:
                    seen.add(cid)
                    recent_cases.append({
                        "case_id": cid,
                        "score": int(row.get("total_score", 0) or 0),
                        "passed": str(row.get("passed", "false")).lower() == "true",
                    })
                if len(recent_cases) >= 5:
                    break
        except Exception:
            pass

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    body = styles["Normal"]
    body.fontName = "Helvetica"
    body.fontSize = 10
    body.leading = 14
    body.textColor = DARK

    def h(text, size=11, color=DARK, bold=False):
        font = "Helvetica-Bold" if bold else "Helvetica"
        return Paragraph(f'<font name="{font}" size="{size}" color="#{color.hexval()[2:]}">{text}</font>', body)

    def label(text):
        return Paragraph(
            f'<font name="Helvetica" size="8" color="#{MUTED.hexval()[2:]}">'
            f'{text.upper()}</font>',
            body,
        )

    elements = []

    # Header
    elements.append(h("EyeBot — Student Report", size=16, color=BRAND, bold=True))
    elements.append(Spacer(1, 0.15 * cm))
    generated = datetime.now(timezone.utc).strftime("%d %b %Y")
    elements.append(h(f"Generated {generated}", size=9, color=MUTED))
    elements.append(Spacer(1, 0.3 * cm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=BRAND))
    elements.append(Spacer(1, 0.4 * cm))

    # Identity
    id_data = [
        [h("Name", bold=True), h(name), h("Role", bold=True), h(role)],
        [h("Student ID", bold=True), h(student_id[:12] + "…"), "", ""],
    ]
    id_table = Table(id_data, colWidths=[3 * cm, 7 * cm, 2.5 * cm, 3 * cm])
    id_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(id_table)
    elements.append(Spacer(1, 0.5 * cm))

    # Learning snapshot
    elements.append(label("· Learning Snapshot"))
    elements.append(Spacer(1, 0.2 * cm))
    snap_data = [[
        h(str(session_count), size=18, bold=True),
        h(f"{streak}d", size=18, bold=True),
        h(last_active, size=14),
        h(velocity.capitalize(), size=14),
    ], [
        h("Sessions", size=8, color=MUTED),
        h("Streak", size=8, color=MUTED),
        h("Last Active", size=8, color=MUTED),
        h("Trend", size=8, color=MUTED),
    ]]
    snap_table = Table(snap_data, colWidths=[4 * cm, 3.5 * cm, 5 * cm, 4 * cm])
    snap_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    elements.append(snap_table)
    elements.append(Spacer(1, 0.5 * cm))

    # Top weak topics
    elements.append(label("· Top Weak Topics"))
    elements.append(Spacer(1, 0.2 * cm))
    if weak_topics:
        for t in weak_topics[:3]:
            score = retention.get(t)
            pct = f"{round(score * 100)}% retention" if score is not None else ""
            elements.append(h(f"• {t.replace('_', ' ').title()}  —  {pct}", size=10, color=RED))
            elements.append(Spacer(1, 0.1 * cm))
    else:
        elements.append(h("No weak topics recorded.", size=10, color=MUTED))
    elements.append(Spacer(1, 0.4 * cm))

    # Case score history
    elements.append(label("· Case Score History (5 most recent)"))
    elements.append(Spacer(1, 0.2 * cm))
    if recent_cases:
        for c in recent_cases:
            tick = "✓" if c["passed"] else "✗"
            score_color = GREEN if c["passed"] else RED
            row_text = f"  {tick}  {c['case_id']}   —   {c['score']}/40"
            elements.append(h(row_text, size=10, color=score_color))
            elements.append(Spacer(1, 0.1 * cm))
    else:
        elements.append(h("No case attempts recorded.", size=10, color=MUTED))
    elements.append(Spacer(1, 0.4 * cm))

    # Supervisor note
    elements.append(label("· Supervisor Note"))
    elements.append(Spacer(1, 0.2 * cm))
    note_text = supervisor_note.strip() if supervisor_note.strip() else "No notes recorded."
    elements.append(h(note_text, size=10, color=DARK if supervisor_note.strip() else MUTED))
    elements.append(Spacer(1, 0.5 * cm))

    # Footer
    elements.append(HRFlowable(width="100%", thickness=0.5, color=MUTED))
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(h("Generated by EyeBot · Singapore National Eye Centre · Confidential", size=8, color=MUTED))

    doc.build(elements)
    return buf.getvalue()
