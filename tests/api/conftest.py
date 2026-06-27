"""Shared test helpers for API endpoint tests."""
from tools.shared.jwt_utils import create_access_token


def auth_headers(role: str = "OA", sub: str = "stud-test") -> dict:
    """Return headers dict that authenticates an httpx AsyncClient request.

    Mints a JWT via the same utility prod uses and passes it in a Cookie header
    (the FastAPI app reads ``eyebot_token`` from cookies).
    """
    token = create_access_token(sub, "student", role)
    return {"Cookie": f"eyebot_token={token}"}
