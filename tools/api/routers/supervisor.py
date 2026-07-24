"""Supervisor endpoints."""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from tools.api.shared import limiter
from tools.shared import db
from tools.shared.jwt_utils import require_staff, CurrentUser
from tools.supervisor.at_risk import get_at_risk as _get_at_risk
from tools.supervisor.cohort_benchmarks import get_cohort_benchmarks as _get_benchmarks
from tools.supervisor.cohort_summary import cohort_summary as _cohort_summary
from tools.supervisor.generate_report import generate_student_report as _generate_report
from tools.supervisor.weekly_digest import send_weekly_digest as _send_digest

router = APIRouter()


# ── Supervisor models ──────────────────────────────────────────────────────

class WeakTopic(BaseModel):
    topic: str
    count: int

class CohortSummaryResponse(BaseModel):
    total: int
    active_this_week: int
    inactive_7_plus_days: list[dict]
    weakest_topics: list[WeakTopic]
    at_risk_count: int

class AtRiskResponse(BaseModel):
    students: list[dict]

class StudentProfileResponse(BaseModel):
    student_id: str
    weak_topics: list[str]
    missed_findings: list[str]
    retention_scores: dict
    session_count: int
    streak: int
    last_active: str
    learning_velocity: str
    checkin_done_today: bool
    supervisor_note: str = ""
    sessions: list[dict] = []  # [{timestamp}] — powers the drill-down engagement heatmap

class SaveNoteRequest(BaseModel):
    note: str

class BenchmarkTopic(BaseModel):
    topic: str
    avg_score: float
    student_count: int

class BenchmarkResponse(BaseModel):
    topics: list[BenchmarkTopic]

class DigestRequest(BaseModel):
    recipient: str  # supervisor email to send digest to

class SupervisorInsightsResponse(BaseModel):
    narrative: str


# ── Supervisor endpoints ───────────────────────────────────────────────────

@router.get("/api/supervisor/cohort", response_model=CohortSummaryResponse)
async def supervisor_cohort(current_user: CurrentUser = Depends(require_staff)):
    try:
        result = await _cohort_summary()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch cohort data")
    return CohortSummaryResponse(**result)


@router.get("/api/supervisor/at-risk", response_model=AtRiskResponse)
async def supervisor_at_risk(current_user: CurrentUser = Depends(require_staff)):
    try:
        students = await _get_at_risk()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch at-risk data")
    return AtRiskResponse(students=students)


@router.get("/api/supervisor/student/{student_id}", response_model=StudentProfileResponse)
async def supervisor_student(student_id: str, current_user: CurrentUser = Depends(require_staff)):
    try:
        from tools.profile.get_profile import get_profile
        profile = await get_profile(student_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Student not found")

    # Recent session timestamps (last 5 weeks) for the engagement heatmap. Best
    # effort — the profile still renders if the session history can't be read.
    try:
        recent = await db.get_sessions(student_id, limit=35)
        sessions = [{"timestamp": str(s.get("created_at", ""))} for s in recent]
    except Exception:
        sessions = []

    try:
        return StudentProfileResponse(
            student_id=str(profile["student_id"]),
            weak_topics=profile.get("weak_topics") or [],
            missed_findings=profile.get("missed_findings") or [],
            retention_scores=profile.get("retention_scores") or {},
            session_count=int(profile.get("session_count") or 0),
            streak=int(profile.get("streak") or 0),
            last_active=str(profile.get("last_active") or ""),
            learning_velocity=profile.get("learning_velocity", "stable"),
            checkin_done_today=bool(profile.get("checkin_done_today", False)),
            supervisor_note=profile.get("supervisor_note", "") or "",
            sessions=sessions,
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.patch("/api/supervisor/student/{student_id}/note")
async def supervisor_save_note(
    student_id: str,
    body: SaveNoteRequest,
    current_user: CurrentUser = Depends(require_staff),
):
    try:
        await db.update_profile(student_id, supervisor_note=body.note)
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    return {"ok": True}


# ── Cohort leaderboard control (opt-in, supervisor-gated) ───────────────────

class LeaderboardSettingResponse(BaseModel):
    enabled: bool

class LeaderboardSettingRequest(BaseModel):
    enabled: bool


@router.get("/api/supervisor/leaderboard", response_model=LeaderboardSettingResponse)
async def supervisor_get_leaderboard(current_user: CurrentUser = Depends(require_staff)):
    try:
        enabled = await db.get_leaderboard_enabled()
    except Exception:
        enabled = False
    return LeaderboardSettingResponse(enabled=enabled)


@router.post("/api/supervisor/leaderboard", response_model=LeaderboardSettingResponse)
async def supervisor_set_leaderboard(
    body: LeaderboardSettingRequest,
    current_user: CurrentUser = Depends(require_staff),
):
    try:
        await db.set_leaderboard_enabled("SNEC", body.enabled)
    except Exception:
        raise HTTPException(status_code=503, detail="Leaderboard settings aren't available yet — run migration 004.")
    return LeaderboardSettingResponse(enabled=body.enabled)


@router.get("/api/supervisor/student/{student_id}/report")
async def supervisor_student_report(student_id: str, current_user: CurrentUser = Depends(require_staff)):
    try:
        pdf_bytes = await _generate_report(student_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    filename = f"eyebot_student_{student_id[:8]}_report.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/supervisor/benchmarks", response_model=BenchmarkResponse)
async def supervisor_benchmarks(current_user: CurrentUser = Depends(require_staff)):
    try:
        topics = await _get_benchmarks()
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    return BenchmarkResponse(topics=[BenchmarkTopic(**t) for t in topics])


@router.post("/api/supervisor/send-digest")
async def supervisor_send_digest(body: DigestRequest, current_user: CurrentUser = Depends(require_staff)):
    try:
        await _send_digest(body.recipient)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Operation failed. Please try again.")
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    return {"ok": True, "sent_to": body.recipient}


@router.get("/api/supervisor/insights", response_model=SupervisorInsightsResponse)
@limiter.limit("10/minute")
async def supervisor_insights(request: Request, current_user: CurrentUser = Depends(require_staff)):
    try:
        cohort = await _cohort_summary()
        at_risk = await _get_at_risk()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch cohort insights")

    context = (
        f"Cohort size: {cohort.get('total', 0)} students\n"
        f"Active this week: {cohort.get('active_this_week', 0)}\n"
        f"At-risk count: {cohort.get('at_risk_count', 0)}\n"
        f"Weakest topics: {', '.join(t['topic'] for t in cohort.get('weakest_topics', [])) or 'none recorded'}\n"
        f"At-risk students: {len(at_risk)}"
    )
    from tools.shared.gemini_client import ask, MODEL
    system = (
        "You are an AI assistant for an ophthalmology education supervisor. "
        "Write 2-3 sentences summarising the cohort's current state and the single most important action the supervisor should take today. "
        "Be specific and direct. No preamble."
    )
    try:
        narrative = await asyncio.to_thread(
            ask,
            system_prompt=system,
            messages=[{"role": "user", "content": context}],
            max_tokens=256,
            feature="supervisor",
            model=MODEL,
            # becky §9: a 2-3 sentence cohort narrative — no thinking needed. MINIMAL, not
            # LOW: on flash-lite the thinking budget is drawn from max_output_tokens, so
            # LOW/MEDIUM thinking under this 256 cap TRUNCATES the narrative to ~8 tokens
            # (verified live 2026-06-23). The prior MEDIUM@256 was silently truncating;
            # MINIMAL@256 returns the full narrative AND is the fastest.
            thinking_level="MINIMAL",
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise
    return SupervisorInsightsResponse(narrative=narrative.strip())
