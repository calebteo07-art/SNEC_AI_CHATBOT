"""Admin endpoints."""
import asyncio
import csv
import io
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from tools.api.shared import limiter, _client_ip
from tools.profile.get_profile import get_profile
from tools.shared import db
from tools.shared.auth import generate_password, hash_password
from tools.shared.gemini_client import MOCK_MODE, MODEL, ask
from tools.shared.identity import seed_student_name
from tools.shared.jwt_utils import CurrentUser, require_admin, require_staff

router = APIRouter()

# ── Admin models ───────────────────────────────────────────────────────────

class ApproveStudentRequest(BaseModel):
    email: str
    full_name: str = ""
    role: str = ""  # OA | OT | PSA | trainer | admin

class PromoteRequest(BaseModel):
    email: str
    new_role: str  # "trainer" | "admin"


def _account_ready_html(full_name: str, email: str, password: str) -> str:
    """New-account credentials email. Shared by the single-approve and CSV-import
    paths so the two can't drift apart."""
    return f"""<p>Dear {full_name},</p>
<p>Welcome to EyeBot — we are delighted to have you on board.</p>
<p>EyeBot is your personal training companion, here to help you learn at your own pace and grow in confidence in your clinical practice. Your account is now ready, and your sign-in details are below.</p>
<p><strong>Email:</strong> {email}<br>
<strong>Temporary password:</strong> {password}</p>
<p><strong>Before you log in:</strong> EyeBot has not been released on SNEC corporate devices yet, so please use your own personal device. It is best experienced on an iPad or laptop.</p>
<p>Please log in at <a href="https://snec-ai-chatbot.onrender.com">https://snec-ai-chatbot.onrender.com</a>, where you will be prompted to choose a password of your own.</p>
<p>We hope you enjoy learning with EyeBot, and we wish you every success in your training.</p>
<p>Warm regards,<br>The EyeBot Team · SNEC</p>"""


# ── Admin endpoints ────────────────────────────────────────────────────────

@router.get("/api/admin/approved")
async def admin_list_approved(current_user: CurrentUser = Depends(require_staff)):
    try:
        rows = await db.get_all_approved()
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    return {"students": rows}

@router.post("/api/admin/approved")
async def admin_approve_student(body: ApproveStudentRequest, request: Request, current_user: CurrentUser = Depends(require_admin)):
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    role = body.role.strip().upper()
    is_staff = role in ("TRAINER", "ADMIN")
    existing = await db.get_approved(email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already approved")
    _consent = await db.get_consent_by_student_id(current_user["sub"])
    admin_email = _consent.get("email", "") if _consent else ""
    if is_staff:
        # Staff live in the supervisors table, not the approved-students whitelist.
        # Create the credential + supervisors row so a brand-new trainer/admin can
        # log in (identity/profile are created on first login as usual).
        await db.upsert_supervisor(email, role=role.lower())
    else:
        await db.upsert_approved(
            email,
            full_name=body.full_name.strip(),
            role=role,
            added_by=admin_email,
            added_at=datetime.now(timezone.utc).isoformat(),
        )
    # Persist the typed name to the identity of record (student_consent) so it is
    # authoritative immediately — for staff (supervisors has no name column) and for
    # students before their first login. Without this the name only reaches the welcome
    # email and the person renders as "Student" on the leaderboard. Binds by email at login.
    await seed_student_name(email, body.full_name)
    plain_pw = generate_password()
    pw_hash = await asyncio.to_thread(hash_password, plain_pw)
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
            html=_account_ready_html(body.full_name, email, plain_pw),
        )
        email_sent = True
    except Exception as exc:
        email_error = str(exc)

    # Durable audit: creating a trainer/admin is a privilege grant, distinct from
    # whitelisting a student. Attributed to the acting admin (JWT sub), best-effort.
    await db.insert_audit_event(
        action="create_staff" if is_staff else "approve_student",
        actor=current_user["sub"], target=email, detail=f"role={role}",
        ip=_client_ip(request),
    )
    return {"ok": True, "email_sent": email_sent, "email_error": email_error, "password": plain_pw}

@router.delete("/api/admin/approved/{email}")
@limiter.shared_limit("20/minute", scope="admin_unapprove_student")
async def admin_unapprove_student(email: str, request: Request, current_user: CurrentUser = Depends(require_admin)):
    deleted = await db.delete_approved(email.lower())
    if not deleted:
        raise HTTPException(status_code=404, detail="Email not found in approved list")
    # Durable audit: revoking access is a hard delete with no tombstone — the audit row
    # is the only record of who removed whom (best-effort, after the 404 guard).
    await db.insert_audit_event(
        action="unapprove_student", actor=current_user["sub"],
        target=email.lower(), ip=_client_ip(request),
    )
    return {"ok": True}

