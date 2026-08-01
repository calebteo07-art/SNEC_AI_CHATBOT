"""Admin endpoints."""
import asyncio
import csv
import io
import re
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from tools.api.shared import limiter, _client_ip
from tools.cases.topic_sets import SET_LABELS
from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS
from tools.profile.get_profile import get_profile
from tools.shared import db
from tools.shared.audit_log import log as audit_log
from tools.shared.auth import generate_password, hash_password
from tools.shared.clock import app_today
from tools.shared.gemini_client import MOCK_MODE, MODEL, ask
from tools.shared.identity import seed_student_name
from tools.shared.jwt_utils import CurrentUser, require_admin, require_staff
from tools.supervisor.case_index import get_case_index
from tools.supervisor.cohort_analytics import (
    WEIGHT_RUBRIC,
    flashcard_accuracy,
    flashcard_by_group,
    flashcard_by_student,
    osce_by_group,
    osce_by_student,
    weakness_scores,
)
from tools.supervisor.cohort_reads import get_cohort_reads
from tools.supervisor.discipline import DISCIPLINES, discipline_to_pool, pool_by_student
from tools.supervisor.mastery import mastery_block, retention_mastery
from tools.supervisor.trend import build_points, period_for, window_start_utc
from tools.supervisor.topic_crosswalk import KNOWLEDGE_PREFIX, is_known_tag, is_knowledge_group

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
@limiter.limit("20/minute")
async def admin_approve_student(body: ApproveStudentRequest, request: Request, current_user: CurrentUser = Depends(require_admin)):
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    role = body.role.strip().upper()
    is_staff = role in ("TRAINER", "ADMIN")
    existing = await db.get_approved(email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already approved")
    # Staff live in `supervisors`, never in `approved_students`, so the check above never
    # fires for an existing trainer/admin — and the flow fell through to the upsert_auth()
    # below, replacing the password they already use with a random one (must_change=True).
    # That silently locked a real admin out of production. Role-independent on purpose: an
    # existing staff address typed into the student form is the same clobber.
    if await db.get_supervisor(email):
        raise HTTPException(
            status_code=409,
            detail="This email already has a staff account. Use 'Forgot password' on the login "
                   "page to reset their password, or Promote/Demote to change their role.",
        )
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
# shared_limit (fixed scope) not limit(): the path is templated by {email}, and slowapi's
# default key_style="url" buckets per exact request path — plain @limiter.limit would let
# a loop over many different target emails dodge the cap entirely (each gets its own bucket).
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
        case_id = str(c.get("case_id", ""))
        total_score = int(c.get("total_score") or 0)
        item = {
            "type": "case",
            "student_id": sid,
            "name": name_map.get(sid, sid[:8]),
            # Human-readable row text (unchanged) — the structured fields below are what
            # the cohort KPIs and OSCE panels read. Never parse numbers back out of this.
            "detail": case_id + (" ✓" if passed else " ✗") + " · " + str(total_score) + "/40",
            "timestamp": str(c.get("completed_at", "")),
            "case_id": case_id,
            "total_score": total_score,
            "passed": passed,
        }
        # Migration-011 rich grade columns. Omitted when absent so the frontend can tell
        # "not graded under Tier-2" apart from "graded zero".
        if c.get("score_100") is not None:
            item["score_100"] = int(c["score_100"])
        if c.get("safe") is not None:
            item["safe"] = bool(c["safe"])
        if c.get("missed_critical") is not None:
            item["missed_critical"] = [str(m) for m in c["missed_critical"]]
        feed.append(item)
    feed.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"feed": feed[:80]}

@router.get("/api/admin/activity-trend")
@limiter.limit("60/minute")
async def admin_activity_trend(request: Request, days: int = 21,
                               current_user: CurrentUser = Depends(require_staff)):
    """Per-day cohort activity counts across a real window.

    Deliberately NOT derived from /api/admin/activity: that feed is capped at 80 items,
    so a client-side 3-week bucket silently undercounted at cohort volume. Counted here
    from windowed DB reads instead. `days` clamps to [1, 90]."""
    days = max(1, min(days, 90))
    start = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    try:
        sessions = await db.get_sessions_since(start.isoformat())
        cases = await db.get_case_progress_since(start.isoformat())
        # Active members only — same invariant as /activity and /token-summary.
        active_ids = {str(p.get("student_id")) for p in await db.get_active_leaderboard_profiles()}
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")

    buckets: dict[str, dict] = {
        (start + timedelta(days=i)).isoformat(): {"sessions": 0, "cases": 0}
        for i in range(days)
    }

    def _tally(rows: list[dict], ts_key: str, bucket_key: str) -> None:
        for row in rows:
            if str(row.get("student_id", "")) not in active_ids:
                continue
            day = str(row.get(ts_key) or "")[:10]
            if day in buckets:
                buckets[day][bucket_key] += 1

    _tally(sessions, "created_at", "sessions")
    _tally(cases, "completed_at", "cases")

    return {"days": [
        {"date": d, "sessions": v["sessions"], "cases": v["cases"],
         "total": v["sessions"] + v["cases"]}
        for d, v in sorted(buckets.items())
    ]}

