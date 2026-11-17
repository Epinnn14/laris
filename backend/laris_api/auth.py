"""One owner password per shop. Sessions are HMAC-signed tokens in an http-only cookie."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

ITERATIONS = 200_000
COOKIE = "laris_session"
MAX_AGE = 60 * 60 * 24 * 30  # 30 days


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2${ITERATIONS}${salt.hex()}${dk.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        _, it, salt, digest = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(it))
        return hmac.compare_digest(dk.hex(), digest)
    except ValueError:
        return False


def new_secret() -> str:
    return secrets.token_hex(32)


def make_token(secret: str, now: float | None = None) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"exp": int((now or time.time()) + MAX_AGE)}).encode()).decode()
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def check_token(secret: str, token: str | None, now: float | None = None) -> bool:
    if not token or "." not in token:
        return False
    payload, sig = token.rsplit(".", 1)
    good = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, good):
        return False
    try:
        exp = json.loads(base64.urlsafe_b64decode(payload.encode()))["exp"]
    except (ValueError, KeyError):
        return False
    return exp > (now or time.time())
