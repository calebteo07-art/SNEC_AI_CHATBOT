#!/usr/bin/env python3
"""Password hashing and verification helpers using bcrypt."""

import random
import string
import bcrypt

_ALPHABET = string.ascii_letters + string.digits
_COST = 12


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(_COST)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def generate_password(length: int = 10) -> str:
    return "".join(random.choices(_ALPHABET, k=length))
