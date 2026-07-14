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


def test_trainer_role_in_token():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("trainer-uuid", "trainer", "")
    payload = decode_token(token)
    assert payload["role"] == "trainer"
    assert payload["student_role"] == ""


def test_admin_role_in_token():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("admin-uuid", "admin", "")
    payload = decode_token(token)
    assert payload["role"] == "admin"
    assert payload["student_role"] == ""


def test_decode_token_missing_sub_raises_401():
    """A validly-signed token without 'sub' must return 401, not 500."""
    from jose import jwt as _jwt
    from datetime import datetime, timedelta, timezone
    from tools.shared.jwt_utils import decode_token, _SECRET, _ALGORITHM
    payload = {
        # intentionally omit "sub"
        "role": "student",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    bad_token = _jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)
    with pytest.raises(HTTPException) as exc_info:
        decode_token(bad_token)
    assert exc_info.value.status_code == 401


def test_get_current_user_missing_cookie_raises_401():
    from tools.shared.jwt_utils import get_current_user
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(eyebot_token=None)
    assert exc_info.value.status_code == 401


def test_get_current_user_valid_cookie():
    from tools.shared.jwt_utils import create_access_token, get_current_user
    token = create_access_token("stu-123", "student", "OA")
    result = get_current_user(eyebot_token=token)
    assert result["sub"] == "stu-123"
    assert result["role"] == "student"


def test_require_staff_with_student_token_raises_403():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_staff
    token = create_access_token("student-id", "student", "OA")
    user = decode_token(token)
    with pytest.raises(HTTPException) as exc_info:
        require_staff(current_user=user)
    assert exc_info.value.status_code == 403


def test_require_admin_with_trainer_token_raises_403():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_admin
    token = create_access_token("trainer-id", "trainer", "")
    user = decode_token(token)
    with pytest.raises(HTTPException) as exc_info:
        require_admin(current_user=user)
    assert exc_info.value.status_code == 403


def test_require_staff_passes_for_admin_role():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_staff
    token = create_access_token("admin-id", "admin", "")
    user = decode_token(token)
    result = require_staff(current_user=user)
    assert result["role"] == "admin"


def test_require_staff_passes_for_trainer_role():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_staff
    token = create_access_token("trainer-id", "trainer", "")
    user = decode_token(token)
    result = require_staff(current_user=user)
    assert result["role"] == "trainer"
