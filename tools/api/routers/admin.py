"""Admin endpoints."""
import asyncio
import csv
import io
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from tools.api.shared import limiter
from tools.profile.get_profile import get_profile
from tools.shared import db
from tools.shared.auth import generate_password, hash_password
from tools.shared.gemini_client import MOCK_MODE, MODEL
from tools.shared.jwt_utils import CurrentUser, require_admin

router = APIRouter()

# ── Admin models ───────────────────────────────────────────────────────────

class ApproveStudentRequest(BaseModel):
    email: str
    full_name: str = ""
    role: str = ""  # OA | OT | PSA

class PromoteRequest(BaseModel):
    email: str
    new_role: str  # "supervisor" | "admin"


# ── Admin endpoints ────────────────────────────────────────────────────────

@router.get("/api/admin/approved")
async def admin_list_approved(current_user: CurrentUser = Depends(require_admin)):
    try:
        rows = await db.get_all_approved()
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    return {"students": rows}

@router.post("/api/admin/approved")
async def admin_approve_student(body: ApproveStudentRequest, current_user: CurrentUser = Depends(require_admin)):
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    existing = await db.get_approved(email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already approved")
    _consent = await db.get_consent_by_student_id(current_user["sub"])
    admin_email = _consent.get("email", "") if _consent else ""
    await db.upsert_approved(
        email,
        full_name=body.full_name.strip(),
        role=body.role.strip().upper(),
        added_by=admin_email,
        added_at=datetime.now(timezone.utc).isoformat(),
    )
    plain_pw = generate_password()
    pw_hash = hash_password(plain_pw)
    try:
        await db.upsert_auth(email, pw_hash, must_change=True)
    except Exception as _auth_exc:
        raise HTTPException(status_code=500, detail="Account created but password setup failed. Contact support.")

    email_sent = False
    email_error = ""
    try:
        from tools.shared.gmail_sender import send_email as _send_email
        # Run off the event loop: send_email is blocking SMTP I/O, and a stall
        # would otherwise freeze this single-worker async server and fail health
        # checks (taking the whole service down).
        await asyncio.to_thread(
            _send_email,
            to=email,
            subject="Your EyeBot account is ready",
            html=f"""<p>Hi {body.full_name},</p>
<p>Your EyeBot account has been created.</p>
<p><strong>Email:</strong> {email}<br>
<strong>Temporary password:</strong> {plain_pw}</p>
<p>Please log in and change your password when prompted.</p>
<p>EyeBot · SNEC</p>""",
        )
        email_sent = True
    except Exception as exc:
        email_error = str(exc)

    return {"ok": True, "email_sent": email_sent, "email_error": email_error, "password": plain_pw}

@router.delete("/api/admin/approved/{email}")
async def admin_unapprove_student(email: str, current_user: CurrentUser = Depends(require_admin)):
    deleted = await db.delete_approved(email.lower())
    if not deleted:
        raise HTTPException(status_code=404, detail="Email not found in approved list")
    return {"ok": True}

@router.get("/api/admin/students")
async def admin_all_students(current_user: CurrentUser = Depends(require_admin)):
    try:
        profiles = await db.get_all_profiles()
        consent = await db.get_all_consent()
        approved_rows = await db.get_all_approved()
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    approved_emails = {r.get("email", "").strip().lower() for r in approved_rows if r.get("email", "").strip()}
    consent_map = {r["student_id"]: r for r in consent}
    result = []
    for p in profiles:
        sid = str(p.get("student_id", ""))
        c = consent_map.get(sid, {})
        email = c.get("email", "").strip().lower()
        full_name = c.get("student_name", "").strip()
        if not email or not full_name or email not in approved_emails:
            continue
        result.append({
            "student_id": sid,
            "full_name": full_name,
            "email": email,
            "role": p.get("role", ""),
            "session_count": int(p.get("session_count") or 0),
            "streak": int(p.get("streak") or 0),
            "last_active": str(p.get("last_active") or ""),
            "weak_topics": p.get("weak_topics", []) or [],
            "learning_velocity": p.get("learning_velocity", "stable"),
        })
    return {"students": result}

@router.get("/api/admin/activity")
async def admin_activity(current_user: CurrentUser = Depends(require_admin)):
    try:
        sessions = await db.get_all_sessions(limit=50)
        cases = await db.get_all_case_progress()
        consent = await db.get_all_consent()
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    name_map = {r["student_id"]: r.get("student_name", str(r["student_id"])[:8]) for r in consent}
    feed = []
    for s in sessions[:50]:
        sid = str(s.get("student_id", ""))
        feed.append({
            "type": "session",
            "student_id": sid,
            "name": name_map.get(sid, sid[:8]),
            "detail": s.get("topic", "Chat session"),
            "timestamp": str(s.get("created_at", "")),
            "token_count": int(s.get("token_count") or 0),
        })
    for c in cases[:50]:
        sid = str(c.get("student_id", ""))
        passed = bool(c.get("passed", False))
        feed.append({
            "type": "case",
            "student_id": sid,
            "name": name_map.get(sid, sid[:8]),
            "detail": str(c.get("case_id", "")) + (" ✓" if passed else " ✗") + " · " + str(c.get("total_score", 0)) + "/40",
            "timestamp": str(c.get("completed_at", "")),
        })
    feed.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"feed": feed[:80]}

@router.post("/api/admin/promote")
async def admin_promote(body: PromoteRequest, current_user: CurrentUser = Depends(require_admin)):
    email = body.email.strip().lower()
    new_role = body.new_role.strip().lower()
    if new_role not in ("supervisor", "admin"):
        raise HTTPException(status_code=400, detail="new_role must be 'supervisor' or 'admin'")
    await db.upsert_supervisor(email, role=new_role)
    return {"ok": True}