@router.get("/api/admin/performance-trend")
# Plain limit(), not shared_limit: no {path_param} here, and slowapi's default
# key_style="url" buckets on the path, so ?days=/?discipline= cannot split the bucket.
@limiter.limit("60/minute")
async def admin_performance_trend(request: Request, days: int = 30, discipline: str = "all",
                                  current_user: CurrentUser = Depends(require_staff)):
    """Cohort OSCE performance over time — score, pass rate and safety-failure rate.

    A SIBLING of /activity-trend, which counts volume. This one measures quality, so it
    reads the grade columns through the windowed get_case_scores_since() rather than that
    endpoint's deliberate two-column projection.

    Bucketed on the SGT calendar at BOTH ends (tools/supervisor/trend.py): the window
    opens at SGT midnight — 16:00 UTC the previous day — and each attempt is filed by its
    SGT date. /activity-trend still uses `str(ts)[:10]`, the UTC date, which starts every
    day at 08:00 SGT; that endpoint is left alone here rather than silently re-shaped
    under a console that already ships, but the discrepancy is real and deliberate.

    `days` clamps to [1, 90] and rolls up to weeks past 31 — 90 daily points in a 320px
    chart is 3.5px each. Population is STAFF-FREE (D10) and `discipline` filters on the
    STUDENT's pool, matching /cohort-analytics. Empty buckets carry nulls, never zeros
    (D13): a 0.0 average draws a cliff to the floor and reads as a cohort collapse.
    """
    try:
        pool = discipline_to_pool(discipline)
    except ValueError:
        raise HTTPException(status_code=400,
                            detail="discipline must be one of " + ", ".join(DISCIPLINES))

    days = max(1, min(days, 90))
    today = app_today()
    try:
        profiles, _staff_excluded = await db.get_active_student_profiles()
        rows, complete = await db.get_case_scores_since(window_start_utc(today, days))
    except Exception:
        # Never fall through to an empty series: "the DB is down" and "nobody attempted
        # anything" must not render identically. That is the P1 defect class.
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")

    pools = pool_by_student(profiles)
    rows = [
        r for r in rows
        if (sid := str(r.get("student_id") or "")) in pools
        and (pool is None or pools[sid] == pool)
    ]

    period = period_for(days)
    return {
        "discipline": discipline,
        "period": period,
        "points": build_points(rows, days=days, today=today, period=period),
        # A truncated window would redraw the chart's own shape, so say so rather than
        # letting a partial read pass as the record.
        "complete": complete,
    }


# ── Cohort analytics (P2) ──────────────────────────────────────────────────

# Display labels per (pool, set_key). The case index carries a label per CASE, but the
# endpoint also has to label a group with zero attempts in the window, and neither that
# nor a flashcard-only knowledge_* group appears there.
_SET_LABEL: dict[str, dict[str, str]] = {p: dict(rows) for p, rows in SET_LABELS.items()}

# knowledge_<flashcard_topic_key> -> the deck's own label, so a cohort row reads exactly
# like the topic the student studied. Title-casing the group key instead would render
# "Knowledge Anatomy Physiology" for a deck the app calls "Ocular Anatomy & Physiology".
_KNOWLEDGE_LABEL: dict[str, str] = {
    key: label for rows in FLASHCARD_TOPICS.values() for key, label in rows
}

