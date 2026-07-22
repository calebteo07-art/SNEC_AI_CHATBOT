"""Auth and onboarding endpoints."""
import asyncio
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from tools.api.shared import limiter, SUPER_ADMIN_EMAIL
from tools.shared import db
from tools.shared.auth import hash_password, verify_password, generate_password
from tools.shared.gemini_client import MOCK_MODE
from tools.shared.identity import get_or_create_student, has_consented, record_consent, sync_roster_name
from tools.shared.jwt_utils import create_access_token, get_current_user, CurrentUser, set_auth_cookie, clear_auth_cookie
from tools.shared.otp_store import set_otp, verify_and_consume_otp

router = APIRouter()


def _normalise_staff_role(raw: str) -> str:
    """Map a stored supervisors.role to a top-level staff role.

    Legacy 'supervisor' rows normalise to 'trainer' (safe demotion: keeps
    analytics, loses provisioning); 'admin' passes through; anything else falls
    back to 'trainer'. 'supervisor' is removed as a top-level role everywhere.
    """
    return "admin" if (raw or "").strip().lower() == "admin" else "trainer"


class OnboardRequest(BaseModel):
    full_name: str
    email: str
    student_role: str = ""  # OA | OT | PSA (empty for supervisors)

class OnboardResponse(BaseModel):
    student_id: str
    mock_mode: bool
    role: str = "student"  # "student" | "trainer" | "admin"
    student_role: str = ""  # OA | OT | PSA

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    student_id: str
    full_name: str
    role: str
    student_role: str
    must_change: bool
    is_new: bool
    mock_mode: bool

class ChangePasswordRequest(BaseModel):
    # NB: the identity comes from the JWT (current_user["sub"]), never the body —
    # so no student_id field here. The forced first-time flow sends only these two.
    current_password: str = ""
    new_password: str

class RequestResetRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

class MeResponse(BaseModel):
    student_id: str
    role: str
    student_role: str
    full_name: str
    email: str
    must_change: bool