@router.delete("/api/admin/promote/{email}")
async def admin_demote(email: str, current_user: CurrentUser = Depends(require_admin)):
    await db.delete_supervisor(email.lower())
    return {"ok": True}


@router.get("/api/admin/student/{student_id}/detail")
async def admin_student_detail(student_id: str, current_user: CurrentUser = Depends(require_admin)):
    import json as _json

    profile = await get_profile(student_id)

    # Sessions: last 30, newest first (db.get_sessions already orders newest-first)
    all_sessions = await db.get_sessions(student_id, limit=30)
    sessions = [
        {
            "session_id": str(s.get("session_id", "")),
            "timestamp": str(s.get("created_at", "")),
            "topic": (s.get("topic") or s.get("summary") or "")[:60],
            "summary": s.get("summary", ""),
            "token_count": int(s.get("token_count") or 0),
            "model": s.get("model", ""),
        }
        for s in all_sessions
    ]

    # Cases: all attempts
    case_rows = await db.get_case_results(student_id)
    cases = [
        {
            "case_id": c.get("case_id", ""),
            "total_score": int(c.get("total_score") or 0),
            "passed": bool(c.get("passed", False)),
            "completed_at": str(c.get("completed_at", "")),
        }
        for c in case_rows
    ]

    retention_scores = profile.get("retention_scores") or {}
    missed_findings = profile.get("missed_findings") or []

    total_tokens = sum(s["token_count"] for s in sessions)

    return {
        "student_id": student_id,
        "full_name": profile.get("full_name", ""),
        "email": profile.get("email", ""),
        "role": profile.get("role", ""),
        "session_count": int(profile.get("session_count") or 0),
        "streak": int(profile.get("streak") or 0),
        "last_active": str(profile.get("last_active") or ""),
        "learning_velocity": profile.get("learning_velocity", "stable"),
        "weak_topics": profile.get("weak_topics") or [],
        "missed_findings": missed_findings,
        "retention_scores": retention_scores,
        "supervisor_note": profile.get("supervisor_note", ""),
        "sessions": sessions,
        "cases": cases,
        "total_tokens": total_tokens,
    }


@router.get("/api/admin/token-summary")
async def admin_token_summary(current_user: CurrentUser = Depends(require_admin)):
    all_sessions = await db.get_all_sessions()
    total = 0
    by_student: dict[str, int] = {}
    for s in all_sessions:
        sid = s.get("student_id", "")
        tc = int(s.get("token_count", 0) or 0)
        total += tc
        by_student[sid] = by_student.get(sid, 0) + tc
    return {
        "total_tokens": total,
        "by_student": [{"student_id": k, "tokens": v} for k, v in by_student.items()],
    }


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_VALID_ROLES = {"OA", "OT", "PSA"}


@router.post("/api/admin/upload-csv")
async def admin_upload_csv(file: UploadFile = File(...), current_user: CurrentUser = Depends(require_admin)):
    from tools.shared.gmail_sender import send_email as _send_email

    content = await file.read()
    text = content.decode("utf-8-sig")  # handles BOM from Excel
    reader = csv.DictReader(io.StringIO(text))

    existing = {r.get("email", "").strip().lower() for r in await db.get_all_approved()}
    imported, skipped = 0, 0
    errors = []
    credentials = []

    # Resolve admin email from JWT sub via consent sheet
    try:
        _admin_consent = await db.get_consent_by_student_id(current_user["sub"])
        admin_email = _admin_consent.get("email", "") if _admin_consent else current_user["sub"]
    except Exception:
        admin_email = current_user["sub"]

    for i, row in enumerate(reader, start=2):
        full_name = (row.get("full_name") or "").strip()
        email = (row.get("email") or "").strip().lower()
        role = (row.get("role") or "").strip().upper()

        if not full_name:
            errors.append({"row": i, "reason": "missing full_name"})
            skipped += 1
            continue
        if not email or not _EMAIL_RE.match(email):
            errors.append({"row": i, "reason": "invalid email"})
            skipped += 1
            continue
        if role not in _VALID_ROLES:
            errors.append({"row": i, "reason": f"role must be OA, OT, or PSA (got {role!r})"})
            skipped += 1
            continue
        if email in existing:
            errors.append({"row": i, "reason": f"{email} already approved"})
            skipped += 1
            continue

        plain_pw = generate_password()
        pw_hash = hash_password(plain_pw)

        await db.upsert_approved(
            email,
            full_name=full_name,
            role=role,
            added_by=admin_email,
            added_at=datetime.now(timezone.utc).isoformat(),
        )
        try:
            await db.upsert_auth(email, pw_hash, must_change=True)
        except Exception:
            errors.append({"row": i, "reason": "password setup failed"})
            skipped += 1
            continue
        existing.add(email)

        email_sent = False
        email_error = ""
        try:
            # Off the event loop (blocking SMTP) — see admin_approve_student.
            await asyncio.to_thread(
                _send_email,
                to=email,
                subject="Your EyeBot account is ready",
                html=f"""<p>Hi {full_name},</p>
<p>Your EyeBot account has been created.</p>
<p><strong>Email:</strong> {email}<br>
<strong>Temporary password:</strong> {plain_pw}</p>
<p>Please log in and change your password when prompted.</p>
<p>EyeBot · SNEC</p>""",
            )
            email_sent = True
        except Exception as exc:
            email_error = str(exc)

        credentials.append({"full_name": full_name, "email": email, "password": plain_pw, "email_sent": email_sent, "email_error": email_error})
        imported += 1

    return {"imported": imported, "skipped": skipped, "errors": errors, "credentials": credentials}