@router.get("/api/admin/students")
async def admin_all_students(current_user: CurrentUser = Depends(require_staff)):
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

@router.get("/api/admin/staff")
async def admin_all_staff(current_user: CurrentUser = Depends(require_staff)):
    """Trainers and admins for the analytics Staff section. Separate from
    /api/admin/students so student cohort/at-risk/benchmark roll-ups stay
    student-only; staff who haven't logged in yet come back as status='pending'."""
    try:
        staff = await db.get_staff_roster()
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    return {"staff": staff}

@router.get("/api/admin/activity")
async def admin_activity(current_user: CurrentUser = Depends(require_staff)):
    try:
        sessions = await db.get_all_sessions(limit=50)
        cases = await db.get_all_case_progress()
        consent = await db.get_all_consent()
        # Active members only (active students + staff) — a removed student's sessions
        # and case attempts must not surface in the feed.
        active_ids = {str(p.get("student_id")) for p in await db.get_active_leaderboard_profiles()}
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    name_map = {r["student_id"]: r.get("student_name", str(r["student_id"])[:8]) for r in consent}
    feed = []
    for s in sessions[:50]:
        sid = str(s.get("student_id", ""))
        if sid not in active_ids:
            continue
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
        if sid not in active_ids:
            continue
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
async def admin_promote(body: PromoteRequest, request: Request, current_user: CurrentUser = Depends(require_admin)):
    email = body.email.strip().lower()
    new_role = body.new_role.strip().lower()
    if new_role not in ("trainer", "admin"):
        raise HTTPException(status_code=400, detail="new_role must be 'trainer' or 'admin'")
    await db.upsert_supervisor(email, role=new_role)
    # Durable audit: privilege escalation is the #1 thing a compliance review checks.
    await db.insert_audit_event(
        action="promote", actor=current_user["sub"], target=email,
        detail=f"role={new_role}", ip=_client_ip(request),
    )
    return {"ok": True}

@router.delete("/api/admin/promote/{email}")
@limiter.shared_limit("20/minute", scope="admin_demote")
async def admin_demote(email: str, request: Request, current_user: CurrentUser = Depends(require_admin)):
    await db.delete_supervisor(email.lower())
    # Durable audit: revoking admin/trainer rights is a hard delete with no other record.
    await db.insert_audit_event(
        action="demote", actor=current_user["sub"],
        target=email.lower(), ip=_client_ip(request),
    )
    return {"ok": True}


@router.get("/api/admin/audit")
@limiter.limit("30/minute")
async def admin_audit(request: Request, action: str | None = None, limit: int = 100,
                      current_user: CurrentUser = Depends(require_admin)):
    """Recent security/privilege audit events (audit_events, migration 014), newest first.
    ADMIN-ONLY — this is sensitive data (actors, IPs, failed logins, privilege changes), so
    trainers are excluded. Optional ?action= filter; ?limit= is clamped to [1, 500].
    Degrades to an empty list (never 500) if the table is unavailable."""
    limit = max(1, min(limit, 500))
    try:
        events = await db.get_recent_audit_events(limit=limit, action=action)
    except Exception:
        return {"events": []}
    return {"events": events}


