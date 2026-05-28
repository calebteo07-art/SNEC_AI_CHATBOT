import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from typing import TypedDict

_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-set-JWT_SECRET-in-env")
_ALGORITHM = "HS256"
_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "8"))


class CurrentUser(TypedDict):
    sub: str           # student_id (UUID)
    role: str          # "student" | "supervisor" | "admin"
    student_role: str  # "OA" | "OT" | "PSA" | ""


def create_access_token(student_id: str, role: str, student_role: str = "") -> str:
    payload = {
        "sub": student_id,
        "role": role,
        "student_role": student_role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=_EXPIRE_HOURS),
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def decode_token(token: str) -> CurrentUser:
    try:
        payload = jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
        return CurrentUser(
            sub=payload["sub"],
            role=payload.get("role", "student"),
            student_role=payload.get("student_role", ""),
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def get_current_user(authorization: str = Header(...)) -> CurrentUser:
    """FastAPI dependency: extracts and verifies JWT from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must start with 'Bearer '",
        )
    return decode_token(authorization[7:])


def require_supervisor(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """FastAPI dependency: requires supervisor or admin role."""
    if current_user["role"] not in ("supervisor", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supervisor access required")
    return current_user


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """FastAPI dependency: requires admin role."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
