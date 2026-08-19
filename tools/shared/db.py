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


# ── leagues (migration 016) ───────────────────────────────────────────────────
# Every helper here tolerates the tables being absent: the league ships dark and lights
# up when 016 is applied, so main is deployable at every commit.

async def take_seal(key: str) -> bool:
    """Claim a once-per-period job. True means this caller won the race and must do the
    work; False means someone else already has it, or the table isn't there yet.

    A transient failure also returns False and leaves no seal row, so the next request
    simply retries — the guard is self-healing rather than a one-shot."""
    try:
        client = await _get_client()
        await client.table("league_seal").insert({"key": key}).execute()
        return True
    except Exception:
        return False


async def release_seal(key: str) -> None:
    """Give back a seal whose work failed, so the next caller retries it.

    Without this a transient error during a rollover would leave the week marked closed
    with no outcomes written and no path to recovery short of manual SQL."""
    client = await _get_client()
    try:
        await client.table("league_seal").delete().eq("key", key).execute()
    except Exception:
        pass


async def upsert_league_week(rows: list[dict]) -> None:
    """Persist closed-week rows. Idempotent on (student_id, week_start): replaying a
    rollover overwrites with identical values instead of duplicating history."""
    if not rows:
        return
    client = await _get_client()
    await client.table("league_week").upsert(
        rows, on_conflict="student_id,week_start",
    ).execute()


async def seal_week_score(student_id: str, week_start: str, division: int, xp_final: int) -> None:
    """Record one student's final score for a week that just closed, without clobbering a
    row the rollover already completed (`ignore_duplicates`) — this is the earn-path writer
    racing the read-path sweep, and the first correct answer wins."""
    try:
        client = await _get_client()
        await client.table("league_week").upsert(
            {"student_id": student_id, "week_start": week_start,
             "division": int(division or 1), "xp_final": int(xp_final or 0)},
            ignore_duplicates=True,
        ).execute()
    except Exception:
        pass


async def get_league_week(student_id: str, week_start: str) -> dict | None:
    """One student's closed-week row, or None (including pre-migration)."""
    client = await _get_client()
    try:
        result = (
            await client.table("league_week").select("*")
            .eq("student_id", student_id).eq("week_start", week_start)
            .limit(1).execute()
        )
    except Exception:
        return None
    rows = result.data or []
    return rows[0] if rows else None


async def get_league_week_all(week_start: str) -> list[dict]:
    """Every stored row for a week — the rollover reads this to find who was already
    sealed by the earn path. Empty pre-migration."""
    client = await _get_client()
    try:
        result = (
            await client.table("league_week").select("*")
            .eq("week_start", week_start).execute()
        )
    except Exception:
        return []
    return result.data or []


async def set_rank_prev_bulk(ranks: dict[str, int], day: str) -> None:
    """Stamp today's rank onto each profile so tomorrow's board can show movement arrows.
    Runs once per day behind a seal, in a background task — never on the request path."""
    for student_id, rank in ranks.items():
        try:
            await update_profile(student_id, rank_prev=int(rank), rank_prev_day=day)
        except Exception:
            continue  # one bad row must not abandon the rest of the snapshot


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
    checklist_coverage: int | None = None,
    grade_scale: int | None = None,
    checklist_detail: list | None = None,
) -> None:
    """Append a case completion record. The rich OSCE-grade columns are additive and
    nullable (migrations 011, 017 and 019); when any are supplied we try the full insert
    first and, if a column is absent (pre-migration), shed one migration LAYER at a time —
    newest first — so the submit path stays green until the migration is applied.

    Shedding is incremental, not all-or-nothing, and that is load-bearing. 019 shipped to an
    auto-deploying `main` before its ALTER was run; under the old collapse-to-base fallback
    that one unknown column cost eight live ones (score_100, safe, both sub-scores,
    missed_critical, coaching, checklist_coverage, grade_scale) on every single attempt,
    silently — the exception was swallowed, the base insert succeeded, and a clean
    `case_completed` audit event was still written. 017's ledger entry warned about this
    in writing two days earlier. An unapplied migration must only ever cost its own columns.

    `grade_scale` records which maxima the sub-scores use, so the /50 era and the current
    /30 one stay legible side by side; NULL means the row predates the stamp. Both it and
    `checklist_coverage` are written on `is not None`, never on truthiness — coverage 0 is
    a real score, and degrading it to NULL would relabel a current row as legacy.

    `checklist_detail` is the per-step ledger (migration 019): which steps were performed,
    which were skipped, in the station's own phase grouping. NULL means the row predates the
    column, never that nothing was performed."""
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
    if checklist_coverage is not None:
        rich["checklist_coverage"] = checklist_coverage
    if grade_scale is not None:
        rich["grade_scale"] = grade_scale
    # Migration 019. `is not None`, so an empty ledger (a case that resolved zero steps) is
    # still written as [] and stays distinguishable from a pre-019 row, which is NULL.
    if checklist_detail is not None:
        rich["checklist_detail"] = checklist_detail

    # Newest migration first. Each retry drops exactly one layer, so a DB at 011 still
    # persists the whole 011 grade and loses only 017's and 019's columns.
    layers = (
        ("checklist_detail",),                  # 019
        ("checklist_coverage", "grade_scale"),  # 017
    )
    attempts = [rich]
    for layer in layers:
        leaner = {k: v for k, v in attempts[-1].items() if k not in layer}
        if len(leaner) != len(attempts[-1]):  # only a payload that actually shrank is new
            attempts.append(leaner)
    if len(attempts[-1]) != len(base):
        attempts.append(base)  # 011 absent too — the last honest thing we can store

    for i, payload in enumerate(attempts):
        try:
            await client.table("case_progress").insert(payload).execute()
            return
        except Exception:
            if i == len(attempts) - 1:  # nothing left to shed → the error is real
                raise


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


