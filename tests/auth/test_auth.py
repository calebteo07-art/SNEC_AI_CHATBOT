import pytest
from tools.shared.auth import hash_password, verify_password, generate_password


def test_hash_password_returns_string():
    h = hash_password("secret123")
    assert isinstance(h, str)
    assert h.startswith("$2b$")


def test_verify_password_correct():
    h = hash_password("correct")
    assert verify_password("correct", h) is True


def test_verify_password_wrong():
    h = hash_password("correct")
    assert verify_password("wrong", h) is False


def test_generate_password_length():
    p = generate_password()
    assert len(p) == 10


def test_generate_password_alphanumeric():
    for _ in range(20):
        p = generate_password()
        assert p.isalnum()


def test_generate_password_unique():
    passwords = {generate_password() for _ in range(50)}
    assert len(passwords) > 45
