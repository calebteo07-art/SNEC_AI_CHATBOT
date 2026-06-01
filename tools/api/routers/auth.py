"""Auth and onboarding endpoints."""
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from tools.api.shared import limiter, SUPER_ADMIN_EMAIL
from tools.shared import db
from tools.shared.auth import hash_password, verify_password, generate_password
from tools.shared.gemini_client import MOCK_MODE
from tools.shared.gsheets import get_rows_async, update_row_async
from tools.shared.identity import get_or_create_student, has_consented, record_consent
from tools.shared.jwt_utils import create_access_token, get_current_user, CurrentUser, set_auth_cookie, clear_auth_cookie
from tools.shared.otp_store import set_otp, verify_and_consume_otp

router = APIRouter()


class OnboardRequest(BaseModel):
    full_name: str
    email: str
    student_role: str = ""  # OA | OT | PSA (empty for supervisors)

class OnboardResponse(BaseModel):
    student_id: str
    mock_mode: bool
    role: str = "student"  # "student" or "supervisor"
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
    student_id: str
    current_password: str
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


@limiter.limit("5/minute")
@router.post("/api/auth/login", response_model=LoginResponse)
async def auth_login(request: Request, body: LoginRequest, response: Response):
    email = body.email.strip().lower()

    # Must be in approved list
    approved = await get_rows_async("snec_approved_students", filters={"email": email})
    if not approved:
        # Also allow super admin and promoted supervisors/admins
        sup_rows = await get_rows_async("snec_supervisors", filters={"email": email})
        if email != SUPER_ADMIN_EMAIL and not sup_rows:
            raise HTTPException(status_code=403, detail="Not in approved list. Contact your administrator.")
        approved_role = "admin" if (email == SUPER_ADMIN_EMAIL or (sup_rows and sup_rows[0].get("role") == "admin")) else "supervisor"
        approved_student_role = ""
    else:
        approved_role = "student"
        approved_student_role = approved[0].get("role", "")

    # Check password hash
    auth_row = await db.get_auth(email)
    must_change = True
    if auth_row:
        stored_hash = auth_row.get("password_hash", "")
        if stored_hash and not verify_password(body.password, stored_hash):
            raise HTTPException(status_code=401, detail="Incorrect password.")
        must_change = bool(auth_row.get("must_change", True))
    else:
        # Legacy account — no hash stored; accept any password, force change
        must_change = True

    # Create/fetch student identity
    full_name = approved[0].get("full_name", email) if approved else email
    student_id = await get_or_create_student(full_name, email)
    is_new = not await has_consented(student_id)

    # Determine role from supervisors sheet if not a plain student
    final_role = approved_role
    if approved_role == "student":
        sup_rows = await get_rows_async("snec_supervisors", filters={"email": email})
        if sup_rows:
            final_role = sup_rows[0].get("role") or "supervisor"
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
    return MeResponse(
        student_id=current_user["sub"],
        role=current_user["role"],
        student_role=current_user["student_role"],
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
    consent = await get_rows_async("snec_consent", filters={"student_id": student_id})
    if not consent:
        raise HTTPException(status_code=404, detail="Student not found.")
    email = consent[0].get("email", "").strip().lower()

    auth_row = await db.get_auth(email)
    if auth_row:
        row_must_change = bool(auth_row.get("must_change", True))
        stored_hash = auth_row.get("password_hash", "")
        # Skip current-password check when this is a forced first-time reset
        if not row_must_change and stored_hash and not verify_password(body.current_password, stored_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

    new_hash = hash_password(body.new_password)
    await db.upsert_auth(email, new_hash, must_change=False)
    return {"ok": True}


@limiter.limit("3/minute")
@router.post("/api/auth/request-reset")
async def auth_request_reset(request: Request, body: RequestResetRequest):
    email = body.email.strip().lower()
    # Always return ok so we don't reveal whether the email exists
    approved = await get_rows_async("snec_approved_students", filters={"email": email})
    sup_rows = await get_rows_async("snec_supervisors", filters={"email": email})
    if not approved and email != SUPER_ADMIN_EMAIL and not sup_rows:
        return {"ok": True}

    otp = "".join(str(secrets.randbelow(10)) for _ in range(6))
    set_otp(email, otp)

    try:
        from tools.shared.gmail_sender import send_email as _send_email
        _send_email(
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
async def auth_reset_password(body: ResetPasswordRequest):
    email = body.email.strip().lower()
    otp = body.otp.strip()

    if not verify_and_consume_otp(email, otp):
        raise HTTPException(status_code=400, detail="Incorrect or expired reset code.")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    new_hash = hash_password(body.new_password)
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
            supervisors = await get_rows_async("snec_supervisors", filters={"email": email})
            if supervisors:
                role = "admin" if supervisors[0].get("role", "").lower() == "admin" else "supervisor"
        except Exception:
            pass

        if role == "student":
            # Check approved students whitelist
            try:
                approved = await get_rows_async("snec_approved_students", filters={"email": email})
            except Exception:
                approved = []
            if not approved:
                raise HTTPException(
                    status_code=403,
                    detail="Access restricted. Contact your administrator to request access.",
                )
            # Pre-fill role from whitelist if student didn't supply one
            if not student_role and approved[0].get("role", "").upper() in ("OA", "OT", "PSA"):
                student_role = approved[0]["role"].upper()

    student_id = await get_or_create_student(body.full_name.strip(), email)
    if not await has_consented(student_id):
        await record_consent(student_id)

    # Link student_id back to approved record
    if role == "student":
        try:
            await update_row_async("snec_approved_students", "email", email, {"student_id": student_id})
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
