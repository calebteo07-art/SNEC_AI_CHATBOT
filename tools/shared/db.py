#!/usr/bin/env python3
"""Async Supabase PostgreSQL client for the four migrated tables.

Replaces Google Sheets for: student_auth, student_profiles, chat_sessions, case_progress.
All functions are async. JSONB columns are returned as native Python dicts/lists.

Usage:
    from tools.shared import db
    profile = await db.get_profile(student_id)
"""
import asyncio
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import AsyncClient, acreate_client

from tools.shared.config import super_admin_email

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

_client: AsyncClient | None = None


async def _get_client() -> AsyncClient:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL", "").strip()
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
            )
        _client = await acreate_client(url, key)
    return _client


# ── student_auth ─────────────────────────────────────────────────────────────

async def get_auth(email: str) -> dict | None:
    """Return the auth row for email, or None if not found."""
    client = await _get_client()
    result = (
        await client.table("student_auth")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def upsert_auth(email: str, password_hash: str, must_change: bool) -> None:
    """Insert or update an auth row."""
    client = await _get_client()
    await client.table("student_auth").upsert(
        {"email": email, "password_hash": password_hash, "must_change": must_change},
        on_conflict="email",
    ).execute()


async def update_auth(email: str, **fields) -> None:
    """Update specific fields on an auth row."""
    client = await _get_client()
    await client.table("student_auth").update(fields).eq("email", email).execute()


# ── student_profiles ──────────────────────────────────────────────────────────

async def get_profile(student_id: str) -> dict | None:
    """Return the profile row for student_id, or None if not found.
    JSONB columns (weak_topics, missed_findings, retention_scores) are
    returned as native Python lists/dicts — no json.loads() needed.
    """
    client = await _get_client()
    result = (
        await client.table("student_profiles")
        .select("*")
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def upsert_profile(student_id: str, **fields) -> None:
    """Insert or update a profile row."""
    client = await _get_client()
    await client.table("student_profiles").upsert(
        {"student_id": student_id, **fields},
        on_conflict="student_id",
    ).execute()


async def update_profile(student_id: str, **fields) -> None:
    """Update specific fields on a profile row."""
    client = await _get_client()
    await client.table("student_profiles").update(fields).eq("student_id", student_id).execute()


# ── chat_sessions ─────────────────────────────────────────────────────────────

async def insert_session(
    student_id: str, topic: str, summary: str, token_count: int, model: str
) -> None:
    """Append a chat session record."""
    client = await _get_client()
    await client.table("chat_sessions").insert(
        {
            "student_id": student_id,
            "topic": topic,
            "summary": summary,
            "token_count": token_count,
            "model": model,
        }
    ).execute()


async def get_sessions(student_id: str, limit: int = 20) -> list[dict]:
    """Return the most recent sessions for a student, newest first."""
    client = await _get_client()
    result = (
        await client.table("chat_sessions")
        .select("*")
        .eq("student_id", student_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


# ── case_progress ─────────────────────────────────────────────────────────────

async def insert_case_result(
    student_id: str,
    case_id: str,
    total_score: int,
    passed: bool,
    score_100: int | None = None,
    safe: bool | None = None,
    consult_technique: int | None = None,
    judgement_safety: int | None = None,
    missed_critical: list | None = None,
    coaching: dict | None = None,
) -> None:
    """Append a case completion record. The rich OSCE-grade columns are additive and
    nullable (migration 011); when any are supplied we try the full insert first and,
    if those columns are absent (pre-migration), fall back to the base four columns so
    the submit path stays green until the migration is applied."""
    client = await _get_client()
    base: dict = {
        "student_id": student_id,
        "case_id": case_id,
        "total_score": total_score,
        "passed": passed,
    }
    rich = dict(base)
    if score_100 is not None:
        rich["score_100"] = score_100
    if safe is not None:
        rich["safe"] = safe
    if consult_technique is not None:
        rich["consult_technique"] = consult_technique
    if judgement_safety is not None:
        rich["judgement_safety"] = judgement_safety
    if missed_critical is not None:
        rich["missed_critical"] = missed_critical
    if coaching is not None:
        rich["coaching"] = coaching
    try:
        await client.table("case_progress").insert(rich).execute()
    except Exception:
        if len(rich) == len(base):  # nothing extra to shed → the error is real
            raise
        await client.table("case_progress").insert(base).execute()


async def get_case_results(student_id: str) -> list[dict]:
    """Return all case completion records for a student. `select("*")` surfaces the
    additive rich-grade columns (score_100, safe, consult_technique, judgement_safety,
    missed_critical, coaching) automatically once migration 011 is applied."""
    client = await _get_client()
    result = (
        await client.table("case_progress")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    return result.data or []


# ── flashcard_attempts (migration 010 — per-card grading log) ──────────────────

async def insert_flashcard_attempt(
    student_id: str, card_id: str | None, topic_tag: str, correct: bool, score: int
) -> None:
    """Append a per-card flashcard attempt. Raises if the table is missing
    (pre-migration 010) — callers best-effort-catch so the study loop still works."""
    client = await _get_client()
    await client.table("flashcard_attempts").insert(
        {
            "student_id": student_id,
            "card_id": card_id,
            "topic_tag": topic_tag,
            "correct": correct,
            "score": score,
        }
    ).execute()


async def get_flashcard_attempts(student_id: str) -> list[dict]:
    """Return all flashcard attempts for a student, newest first. Raises on a missing
    table (pre-migration 010) — callers catch and treat as no data."""
    client = await _get_client()
    result = (
        await client.table("flashcard_attempts")
        .select("*")
        .eq("student_id", student_id)
        .order("ts", desc=True)
        .execute()
    )
    return result.data or []


async def get_topic_accuracy(student_id: str) -> dict[str, dict]:
    """Per-topic flashcard accuracy for a student:
    {topic_tag: {"correct": int, "total": int, "pct": float}}. Built from the raw
    attempts, so it propagates the pre-migration missing-table error to the caller."""
    attempts = await get_flashcard_attempts(student_id)
    agg: dict[str, dict] = {}
    for a in attempts:
        topic = a.get("topic_tag") or "general"
        bucket = agg.setdefault(topic, {"correct": 0, "total": 0, "pct": 0.0})
        bucket["total"] += 1
        if a.get("correct"):
            bucket["correct"] += 1
    for bucket in agg.values():
        bucket["pct"] = (
            round(100 * bucket["correct"] / bucket["total"], 1) if bucket["total"] else 0.0
        )
    return agg


# ── Admin helpers (bulk reads) ────────────────────────────────────────────────

async def get_all_profiles() -> list[dict]:
    """Return all student profile rows. Used by admin dashboard."""
    client = await _get_client()
    result = await client.table("student_profiles").select("*").execute()
    return result.data or []


async def get_active_profiles() -> list[dict]:
    """Student profiles whose account still has access — i.e. whose consent email is
    still present in approved_students. Cohort/analytics roll-ups use THIS (not
    get_all_profiles) so revoking access — deleting a student's approved_students
    row — drops them from cohort counts and at-risk lists immediately, matching the
    admin roster (which already filters this way). A profile whose email can't be
    matched to an approved row is excluded (fail closed). NOTE: staff (trainers/admins,
    who live in supervisors not approved_students) are intentionally NOT here — the
    leaderboard uses get_active_leaderboard_profiles to add them back in."""
    profiles = await get_all_profiles()
    approved = await get_all_approved()
    consent = await get_all_consent()
    approved_emails = {
        (r.get("email") or "").strip().lower()
        for r in approved
        if (r.get("email") or "").strip()
    }
    active_ids = {
        str(c.get("student_id"))
        for c in consent
        if c.get("student_id") is not None
        and (c.get("email") or "").strip().lower() in approved_emails
    }
    return [p for p in profiles if str(p.get("student_id")) in active_ids]


async def get_active_leaderboard_profiles() -> list[dict]:
    """Profiles eligible for the cohort leaderboard: every active student (exactly as
    get_active_profiles) PLUS staff — trainers and admins (a supervisors row, or the
    SUPER_ADMIN_EMAIL, which is staff without a supervisors row) — matched via their
    student_consent email. Kept separate from get_active_profiles so cohort / analytics
    / at-risk roll-ups keep excluding staff. Staff augmentation is best-effort: if the
    supervisors read fails, the board is just the students.

    This is the busiest read endpoint, so the base tables are scanned ONCE and reused for
    both halves — the active-student filter (inlined from get_active_profiles) and the
    staff join — rather than calling get_active_profiles (which re-reads profiles+consent)
    and reading them again here."""
    profiles = await get_all_profiles()
    approved = await get_all_approved()
    consent = await get_all_consent()
    # Active students: consent email still present in approved_students (mirrors
    # get_active_profiles exactly — revoked/unmatched profiles drop, fail closed).
    approved_emails = {
        (r.get("email") or "").strip().lower()
        for r in approved
        if (r.get("email") or "").strip()
    }
    active_ids = {
        str(c.get("student_id"))
        for c in consent
        if c.get("student_id") is not None
        and (c.get("email") or "").strip().lower() in approved_emails
    }
    students = [p for p in profiles if str(p.get("student_id")) in active_ids]
    try:
        supervisors = await get_all_supervisors()
    except Exception:
        return students
    staff_emails = {
        (s.get("email") or "").strip().lower()
        for s in supervisors
        if (s.get("email") or "").strip()
    }
    super_admin = super_admin_email()
    if super_admin:
        staff_emails.add(super_admin)
    if not staff_emails:
        return students
    staff_ids = {
        str(c.get("student_id"))
        for c in consent
        if c.get("student_id") is not None
        and (c.get("email") or "").strip().lower() in staff_emails
    }
    seen = {str(p.get("student_id")) for p in students}
    staff_profiles = [
        p for p in profiles
        if str(p.get("student_id")) in staff_ids and str(p.get("student_id")) not in seen
    ]
    return students + staff_profiles


async def get_staff_roster() -> list[dict]:
    """Trainers and admins for the analytics Staff section — every supervisors row
    (+ SUPER_ADMIN_EMAIL, which is staff without a supervisors row), joined to their
    student_consent name and student_profiles stats via email. Staff, like students,
    only get a consent/profile row on first login, so one who has never logged in has
    neither: they appear as status='pending' with email + role only. Kept separate
    from get_active_profiles so cohort / at-risk / benchmark roll-ups keep excluding
    staff. Role mirrors auth._normalise_staff_role: 'admin' stays admin, everything
    else (including the legacy 'supervisor' row) is a trainer."""
    supervisors = await get_all_supervisors()
    consent = await get_all_consent()
    profiles = await get_all_profiles()

    roles: dict[str, str] = {}  # email -> 'admin' | 'trainer'
    for s in supervisors:
        email = (s.get("email") or "").strip().lower()
        if not email:
            continue
        roles[email] = "admin" if (s.get("role") or "").strip().lower() == "admin" else "trainer"
    super_admin = os.getenv("SUPER_ADMIN_EMAIL", "").strip().lower()
    if super_admin:
        roles[super_admin] = "admin"  # the super-admin is always an admin
    if not roles:
        return []

    consent_by_email = {
        (c.get("email") or "").strip().lower(): c
        for c in consent
        if (c.get("email") or "").strip()
    }
    profile_by_id = {str(p.get("student_id")): p for p in profiles}

    result = []
    for email, role in roles.items():
        c = consent_by_email.get(email)
        sid = str(c["student_id"]) if c and c.get("student_id") is not None else ""
        p = profile_by_id.get(sid) if sid else None
        result.append({
            "student_id": sid,
            "full_name": (c.get("student_name") or "").strip() if c else "",
            "email": email,
            "role": role,
            "status": "active" if p else "pending",
            "session_count": int(p.get("session_count") or 0) if p else 0,
            "streak": int(p.get("streak") or 0) if p else 0,
            "last_active": str(p.get("last_active") or "") if p else "",
        })
    # Activated staff first, then pending; each alphabetical by name (falling back to email).
    result.sort(key=lambda r: (r["status"] != "active", (r["full_name"] or r["email"]).lower()))
    return result


async def _fetch_all(table: str, columns: str, *, order_by: str, page: int = 1000,
                     max_pages: int = 50, budget: float = 25.0) -> tuple[list[dict], bool]:
    """Read a whole table in `page`-sized `.order().range()` pages → (rows, complete).

    PostgREST caps rows server-side and a bare `.select()` cannot tell a complete result
    from a truncated one, so every unpaginated bulk read is a silent under-report waiting
    for the cohort to grow. A short page (fewer rows than `page`) is the only proof
    nothing remains, so that sets complete=True. Exhausting `max_pages`, or the time
    `budget`, without ever seeing a short page means rows may remain: complete=False, and
    the caller must present the figure as a floor, never as a total.

    `order_by` is REQUIRED and keyword-only. `.range()` compiles to `offset=N&limit=M`,
    and Postgres gives no ordering guarantee across LIMIT/OFFSET without an ORDER BY — a
    plan flip to a parallel seq scan can return worker-interleaved order that changes
    between executions, so pages silently overlap and skip rows and the total is wrong in
    BOTH directions, with complete=True still reported. Pass the table's primary key.

    `page` must not exceed the PostgREST deployment's `db-max-rows` setting. If it does,
    the server clamps every response below the requested page size, every page comes back
    short, and complete reports True on a read that is actually truncated — precisely the
    failure this function exists to prevent. This is a deployment-config invariant the
    function cannot detect from the response alone, so keep `page` at or below
    `db-max-rows` (test_bulk_read_flags_incomplete_when_server_clamps_page_size in
    tests/shared/test_db_bulk_reads.py pins this failure mode).

    `budget` bounds the WHOLE operation in wall-clock seconds, not one page — 50 pages at
    a fixed per-page timeout would have no outer bound, and prod is one uvicorn worker.
    Each page's own wait is capped at min(10s, remaining budget) — a 1000-row two-column
    read is sub-second in the healthy case, so 10s is already 10x headroom. If the budget
    is already gone before any row was read, the first page still gets its floor 1s and,
    if that itself can't complete, the exception propagates so the caller fails closed —
    degrading to `([], False)` instead would render as "≥ 0", a real measurement of zero
    for a read that never actually happened.
    """
    client = await _get_client()
    rows: list[dict] = []
    complete = False
    deadline = time.monotonic() + budget
    for i in range(max_pages):
        remaining = deadline - time.monotonic()
        if remaining <= 0 and rows:
            break
        start = i * page
        result = await asyncio.wait_for(
            client.table(table).select(columns).order(order_by)
            .range(start, start + page - 1).execute(),
            timeout=min(10.0, max(remaining, 1.0)),
        )
        batch = result.data or []
        rows.extend(batch)
        # A short page (including an empty one) is the only proof there is nothing left.
        # A table sized at an exact multiple of `page` still resolves correctly: the next
        # page comes back empty (0 < page), so complete=True — one extra request, never
        # ambiguous. complete only stays False if max_pages or budget runs out first,
        # without ever seeing a short page.
        if len(batch) < page:
            complete = True
            break
    return rows, complete


async def get_all_session_tokens() -> tuple[list[dict], bool]:
    """Every session's token count, paginated. Used by /api/admin/token-summary.

    A sibling of get_all_sessions, NOT a widening of it: that read is shared with
    /api/admin/activity and selects `*`, so uncapping it would pull every session's
    free-text summary too. Two columns only, ordered by chat_sessions' primary key
    (session_id — see tools/api/routers/admin.py's admin_student_detail, which already
    projects `s.get("session_id")` off a `select("*")` read of this same table; no base
    CREATE TABLE for chat_sessions lives in tools/db/migrations/ to check directly, since
    that directory is incremental migrations only and the base schema predates it) for a
    stable pagination order.
    """
    return await _fetch_all("chat_sessions", "student_id, token_count", order_by="session_id")


async def get_all_sessions(limit: int = 500) -> list[dict]:
    """Return recent sessions across all students. Used by admin dashboard."""
    client = await _get_client()
    result = (
        await client.table("chat_sessions")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


async def get_all_case_progress() -> list[dict]:
    """Return all case completion records. Used by admin dashboard."""
    client = await _get_client()
    result = (
        await client.table("case_progress")
        .select("*")
        .order("completed_at", desc=True)
        .execute()
    )
    return result.data or []


async def get_sessions_since(since_iso: str) -> list[dict]:
    """Sessions created at/after `since_iso` (ISO date or timestamp), all students.

    Windowed at the DB so the activity-trend endpoint never pulls the full table onto
    the single prod worker. Selects only the two columns the trend needs."""
    client = await _get_client()
    result = (
        await client.table("chat_sessions")
        .select("student_id, created_at")
        .gte("created_at", since_iso)
        .execute()
    )
    return result.data or []


async def get_case_progress_since(since_iso: str) -> list[dict]:
    """Case completions at/after `since_iso`, all students. See get_sessions_since."""
    client = await _get_client()
    result = (
        await client.table("case_progress")
        .select("student_id, completed_at")
        .gte("completed_at", since_iso)
        .execute()
    )
    return result.data or []


# ── approved_students ─────────────────────────────────────────────────────────

async def get_approved(email: str) -> dict | None:
    """Return the approved_students row for email, or None if not found."""
    client = await _get_client()
    result = (
        await client.table("approved_students")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_all_approved() -> list[dict]:
    """Return all rows from approved_students."""
    client = await _get_client()
    result = await client.table("approved_students").select("*").execute()
    return result.data or []


async def upsert_approved(
    email: str,
    full_name: str = "",
    role: str = "",
    added_by: str = "",
    added_at: str | None = None,
    student_id: str | None = None,
) -> None:
    """Insert or update an approved_students row."""
    client = await _get_client()
    payload: dict = {"email": email, "full_name": full_name, "role": role, "added_by": added_by}
    if added_at:
        payload["added_at"] = added_at
    if student_id:
        payload["student_id"] = student_id
    await client.table("approved_students").upsert(payload, on_conflict="email").execute()


async def update_approved(email: str, **fields) -> None:
    """Update specific fields on an approved_students row."""
    client = await _get_client()
    await client.table("approved_students").update(fields).eq("email", email).execute()


async def delete_approved(email: str) -> bool:
    """Delete an approved_students row. Returns True if a row was deleted."""
    client = await _get_client()
    result = await client.table("approved_students").delete().eq("email", email).execute()
    return len(result.data) > 0


# ── audit_events (migration 014 — durable audit trail) ──────────────────────────

async def insert_audit_event(
    action: str,
    actor: str = "system",
    target: str = "",
    feature: str = "admin",
    detail: str = "",
    ip: str | None = None,
) -> None:
    """Append one durable audit event to audit_events (who did what to whom, when, from where).

    BEST-EFFORT BY DESIGN: any failure — the table absent (pre-migration 014), the DB down,
    creds unset — is swallowed so an audit write can NEVER break the request that triggered
    it. This mirrors the philosophy of the legacy audit_log.py ("never crash a request
    because of it"), but writes to a durable, queryable Supabase table instead of the
    ephemeral, per-worker .tmp/audit_log.jsonl file."""
    try:
        client = await _get_client()
        await client.table("audit_events").insert(
            {
                "actor": actor,
                "action": action,
                "target": target,
                "feature": feature,
                "detail": detail,
                "ip": ip,
            }
        ).execute()
    except Exception:
        pass


async def get_recent_audit_events(limit: int = 100, action: str | None = None) -> list[dict]:
    """Return the most recent audit_events (newest first), optionally filtered by action.
    Raises if the table is missing (pre-migration 014) — the admin endpoint best-effort-catches."""
    client = await _get_client()
    query = client.table("audit_events").select("*")
    if action:
        query = query.eq("action", action)
    result = await query.order("ts", desc=True).limit(limit).execute()
    return result.data or []


# ── student_consent ───────────────────────────────────────────────────────────

async def get_consent_by_email(email: str) -> dict | None:
    """Return the student_consent row for email, or None.

    Ordered by the unique student_id so that when duplicate rows exist for one email
    (legacy data, or a first-login race before the UNIQUE(lower(email)) index) the pick is
    DETERMINISTIC. Without an ORDER BY, .limit(1) returns an arbitrary row and the same
    person's student_id can flip between logins — stranding their avatar_config/streak and
    re-firing the mandatory Eyecon Studio. (The dedupe migration makes this the only row.)"""
    client = await _get_client()
    result = (
        await client.table("student_consent")
        .select("*")
        .eq("email", email)
        .order("student_id")
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_consent_by_student_id(student_id: str) -> dict | None:
    """Return the student_consent row for student_id, or None."""
    client = await _get_client()
    result = (
        await client.table("student_consent")
        .select("*")
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_all_consent() -> list[dict]:
    """Return all rows from student_consent."""
    client = await _get_client()
    result = await client.table("student_consent").select("*").execute()
    return result.data or []


async def upsert_consent(student_id: str, student_name: str, email: str) -> None:
    """Insert or update a student_consent row (core identity fields only)."""
    client = await _get_client()
    await client.table("student_consent").upsert(
        {"student_id": student_id, "student_name": student_name, "email": email},
        on_conflict="student_id",
    ).execute()


async def update_consent(student_id: str, **fields) -> None:
    """Update specific fields on a student_consent row."""
    client = await _get_client()
    await client.table("student_consent").update(fields).eq("student_id", student_id).execute()


# ── leaderboard_settings (opt-in, supervisor-gated leaderboard) ───────────────

async def get_leaderboard_enabled(cohort: str = "SNEC") -> bool:
    """Whether the cohort leaderboard is on. ON by default (no explicit row) so it
    is there for students without setup; a supervisor can still turn it OFF, which
    stores an explicit row. Raises if the table is missing (pre-migration) — the
    caller catches and treats that as disabled."""
    client = await _get_client()
    result = (
        await client.table("leaderboard_settings")
        .select("enabled")
        .eq("cohort", cohort)
        .limit(1)
        .execute()
    )
    return bool(result.data[0]["enabled"]) if result.data else True


async def set_leaderboard_enabled(cohort: str, enabled: bool) -> None:
    """Enable/disable the cohort leaderboard (supervisor action)."""
    client = await _get_client()
    await client.table("leaderboard_settings").upsert(
        {"cohort": cohort, "enabled": enabled, "updated_at": "now()"},
        on_conflict="cohort",
    ).execute()


# ── supervisors ───────────────────────────────────────────────────────────────

async def get_supervisor(email: str) -> dict | None:
    """Return the supervisors row for email, or None."""
    client = await _get_client()
    result = (
        await client.table("supervisors")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_all_supervisors() -> list[dict]:
    """Return all rows from supervisors."""
    client = await _get_client()
    result = await client.table("supervisors").select("*").execute()
    return result.data or []


async def upsert_supervisor(
    email: str,
    role: str = "supervisor",
    cohort: str = "SNEC",
    supervisor_id: str = "",
) -> None:
    """Insert or update a supervisors row."""
    client = await _get_client()
    await client.table("supervisors").upsert(
        {"email": email, "role": role, "cohort": cohort, "supervisor_id": supervisor_id},
        on_conflict="email",
    ).execute()


async def delete_supervisor(email: str) -> None:
    """Delete a supervisors row."""
    client = await _get_client()
    await client.table("supervisors").delete().eq("email", email).execute()


# ── avatar_images (Selena 3D-portrait cache, migration 007) ───────────────────

async def get_avatar_image(config_hash: str) -> dict | None:
    """Return the cached portrait row for a config hash, or None.

    Raises if the table is missing (pre-migration 007) — callers catch that and
    fall back to the instant SVG (the portrait cache is a graceful add-on)."""
    client = await _get_client()
    result = (
        await client.table("avatar_images")
        .select("*")
        .eq("config_hash", config_hash)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_avatar_images_bulk(config_hashes: list[str]) -> dict[str, str]:
    """hash → public image URL for every READY portrait among the given hashes.
    One query (no N+1). Raises if the table is missing — callers degrade to {}."""
    if not config_hashes:
        return {}
    client = await _get_client()
    result = (
        await client.table("avatar_images")
        .select("config_hash,status,image_url")
        .in_("config_hash", list(set(config_hashes)))
        .execute()
    )
    return {
        r["config_hash"]: r["image_url"]
        for r in (result.data or [])
        if r.get("status") == "ready" and r.get("image_url")
    }


async def upsert_avatar_image(
    config_hash: str, status: str, image_url: str | None = None
) -> None:
    """Insert or update a portrait cache row (keyed by config_hash). status ∈
    pending|ready|failed."""
    client = await _get_client()
    payload: dict = {"config_hash": config_hash, "status": status, "updated_at": "now()"}
    if image_url is not None:
        payload["image_url"] = image_url
    await client.table("avatar_images").upsert(payload, on_conflict="config_hash").execute()