# Per-worker TTL cache over the DERIVED aggregate only. This is the read-cache carve-out
# of invariant #2, not a violation of it: no counters, no cross-request semantics, every
# entry is a pure function of (discipline, window) over immutable past events, and a cold
# worker just recomputes. It earns its keep because one call reads three whole tables and
# buckets them in Python while the console polls. The key space is finite but NOT small:
# `discipline` is one of three values and `days` is clamped to [1, 365] or "all", so ~1100
# distinct keys, and at ~37 KB of payload each that is ~40 MB of JSON — several times that
# as live objects — retained by one staff account walking the window sizes, on the single
# 512 MB worker Render free gives us. What actually bounds this is the sweep on write at
# the end of the handler: expired entries are DELETED, not merely skipped on read, so the
# resident set is the distinct keys requested inside one TTL window (~23 at 30/min).
# Tests patch _COHORT_TTL_SECONDS to 0, which disables read AND write.
_COHORT_TTL_SECONDS = 45.0
_cohort_cache: dict[tuple[str, str], tuple[float, dict]] = {}

# Used when weakness_scores has no entry for a group. Honest rather than defensive: "no
# confident score" is a real state, and it must never surface as a number.
_NO_WEAKNESS = {"weakness_score": None, "low_confidence": True, "signals_present": []}


def _group_label(pool: str, group: str) -> str:
    if is_knowledge_group(group):
        topic = group[len(KNOWLEDGE_PREFIX):]
        return _KNOWLEDGE_LABEL.get(topic, topic.replace("_", " ").title())
    return _SET_LABEL.get(pool, {}).get(group, group.replace("_", " ").title())


def _empty_osce() -> dict:
    """The OSCE block for a group with flashcard data but zero OSCE attempts in the window.

    Counts are 0 — that is the literal truth. Every rate/mean stays None (D13): a
    denominator of 0 has no average, and 0.0 would render as "this cohort scores zero
    here". Rebuilt per call so no two rows can alias one mutable dict."""
    return {"attempts": 0, "students": 0, "avg_score": None, "scored_n": 0,
            "pass_rate": None, "graded_n": 0, "safety_fail_rate": None,
            "safety_gradable_n": 0, "missed_top": [],
            "by_difficulty": {"beginner": 0, "intermediate": 0, "advanced": 0}}