def _build_student_findings(profile: dict, sessions: list[dict], cases: list[dict],
                            flashcard_acc: dict) -> list[dict]:
    """Deterministic, per-feature findings across ALL THREE learning features — real
    insight, not a plain history list (ricoe: "give actual findings so lecturers can
    improve teaching"). Free + always available; the AI narrative refines these."""
    from collections import Counter

    findings: list[dict] = []

    tutor = [s for s in sessions if not str(s.get("topic", "")).startswith("Case:")]
    if tutor:
        topics = [str(s.get("topic") or "").strip() for s in tutor if s.get("topic")]
        common = ", ".join(t for t, _ in Counter(topics).most_common(3)) or "general topics"
        findings.append({"feature": "AI Tutor",
                         "text": f"{len(tutor)} tutor conversation(s); recent focus: {common}."})
    else:
        findings.append({"feature": "AI Tutor",
                         "text": "No AI-tutor use yet — encourage Socratic questioning to build reasoning."})

    if flashcard_acc:
        total = sum(int(a.get("total", 0)) for a in flashcard_acc.values())
        correct = sum(int(a.get("correct", 0)) for a in flashcard_acc.values())
        pct = round(100 * correct / total) if total else 0
        weak = sorted(t for t, a in flashcard_acc.items() if float(a.get("pct", 100)) < 65)
        weak_txt = ", ".join(w.replace("_", " ") for w in weak[:3]) or "none standing out"
        findings.append({"feature": "Flashcards",
                         "text": f"{pct}% accuracy over {total} card(s); weakest: {weak_txt}."})
    else:
        findings.append({"feature": "Flashcards",
                         "text": "No flashcard attempts logged — assign spaced-repetition decks to surface gaps."})

    if cases:
        attempts = len(cases)
        passed = sum(1 for c in cases if c.get("passed"))
        unsafe = [c for c in cases if c.get("safe") is False]
        scores = [int(c["score_100"]) for c in cases if c.get("score_100") is not None]
        avg = f", avg {round(sum(scores) / len(scores))}/100" if scores else ""
        missed: list[str] = []
        for c in unsafe:
            missed += [str(m) for m in (c.get("missed_critical") or [])]
        extra = ""
        if unsafe:
            extra = f"; {len(unsafe)} unsafe run(s)" + (f" (e.g. missed: {missed[0]})" if missed else "")
        findings.append({"feature": "Virtual Patients",
                         "text": f"{attempts} station(s), {passed} passed{avg}{extra}."})
    else:
        findings.append({"feature": "Virtual Patients",
                         "text": "No virtual-patient stations attempted yet — start them on beginner cases."})

    weak_topics = [str(t).replace("_", " ") for t in (profile.get("weak_topics") or [])][:3]
    missed_findings = [str(m) for m in (profile.get("missed_findings") or [])][:3]
    bits = [f"Learning velocity: {profile.get('learning_velocity', 'stable')}."]
    if weak_topics:
        bits.append("Recurring weak topics: " + ", ".join(weak_topics) + ".")
    if missed_findings:
        bits.append("Consistently missed: " + ", ".join(missed_findings) + ".")
    findings.append({"feature": "Overall", "text": " ".join(bits)})
    return findings


_INSIGHT_SYSTEM = (
    "You advise clinical lecturers training allied-health ophthalmic students (OA/OT/PSA). "
    "Given per-feature findings about ONE student across the AI tutor, flashcards and "
    "virtual-patient OSCE stations, write 2-3 sentences of specific, ACTIONABLE teaching "
    "insight: what this student most needs and what the lecturer should reinforce in class. "
    "Ground every claim in the findings given; be constructive and concrete; plain prose, "
    "no preamble, no bullet points."
)


async def _ai_insight_narrative(name: str, findings: list[dict]) -> str:
    """Best-effort AI synthesis of the findings into a teaching narrative. Returns "" in
    MOCK_MODE or on any failure — the deterministic findings still stand on their own."""
    if MOCK_MODE:
        return ""
    lines = "\n".join(f"- {f['feature']}: {f['text']}" for f in findings)
    try:
        out = await asyncio.wait_for(
            asyncio.to_thread(
                ask,
                system_prompt=_INSIGHT_SYSTEM,
                messages=[{"role": "user", "content": f"Student: {name}\nFindings:\n{lines}"}],
                max_tokens=400,
                feature="admin_insight",
                model=MODEL,
                thinking_level="MINIMAL",
            ),
            timeout=14.0,
        )
        return (out or "").strip()
    except Exception:
        return ""


