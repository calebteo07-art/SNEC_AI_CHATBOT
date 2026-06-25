"""The rate-limit key must identify the real caller, not the Next proxy.

Production topology: browser -> Render edge -> Next (rewrite proxy) -> FastAPI.
FastAPI therefore sees every request as coming from 127.0.0.1, so keying on the
socket peer (get_remote_address) lumps the whole school into one bucket. The key
must instead be the authenticated user (JWT sub) when present, else the real
client IP from X-Forwarded-For.
"""
from types import SimpleNamespace

from tools.api.shared import rate_limit_key
from tools.shared.jwt_utils import create_access_token


def _req(cookies=None, headers=None, host="127.0.0.1"):
    return SimpleNamespace(
        cookies=cookies or {},
        headers=headers or {},
        client=SimpleNamespace(host=host),
    )


def test_authenticated_request_keys_on_user_id():
    token = create_access_token("student-uuid-123", "student", "OA")
    key = rate_limit_key(_req(cookies={"eyebot_token": token}))
    assert key == "user:student-uuid-123"


def test_two_users_get_distinct_keys_behind_same_proxy_ip():
    t1 = create_access_token("user-a", "student", "OA")
    t2 = create_access_token("user-b", "student", "OA")
    k1 = rate_limit_key(_req(cookies={"eyebot_token": t1}, host="127.0.0.1"))
    k2 = rate_limit_key(_req(cookies={"eyebot_token": t2}, host="127.0.0.1"))
    assert k1 != k2


def test_unauthenticated_keys_on_forwarded_client_ip():
    key = rate_limit_key(_req(headers={"x-forwarded-for": "203.0.113.7"}))
    assert key == "ip:203.0.113.7"


def test_forwarded_for_uses_leftmost_original_client():
    # XFF is "client, proxy1, proxy2" — the original client is leftmost.
    key = rate_limit_key(_req(headers={"x-forwarded-for": "203.0.113.7, 10.0.0.1, 127.0.0.1"}))
    assert key == "ip:203.0.113.7"


def test_two_clients_without_token_get_distinct_keys():
    k1 = rate_limit_key(_req(headers={"x-forwarded-for": "203.0.113.7"}))
    k2 = rate_limit_key(_req(headers={"x-forwarded-for": "198.51.100.4"}))
    assert k1 != k2


def test_invalid_token_falls_back_to_ip():
    key = rate_limit_key(_req(cookies={"eyebot_token": "garbage.not.a.jwt"},
                              headers={"x-forwarded-for": "203.0.113.7"}))
    assert key == "ip:203.0.113.7"


def test_no_token_no_xff_falls_back_to_socket_host():
    key = rate_limit_key(_req(host="192.0.2.55"))
    assert key == "ip:192.0.2.55"