@router.get("/api/admin/cohort-analytics")
# Plain limit(), NOT shared_limit: slowapi's default key_style="url" buckets on the ASGI
# *path*, and query strings are not part of it — ?discipline= / ?days= cannot split this
# endpoint's bucket, so there is nothing to pin. shared_limit(scope=...) is only needed
# where a {path_param} would mint a fresh bucket per value (see admin_unapprove_student).
@limiter.limit("30/minute")
async def admin_cohort_analytics(request: Request, discipline: str = "all", days: str = "90",
                                 current_user: CurrentUser = Depends(require_staff)):
    """Cohort performance per topic group, aggregated from real OSCE + flashcard events.

    Replaces the profile-snapshot proxies: every figure traces to a case_progress or
    flashcard_attempts row. `discipline` filters on the STUDENT's role pool, never the
    case's, so a role-neutral case counts in whichever pool its student belongs to.
    `discipline=all` returns BOTH pools' groups, each tagged with its own `pool` — the two
    curricula are disjoint, so one blended ranking would be meaningless (D2)."""
    try:
        pool = discipline_to_pool(discipline)
    except ValueError:
        raise HTTPException(status_code=400,
                            detail="discipline must be one of " + ", ".join(DISCIPLINES))

    # `days` is a str, not an int, so the explicit "all" sentinel is a 400-able value
    # rather than FastAPI's 422 on a failed int coercion.
    raw_days = days.strip().lower()
    if raw_days == "all":
        window_days: int | None = None
        days_echo: int | str = "all"
    else:
        try:
            window_days = max(1, min(int(raw_days), 365))
        except ValueError:
            raise HTTPException(status_code=400, detail="days must be an integer or 'all'")
        days_echo = window_days

    cache_key = (discipline, str(days_echo))
    cached = _cohort_cache.get(cache_key)
    if _COHORT_TTL_SECONDS > 0 and cached and (time.monotonic() - cached[0]) < _COHORT_TTL_SECONDS:
        return cached[1]

    try:
        # D10: students only, by MEMBERSHIP. get_active_profiles() is NOT staff-free — a
        # promoted student keeps their approved_students row (admin_promote below) and the
        # super-admin's address is routinely on the roster — and
        # get_active_leaderboard_profiles() adds trainers/admins on purpose. A lecturer's
        # demo run inside a cohort mean is a lie that never expires.
        #
        # One shared read across /at-risk, this endpoint and every student-detail page
        # (cohort_reads). It RAISES if the population or OSCE read fails: a 500 below is
        # the intended outcome, because failing open would restore an inflated denominator
        # that LOOKS correct. Never fall through to a plausible empty cohort — "the DB is
        # down" and "nobody has attempted anything" must not render identically. This is
        # the defect class P1 exists to kill.
        reads = await get_cohort_reads()
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")

    profiles, staff_excluded = reads.profiles, reads.staff_excluded
    case_rows = reads.case_rows
    # Flashcards degrade instead of failing. flashcard_attempts only started receiving rows
    # in P2, so a thin or unavailable table is the NORMAL case — it renders as "no data",
    # never as {accuracy: 0.0}, which would send trainers to remediate an unstudied topic.
    fc_rows = reads.card_rows
    flashcard_source = "ok" if reads.flashcard_ok else "unavailable"

    # After the DB reads on purpose: the index build globs 155 case files, and an outage
    # should 500 without paying for it.
    case_index = await get_case_index()

    since = ""
    if window_days is not None:
        # SGT day boundary (tools.shared.clock) — the product defines a day in SGT and
        # completed_at is written that way; a UTC edge shifts the window by 8 hours.
        since = (app_today() - timedelta(days=window_days - 1)).isoformat()

    def _in_window(row: dict, ts_key: str) -> bool:
        # ISO-8601 dates order correctly as plain strings; [:10] is the date part.
        return not since or str(row.get(ts_key) or "")[:10] >= since

    case_rows = [r for r in case_rows if _in_window(r, "completed_at")]
    fc_rows = [r for r in fc_rows if _in_window(r, "ts")]

    pools_by_student = pool_by_student(profiles)

    # Data-health diagnostics, deliberately NOT scoped to the current filter — they answer
    # "what could this console not place at all?", which is the same question in every
    # view. A student whose role maps to no pool is excluded rather than defaulted into
    # CLINICAL (§4.4 — case_pool() returns CLINICAL for "", None and typos), and an attempt
    # on a case missing from the library index is excluded from its group. Staff appear in
    # neither count: they are not in the population, so they are not "unclassified".
    unclassified_students = sum(
        1 for p in profiles if str(p.get("student_id", "")) not in pools_by_student
    )
    unclassified_attempts = sum(
        1 for r in case_rows
        if str(r.get("student_id", "")) in pools_by_student
        and str(r.get("case_id", "")) not in case_index
    )

    view_pools = [pool] if pool else ["CLINICAL", "OT"]
    in_view = {sid for sid, p in pools_by_student.items() if p in view_pools}

    # Flashcard attempts whose topic_tag matched NOTHING in the crosswalk. The tag is
    # client-supplied and unvalidated, and flashcard_group BUCKETS an unrecognised one into
    # the knowledge group rather than dropping it — so a stale frontend build or a rename
    # renders a complete, plausible, entirely wrong panel. Counted in the same pass that
    # filters the rows, so the drift is visible the day it starts rather than after a term
    # of bad teaching decisions.
    unknown_tag_attempts = sum(
        1 for r in fc_rows
        if str(r.get("student_id", "")) in in_view
        and not is_known_tag(str(r.get("topic_tag") or ""))
    )

    topics: list[dict] = []
    osce_attempts = 0
    for p in view_pools:
        osce = osce_by_group(case_rows, case_index, pools_by_student, pool=p)
        flashcard = (flashcard_by_group(fc_rows, pools_by_student, pool=p)
                     if flashcard_source == "ok" else {})
        weak = weakness_scores(osce, flashcard)
        section: list[dict] = []
        for group in set(osce) | set(flashcard):
            w = weak.get(group) or _NO_WEAKNESS
            section.append({
                "topic_group": group,
                "label": _group_label(p, group),
                # Code-literal pool ("CLINICAL"/"OT"), the same namespace pool_by_student()
                # and the case index use. The UI maps it to a section heading; a third
                # set of literals here would be one translation too many.
                "pool": p,
                "osce": osce.get(group) or _empty_osce(),
                "flashcard": flashcard.get(group) if flashcard_source == "ok" else None,
                "weakness_score": w["weakness_score"],
                "low_confidence": w["low_confidence"],
                "signals_present": list(w["signals_present"]),
            })
        # Confident groups first, then weakest first, unscored last. Small-n groups must
        # never top the ranking (§5.3) — a single bad attempt is not a cohort weakness.
        section.sort(key=lambda r: (r["low_confidence"], r["weakness_score"] is None,
                                    -(r["weakness_score"] or 0.0), r["label"]))
        topics.extend(section)
        # Summed from the aggregator (groups are disjoint) so the header total can never
        # disagree with the rows beneath it.
        osce_attempts += sum(g["attempts"] for g in osce.values())

    payload = {
        "discipline": discipline,
        "days": days_echo,
        "topics": topics,
        "totals": {
            "students_in_pool": len(in_view),
            # ..._with_osce_data counts students with ANY attempt in the window;
            # osce_students counts those actually represented in the rows above. They
            # differ exactly when a case_id is missing from the library index.
            "students_with_osce_data": len({
                str(r.get("student_id", "")) for r in case_rows
                if str(r.get("student_id", "")) in in_view}),
            "students_with_flashcard_data": len({
                str(r.get("student_id", "")) for r in fc_rows
                if str(r.get("student_id", "")) in in_view}),
            "osce_attempts": osce_attempts,
            "osce_students": len({
                str(r.get("student_id", "")) for r in case_rows
                if str(r.get("student_id", "")) in in_view
                and str(r.get("case_id", "")) in case_index}),
            "unclassified_students": unclassified_students,
            "unclassified_attempts": unclassified_attempts,
            # Staff removed from the population by supervisors membership (Task 6).
            # Surfaced, not swallowed: a cohort that quietly shrank is the same class of
            # dishonesty as one that was quietly inflated.
            "staff_excluded": staff_excluded,
            "unknown_tag_attempts": unknown_tag_attempts,
        },
        # osce is always "ok" here — a failed OSCE read raised a 500 above rather than
        # degrading, which is the whole point of the split.
        "sources": {"osce": "ok", "flashcard": flashcard_source},
        # The scoring rubric travels WITH the scores. weakness_score is a weighted,
        # shrunk composite; without the weights, the confidence floors and the safety
        # caveat on the wire, the console can only show a number a trainer has to take
        # on faith — and the caveat in particular has no other home (Task 8's rubric
        # block is where §5.3 says it must live, and nothing else reaches the client).
        "rubric": WEIGHT_RUBRIC,
    }
    if _COHORT_TTL_SECONDS > 0:
        now = time.monotonic()
        # Evict, don't just skip. The read above passes over an expired entry but left it
        # in the dict, so nothing ever shrank it — this sweep is what makes the bound
        # described above real. Same predicate as the read, so an entry is dropped exactly
        # when it stopped being servable: no live entry is lost, no dead one is served.
        for stale in [k for k, (ts, _) in _cohort_cache.items()
                      if now - ts >= _COHORT_TTL_SECONDS]:
            del _cohort_cache[stale]
        _cohort_cache[cache_key] = (now, payload)
    return payload