@router.post("/api/auth/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def auth_login(request: Request, body: LoginRequest, response: Response):
    email = body.email.strip().lower()

    # The super-admin is authorised by SUPER_ADMIN_EMAIL alone, independently of any
    # table — so an unset (blank) env var must never match a blank email.
    is_super_admin = bool(SUPER_ADMIN_EMAIL) and email == SUPER_ADMIN_EMAIL

    # Must be in approved list
    approved_row = await db.get_approved(email)
    if not approved_row:
        # Also allow super admin and promoted supervisors/admins
        sup_row = await db.get_supervisor(email)
        if not is_super_admin and not sup_row:
            raise HTTPException(status_code=403, detail="Not in approved list. Contact your administrator.")
        approved_role = _normalise_staff_role(sup_row.get("role") if sup_row else "")
        approved_student_role = ""
    else:
        approved_role = "student"
        approved_student_role = approved_row.get("role", "")

    # A usable password hash is REQUIRED to authenticate. An account with no hash
    # — never provisioned, or a legacy row with a blank hash — must NOT be logged
    # in on an arbitrary string; it sets a first password through the reset flow.
    # This closes the old "accept any password" hole, including super-admin and
    # supervisor first-login privilege escalation.
    auth_row = await db.get_auth(email)
    stored_hash = auth_row.get("password_hash", "") if auth_row else ""
    if not stored_hash:
        raise HTTPException(
            status_code=403,
            detail="No password is set for this account. Use 'Forgot password' to create one.",
        )
    if not await asyncio.to_thread(verify_password, body.password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    must_change = bool(auth_row.get("must_change", True))

    # Create/fetch student identity, then settle on what to call them. The admin-entered
    # roster name wins and heals a stale stored one; staff (the super-admin and promoted
    # supervisors) have no approved_students row at all, so for them the stored consent
    # name is the only name there is — and without it they'd be greeted by their address.
    roster_name = (approved_row.get("full_name") or "").strip() if approved_row else ""
    student_id, stored_name = await get_or_create_student(roster_name or email, email)
    full_name = await sync_roster_name(student_id, stored_name, roster_name) or email
    is_new = not await has_consented(student_id)

    # Link the identity back to the approved row on first login so the admin roster's
    # Active/Pending badge flips to Active now — not only via /api/onboard. A student who
    # logs in but never onboards would otherwise show "Pending" forever.
    if approved_row is not None and not approved_row.get("student_id"):
        try:
            await db.update_approved(email, student_id=student_id)
        except Exception:
            pass

    # Settle the role. SUPER_ADMIN_EMAIL outranks an approved_students row: adding the
    # super-admin's own address to the roster — the natural way to give the account a
    # name — used to demote them to a student, and the promotion pass below cannot undo
    # it because they have no supervisors row to be promoted from. /api/onboard already
    # gives the env var this priority; login was the outlier.
    final_role = approved_role
    if is_super_admin:
        final_role = "admin"
        approved_student_role = ""
    # Determine role from supervisors table if not a plain student
    elif approved_role == "student":
        sup_row = await db.get_supervisor(email)
        if sup_row:
            final_role = _normalise_staff_role(sup_row.get("role"))
            approved_student_role = ""

    token = create_access_token(student_id, final_role, approved_student_role)
    set_auth_cookie(response, token)

    return LoginResponse(
        student_id=student_id,
        full_name=full_name,
        role=final_role,
        student_role=approved_student_role,
        must_change=must_change,
        is_new=is_new,
        mock_mode=MOCK_MODE,
    )


@router.get("/api/auth/me", response_model=MeResponse)
@limiter.limit("60/minute")
async def auth_me(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """Validate a token and return the caller's identity. Used by the frontend on app load."""
    student_id = current_user["sub"]
    consent_row = await db.get_consent_by_student_id(student_id)
    email = consent_row["email"] if consent_row else ""
    full_name = consent_row["student_name"] if consent_row else ""
    auth_row = await db.get_auth(email) if email else None
    must_change = bool(auth_row.get("must_change", False)) if auth_row else False
    # student_role = the effective content pool from student_profiles.role (the
    # homepage toggle writes it for staff); fall back to the JWT claim.
    profile = await db.get_profile(student_id)
    student_role = (profile.get("role") if profile else "") or current_user["student_role"]
    return MeResponse(
        student_id=student_id,
        role=current_user["role"],
        student_role=student_role,
        full_name=full_name,
        email=email,
        must_change=must_change,
    )


@router.post("/api/auth/logout")
async def auth_logout(response: Response):
    """Clear the auth cookie and end the session."""
    clear_auth_cookie(response)
    return {"ok": True}


@router.post("/api/auth/change-password")
async def auth_change_password(body: ChangePasswordRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]  # identity from JWT
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    # Resolve email from student_id
    consent_row = await db.get_consent_by_student_id(student_id)
    if not consent_row:
        raise HTTPException(status_code=404, detail="Student not found.")
    email = consent_row.get("email", "").strip().lower()

    auth_row = await db.get_auth(email)
    if auth_row:
        row_must_change = bool(auth_row.get("must_change", True))
        stored_hash = auth_row.get("password_hash", "")
        # Skip current-password check when this is a forced first-time reset
        if not row_must_change and stored_hash and not await asyncio.to_thread(verify_password, body.current_password, stored_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

    new_hash = await asyncio.to_thread(hash_password, body.new_password)
    await db.upsert_auth(email, new_hash, must_change=False)
    return {"ok": True}


@router.post("/api/auth/request-reset")
@limiter.limit("3/minute")
async def auth_request_reset(request: Request, body: RequestResetRequest):
    email = body.email.strip().lower()
    # Always return ok so we don't reveal whether the email exists
    approved_row = await db.get_approved(email)
    sup_row = await db.get_supervisor(email)
    if not approved_row and email != SUPER_ADMIN_EMAIL and not sup_row:
        return {"ok": True}

    otp = "".join(str(secrets.randbelow(10)) for _ in range(6))
    await asyncio.to_thread(set_otp, email, otp)

    try:
        from tools.shared.gmail_sender import send_email as _send_email
        await asyncio.to_thread(
            _send_email,
            to=email,
            subject="EyeBot — your password reset code",
            html=f"""<p>Your EyeBot password reset code is:</p>
<p style="font-size:2rem;letter-spacing:0.3em;font-weight:bold">{otp}</p>
<p>This code expires in 15 minutes. If you did not request this, ignore this email.</p>
<p>EyeBot · SNEC</p>""",
        )
    except Exception:
        pass  # don't reveal email failures to the caller

    return {"ok": True}


@router.post("/api/auth/reset-password")
@limiter.limit("5/minute")
async def auth_reset_password(request: Request, body: ResetPasswordRequest):
    email = body.email.strip().lower()
    otp = body.otp.strip()

    if not await asyncio.to_thread(verify_and_consume_otp, email, otp):
        raise HTTPException(status_code=400, detail="Incorrect or expired reset code.")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    new_hash = await asyncio.to_thread(hash_password, body.new_password)
    await db.upsert_auth(email, new_hash, must_change=False)
    return {"ok": True}


@router.post("/api/onboard", response_model=OnboardResponse)
async def onboard(body: OnboardRequest):
    if not body.full_name.strip() or not body.email.strip():
        raise HTTPException(status_code=400, detail="full_name and email are required")

    email = body.email.strip().lower()

    # ── Determine role and access ──────────────────────────────────────────
    role = "student"
    student_role = body.student_role.strip().upper() if body.student_role else ""

    if email == SUPER_ADMIN_EMAIL:
        role = "admin"
    else:
        # Check supervisor list
        try:
            sup_row = await db.get_supervisor(email)
            if sup_row:
                role = _normalise_staff_role(sup_row.get("role"))
        except Exception:
            pass

        if role == "student":
            # Check approved students whitelist
            try:
                approved_row = await db.get_approved(email)
            except Exception:
                approved_row = None
            if not approved_row:
                raise HTTPException(
                    status_code=403,
                    detail="Access restricted. Contact your administrator to request access.",
                )
            # Pre-fill role from whitelist if student didn't supply one
            if not student_role and approved_row.get("role", "").upper() in ("OA", "OT", "PSA"):
                student_role = approved_row["role"].upper()

    student_id, _ = await get_or_create_student(body.full_name.strip(), email)
    if not await has_consented(student_id):
        await record_consent(student_id)

    # Link student_id back to approved record
    if role == "student":
        try:
            await db.update_approved(email, student_id=student_id)
        except Exception:
            pass

    if role == "student" and student_role in ("OA", "OT", "PSA"):
        try:
            from tools.profile.update_profile import update_profile
            await update_profile(student_id, role=student_role)
        except Exception:
            pass

    return OnboardResponse(
        student_id=student_id,
        mock_mode=MOCK_MODE,
        role=role,
        student_role=student_role,
    )
