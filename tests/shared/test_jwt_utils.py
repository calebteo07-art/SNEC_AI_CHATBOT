import pytest
from fastapi import HTTPException


def test_create_and_decode_token():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("student-uuid-123", "student", "OA")
    assert isinstance(token, str)
    assert len(token) > 20

    payload = decode_token(token)
    assert payload["sub"] == "student-uuid-123"
    assert payload["role"] == "student"
    assert payload["student_role"] == "OA"


def test_decode_invalid_token_raises_401():
    from tools.shared.jwt_utils import decode_token
    with pytest.raises(HTTPException) as exc_info:
        decode_token("not.a.valid.token")
    assert exc_info.value.status_code == 401


def test_decode_tampered_token_raises_401():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("student-uuid-123", "student", "OA")
    parts = token.split(".")
    tampered = parts[0] + "." + parts[1] + ".badsignature"
    with pytest.raises(HTTPException) as exc_info:
        decode_token(tampered)
    assert exc_info.value.status_code == 401


def test_supervisor_role_in_token():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("supervisor-uuid", "supervisor", "")
    payload = decode_token(token)
    assert payload["role"] == "supervisor"
    assert payload["student_role"] == ""


def test_admin_role_in_token():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("admin-uuid", "admin", "")
    payload = decode_token(token)
    assert payload["role"] == "admin"