@router.post("/api/admin/promote")
@limiter.limit("20/minute")
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
# shared_limit (fixed scope): same {email}-in-path rationale as admin_unapprove_student above.
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
# shared_limit (fixed scope), NOT limit: slowapi's default key_style="url" keys on the
# ASGI path, so {student_id} would land in the bucket key and a caller could dodge the
# cap by walking ids. Same rationale as admin_student_insights above.
@limiter.shared_limit("30/minute", scope="admin_student_detail")
async def admin_student_detail(student_id: str, request: Request,
                               current_user: CurrentUser = Depends(require_staff)):
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

    # Mastery vs cohort (P2b, §6.2). Best-effort: this is an ADDITION to a page that
    # already works, so a failure here emits `mastery: null` and leaves the sessions,
    # cases and findings intact. /cohort-analytics is fail-closed on the population and
    # OSCE reads because there the aggregation IS the payload — but it degrades its
    # flashcard read exactly as below, so this is a narrower version of that split, not
    # its opposite.
    mastery = None
    try:
        # One shared read across /at-risk, /cohort-analytics and every student a trainer
        # opens (cohort_reads). This endpoint was the uncached one, and its query
        # background-refetches, so a review session cost a full scan of the three tables
        # per student per poll. The flashcard degrade that used to be inlined here lives
        # in that module now, for the same reason: get_all_flashcard_attempts RAISES by
        # design on a missing table (db.py:566), the NORMAL pre-migration-010 state, and a
        # shared try would let that expected failure null the OSCE and retention scales
        # too, both of which are fully computable without it.
        reads = await get_cohort_reads()

        # This student's own three figures come from the per-student reads ALREADY on this
        # page — the same `case_rows` that renders `cases`, the same `flashcard_acc` that
        # renders `flashcard_accuracy`, the same `profile` that renders `retention_scores`.
        # None of them is cached, so the number that moves when a student acts moves
        # together with the panel beside it. Sourcing them from the cohort scan instead
        # made the scan's 45s TTL visible as a page disagreeing with itself: a
        # just-finished station listed under `cases` with the pre-attempt mastery figure
        # above it. Only the peer baseline lags now, which is what a baseline is for.
        own = {
            "osce": (osce_by_student(case_rows).get(student_id) or {}).get("avg_score"),
            "flashcard": flashcard_accuracy(flashcard_acc),
            "retention": retention_mastery(profile.get("retention_scores"),
                                           role=str(profile.get("role") or "")),
        }

        # The cohort scan is now used for two things only: the peer aggregate, and the
        # membership gate below.
        osce_per_student = osce_by_student(reads.case_rows)
        cards_per_student = flashcard_by_student(reads.card_rows)
        peers: dict[str, dict] = {}
        in_cohort = False
        for p in reads.profiles:
            sid = str(p.get("student_id") or "")
            if not sid:
                continue
            if sid == student_id:
                # Their own row is the GATE, never an input. Feeding it in would put a
                # cached copy of this student's own numbers into the average they are
                # measured against — and a stale one, now that `own` is read fresh.
                in_cohort = True
                continue
            peers[sid] = {
                "osce": (osce_per_student.get(sid) or {}).get("avg_score"),
                "flashcard": (cards_per_student.get(sid) or {}).get("accuracy"),
                "retention": retention_mastery(p.get("retention_scores"),
                                               role=str(p.get("role") or "")),
            }
        # Only compare a student against a cohort they are IN. /api/admin/students is not
        # staff-free (db.py:293), so a promoted trainer is on the roster and clickable
        # while get_active_student_profiles correctly excludes them here. Scoring them
        # anyway renders "— vs cohort 60 (3 peers)" two panels above their own OSCE score:
        # "no data" is not what is true, "not in this population" is.
        #
        # The population read is cached for up to 45s, so a student approved seconds ago
        # is briefly absent and gets `mastery: null` until the entry rolls. Self-healing,
        # and they have no data to compare yet.
        if in_cohort:
            mastery = mastery_block(own, peers)
    except Exception as exc:
        # Broad on purpose — narrowing it would let a bug in the pure scorers blank the
        # page this block is only decorating. But an unlogged swallow means a permanent
        # `mastery: null` for every student has no detector but a human reading a raw
        # response, so record it the way get_profile.py records the same shape.
        audit_log("mastery_block_failed", student_id=student_id,
                  feature="admin", detail=str(exc))
        mastery = None

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
        "mastery": mastery,
        "supervisor_note": profile.get("supervisor_note", ""),
        "sessions": sessions,
        "cases": cases,
        "total_tokens": total_tokens,
        "insights": {"findings": findings, "narrative": ""},
    }


