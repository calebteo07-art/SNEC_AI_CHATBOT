"""Tests for the one-time Gmail OAuth setup script's pure core.

The interactive loopback (main) is I/O glue and untested; the two
correctness-critical pieces — the consent URL and the auth-code → refresh-token
exchange — are pure and mocked here.
"""
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "gmail_oauth_setup.py"


def _load():
    spec = importlib.util.spec_from_file_location("gmail_oauth_setup", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_build_auth_url_requests_offline_gmail_send_consent():
    mod = _load()
    url = mod.build_auth_url("cid", "http://localhost:8765/")
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "client_id=cid" in url
    assert "response_type=code" in url
    assert "access_type=offline" in url  # required to get a refresh token at all
    assert "prompt=consent" in url       # forces a fresh refresh token every run
    assert "gmail.send" in url
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A8765%2F" in url


def test_exchange_code_posts_auth_code_grant_and_returns_refresh_token():
    mod = _load()
    captured = {}

    class _Resp:
        status = 200

        def read(self):
            return json.dumps({"refresh_token": "RT-xyz", "access_token": "AT"}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def _fake(req, timeout=None):
        captured["url"] = req.full_url
        captured["body"] = req.data.decode()
        return _Resp()

    with patch("urllib.request.urlopen", _fake):
        rt = mod.exchange_code("cid", "sec", "authcode", "http://localhost:8765/")

    assert rt == "RT-xyz"
    assert captured["url"] == "https://oauth2.googleapis.com/token"
    assert "grant_type=authorization_code" in captured["body"]
    assert "code=authcode" in captured["body"]
    assert "client_id=cid" in captured["body"]
    assert "client_secret=sec" in captured["body"]
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A8765%2F" in captured["body"]