# ── flashcard_deck_progress (migration 015 — the per-topic 5-deck ladder) ─────

async def get_completed_deck_levels(student_id: str) -> dict[str, set[int]]:
    """{topic_key: {cleared deck levels}} for a student. Raises if the table is
    missing (pre-migration 015) — callers treat that as no progress, so the ladder
    degrades to deck 1 and full earning rather than locking anyone out."""
    client = await _get_client()
    result = (
        await client.table("flashcard_deck_progress")
        .select("topic_key, level")
        .eq("student_id", student_id)
        .execute()
    )
    out: dict[str, set[int]] = {}
    for row in (result.data or []):
        out.setdefault(row["topic_key"], set()).add(int(row["level"]))
    return out


async def mark_deck_complete(student_id: str, topic_key: str, level: int) -> None:
    """Record a cleared deck. Idempotent on the composite PK, so replaying a level
    keeps its original completed_at instead of double-counting progress."""
    client = await _get_client()
    await client.table("flashcard_deck_progress").upsert(
        {"student_id": student_id, "topic_key": topic_key, "level": level},
        ignore_duplicates=True,
    ).execute()


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
    matched to an approved row is excluded (fail closed).

    WARNING — this is NOT staff-free, despite what this docstring used to claim. The
    only filter is approved_students membership; there is no supervisors check here.
    Natively-created staff never get an approved_students row (admin_approve_student
    refuses one for TRAINER/ADMIN), but two kinds of staff DO land in this result:
    a PROMOTED student (admin_promote adds a supervisors row and leaves the roster row
    in place) and the SUPER_ADMIN_EMAIL account (staff without a supervisors row, whose
    address is routinely added to the roster to give the account a name). Both keep a
    genuine "OA"/"OT" in student_profiles.role, so a cohort roll-up built on this counts
    them as students. Use get_active_student_profiles() when staff must be excluded;
    get_active_leaderboard_profiles adds staff back in deliberately."""
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
                     max_pages: int = 50, budget: float = 25.0,
                     gte: tuple[str, str] | None = None) -> tuple[list[dict], bool]:
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

    `gte` optionally windows the read as `(column, value)`, with the same paging
    guarantees applied to the slice. A windowed bulk read still needs paging: "only 90
    days" is not a row bound, and the cohort that first outgrows 1000 rows in a window is
    exactly the one whose trend a trainer most wants to see.
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
        query = client.table(table).select(columns)
        # Rebuilt per page, like the rest of the chain: postgrest-py builders accumulate
        # query params on a mutable object, so a filter hoisted out of the loop would be
        # re-applied to a builder that already carries the previous page's `.range()`.
        if gte is not None:
            query = query.gte(gte[0], gte[1])
        result = await asyncio.wait_for(
            query.order(order_by).range(start, start + page - 1).execute(),
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


async def get_case_scores_since(since_iso: str) -> tuple[list[dict], bool]:
    """Graded case attempts at/after `since_iso`, all students, paged: (rows, complete).

    A SIBLING of get_case_progress_since, deliberately not a widening of it: that read's
    two-column projection exists so /api/admin/activity-trend "never pulls the full table
    onto the single prod worker", and adding grade columns there would change the cost of
    a shipped endpoint that does not read them.

    Windowed AND paged. The window is not a row bound — 90 days of a growing cohort can
    exceed PostgREST's cap, and an unpaged read cannot tell a full result from a truncated
    one, so the trend would quietly lose its oldest days and redraw its own shape.

    Grade columns stay NULL on pre-Tier-2 rows; passed through untouched so the caller can
    hold each metric to its own denominator rather than averaging invented zeros.

    `grade_scale` (migration 017) rides along because score_100 is NOT comparable across
    the 2026-08-04 rescale: 2 is the 40/30/30 era, NULL the retired x50 one. Without the
    stamp a 90-day window averages two different instruments as one series and draws the
    rescale as a cohort trend. One SMALLINT per row — the projection stays a projection,
    and the CALLER decides what to do with the stamp.
    """
    return await _fetch_all(
        "case_progress",
        "student_id, completed_at, case_id, score_100, safe, passed, grade_scale",
        order_by="id",
        gte=("completed_at", since_iso),
    )


async def get_all_flashcard_attempts() -> tuple[list[dict], bool]:
    """Every flashcard attempt across all students, paged: (rows, complete).

    Projects only the four columns cohort analytics reads. `select("*")` here would pull
    card_id + score for every row on the product's highest-volume table onto the single
    prod worker, and no aggregator reads either. Ordered by attempt_id, the table's
    primary key (migration 010), for a stable pagination order.

    RAISES on a missing table (pre-migration 010), exactly like get_flashcard_attempts.
    No PostgREST exception type is importable in this tree, so the CALLER must catch bare
    Exception and flag sources.flashcard = "unavailable" — never swallow the failure into
    ([], True) here, which would render an outage as a confident 0% cohort accuracy."""
    return await _fetch_all("flashcard_attempts", "student_id, topic_tag, correct, ts",
                            order_by="attempt_id")


async def get_all_case_scores() -> tuple[list[dict], bool]:
    """Graded case attempts across all students, paged: (rows, complete).

    A SIBLING of get_all_case_progress, not a replacement: that one selects "*" and is
    shared with /api/admin/activity, whose feed emits score_100/safe/missed_critical from
    it — narrowing it there would blank fields on a shipped endpoint. This projection
    omits the `coaching` JSONB (a per-row feedback blob) and the two sub-domain scores,
    none of which cohort aggregation reads; per-row JSONB is what makes a full-table
    analytics scan expensive. Ordered by case_progress' `id` primary key for a stable
    pagination order.

    Grade columns stay NULL on pre-Tier-2 rows (over half of production today) — pass
    them through untouched so the aggregator can hold each metric to its own denominator
    instead of averaging invented zeros.

    `missed_critical` is in the projection because it is the ONLY source for
    osce_by_group's `missed_top` — without it that panel is permanently empty. It is a
    short list of step labels, not the `coaching` blob."""
    return await _fetch_all(
        "case_progress",
        "student_id, case_id, completed_at, score_100, safe, passed, total_score, "
        "missed_critical",
        order_by="id",
    )


async def get_active_student_profiles() -> tuple[list[dict], int]:
    """Active profiles with STAFF subtracted: (students, staff_excluded).

    get_active_profiles() is NOT staff-free despite what its docstring used to claim: it
    filters on approved_students membership alone, with no supervisors check. Staff leak
    in two ways — admin_promote upserts a supervisors row but leaves the promoted
    student's approved_students row in place, and SUPER_ADMIN_EMAIL is staff without a
    supervisors row whose address is routinely added to the roster to give the account a
    name (see the role-settling comment in auth.py's login). A leaked trainer keeps the
    genuine "OA"/"OT" that the staff-only pool toggle (PATCH /api/profile/role) writes,
    so cohort denominators count them as a student indefinitely.

    Staff is a MEMBERSHIP property, not a role: this is the same supervisors join
    get_active_leaderboard_profiles uses to add staff back in, applied in reverse.
    Composes get_active_profiles rather than inlining that filter a third time — the
    extra student_consent read is immaterial on an endpoint already doing full-table
    scans, and a hand-copy that drifts is the bigger risk (get_active_leaderboard_profiles
    inlines it deliberately for the opposite reason: it is the busiest read in the app).

    RAISES if the supervisors read fails, which 500s the cohort endpoint: its population
    read has no per-source degrade. Deliberate — failing open would silently restore the
    inflated cohort this exists to fix, reported as if it were filtered, and an inflated
    denominator that looks correct is worse than a visible outage. Returns the excluded
    count so the endpoint can show it rather than just shrinking."""
    students = await get_active_profiles()
    supervisors = await get_all_supervisors()
    staff_emails = {
        (s.get("email") or "").strip().lower()
        for s in supervisors
        if (s.get("email") or "").strip()
    }
    super_admin = super_admin_email()
    if super_admin:
        staff_emails.add(super_admin)
    if not staff_emails:
        return students, 0
    consent = await get_all_consent()
    staff_ids = {
        str(c.get("student_id"))
        for c in consent
        if c.get("student_id") is not None
        and (c.get("email") or "").strip().lower() in staff_emails
    }
    kept = [p for p in students if str(p.get("student_id")) not in staff_ids]
    return kept, len(students) - len(kept)


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