@router.get("/api/admin/student/{student_id}/insights")
@limiter.shared_limit("20/minute", scope="admin_student_insights")
async def admin_student_insights(student_id: str, request: Request, current_user: CurrentUser = Depends(require_staff)):
    """On-demand teaching insights for one student across all three features. Kept SEPARATE
    from /detail so the (paid) AI narrative only runs when a lecturer explicitly asks.
    Per-user rate limit so the paid Gemini call can't be hammered (quota/cost protection),
    matching every other AI endpoint. shared_limit (not limit) pins the bucket to a fixed
    scope: slowapi defaults to key_style="url", so a plain limit would put {student_id} in
    the bucket key and let a caller dodge the cap by looping over different ids."""
    try:
        profile = await get_profile(student_id) or {}
        sessions = await db.get_sessions(student_id, limit=30)
        case_rows = await db.get_case_results(student_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    try:
        flashcard_acc = await db.get_topic_accuracy(student_id)
    except Exception:
        flashcard_acc = {}
    findings = _build_student_findings(profile, sessions, case_rows, flashcard_acc)
    narrative = await _ai_insight_narrative(profile.get("full_name", "the student"), findings)
    return {"findings": findings, "narrative": narrative}


@router.get("/api/admin/student/{student_id}/detail")
async def admin_student_detail(student_id: str, current_user: CurrentUser = Depends(require_staff)):
    import json as _json

    try:
        profile = await get_profile(student_id) or {}
        # Identity is student_consent's, not student_profiles' — the latter has no
        # name/email column. Same source /api/auth/me reads.
        consent = await db.get_consent_by_student_id(student_id) or {}
        # Sessions: last 30, newest first (db.get_sessions already orders newest-first)
        all_sessions = await db.get_sessions(student_id, limit=30)
        case_rows = await db.get_case_results(student_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    try:
        flashcard_acc = await db.get_topic_accuracy(student_id)
    except Exception:
        flashcard_acc = {}

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

    # Cases: all attempts, including the additive rich-grade columns when present.
    def _case_row(c: dict) -> dict:
        row = {
            "case_id": c.get("case_id", ""),
            "total_score": int(c.get("total_score") or 0),
            "passed": bool(c.get("passed", False)),
            "completed_at": str(c.get("completed_at", "")),
        }
        if c.get("score_100") is not None:
            row["score_100"] = int(c["score_100"])
        if c.get("safe") is not None:
            row["safe"] = bool(c["safe"])
        if c.get("consult_technique") is not None:
            row["consult_technique"] = int(c["consult_technique"])
        if c.get("judgement_safety") is not None:
            row["judgement_safety"] = int(c["judgement_safety"])
        if c.get("missed_critical") is not None:
            row["missed_critical"] = [str(m) for m in (c.get("missed_critical") or [])]
        return row

    cases = [_case_row(c) for c in case_rows]

    retention_scores = profile.get("retention_scores") or {}
    missed_findings = profile.get("missed_findings") or []

    total_tokens = sum(s["token_count"] for s in sessions)

    # Cross-feature findings (deterministic, free) — the AI narrative is fetched separately.
    findings = _build_student_findings(profile, all_sessions, case_rows, flashcard_acc)

    return {
        "student_id": student_id,
        "full_name": (consent.get("student_name") or "").strip(),
        "email": (consent.get("email") or "").strip(),
        "role": profile.get("role", ""),
        "session_count": int(profile.get("session_count") or 0),
        "streak": int(profile.get("streak") or 0),
        "last_active": str(profile.get("last_active") or ""),
        "learning_velocity": profile.get("learning_velocity", "stable"),
        "weak_topics": profile.get("weak_topics") or [],
        "missed_findings": missed_findings,
        "retention_scores": retention_scores,
        "flashcard_accuracy": flashcard_acc,
        "supervisor_note": profile.get("supervisor_note", ""),
        "sessions": sessions,
        "cases": cases,
        "total_tokens": total_tokens,
        "insights": {"findings": findings, "narrative": ""},
    }


@router.get("/api/admin/token-summary")
async def admin_token_summary(current_user: CurrentUser = Depends(require_staff)):
    try:
        all_sessions = await db.get_all_sessions()
        # Active members only — a removed student's tokens must drop out of the
        # grand total and the per-student breakdown.
        active_ids = {str(p.get("student_id")) for p in await db.get_active_leaderboard_profiles()}
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    total = 0
    by_student: dict[str, int] = {}
    for s in all_sessions:
        sid = s.get("student_id", "")
        if str(sid) not in active_ids:
            continue
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
        pw_hash = await asyncio.to_thread(hash_password, plain_pw)

        await db.upsert_approved(
            email,
            full_name=full_name,
            role=role,
            added_by=admin_email,
            added_at=datetime.now(timezone.utc).isoformat(),
        )
        await seed_student_name(email, full_name)  # name authoritative before first login
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
                html=_account_ready_html(full_name, email, plain_pw),
            )
            email_sent = True
        except Exception as exc:
            email_error = str(exc)

        credentials.append({"full_name": full_name, "email": email, "password": plain_pw, "email_sent": email_sent, "email_error": email_error})
        imported += 1

    return {"imported": imported, "skipped": skipped, "errors": errors, "credentials": credentials}