@router.get("/api/admin/token-summary")
@limiter.limit("30/minute")
async def admin_token_summary(request: Request, current_user: CurrentUser = Depends(require_staff)):
    try:
        # Paginated two-column read. The old get_all_sessions() defaulted to limit=500,
        # so this KPI silently under-reported past 500 sessions.
        all_sessions, complete = await db.get_all_session_tokens()
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
        # False when the paginator hit its page cap: total_tokens is then a FLOOR, and the
        # UI must render "≥". A number the backend knows is short has to say so on the wire.
        "complete": complete,
        "by_student": [{"student_id": k, "tokens": v} for k, v in by_student.items()],
    }


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_VALID_ROLES = {"OA", "OT", "PSA"}


@router.post("/api/admin/upload-csv")
@limiter.limit("5/minute")
async def admin_upload_csv(request: Request, file: UploadFile = File(...), current_user: CurrentUser = Depends(require_admin)):
    from tools.shared.gmail_sender import send_email as _send_email

    content = await file.read()
    text = content.decode("utf-8-sig")  # handles BOM from Excel
    reader = csv.DictReader(io.StringIO(text))

    existing = {r.get("email", "").strip().lower() for r in await db.get_all_approved()}
    # Staff aren't in approved_students, so without this a trainer/admin address sitting in
    # the roster CSV looks new and gets re-provisioned — overwriting the password they
    # already use (the same clobber guarded in admin_approve_student).
    staff_emails = {(s.get("email") or "").strip().lower() for s in await db.get_all_supervisors()}
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
        if email in staff_emails:
            errors.append({"row": i, "reason": f"{email} already has a staff account"})
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
