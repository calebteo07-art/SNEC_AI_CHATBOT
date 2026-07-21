"""Tests for the Gmail-API email sender (tools/shared/gmail_sender.py).

Keyless: every network call to Google is mocked at ``urllib.request.urlopen``.
The sender exchanges GMAIL_REFRESH_TOKEN for a short-lived access token, then
POSTs a base64url MIME message to the Gmail send endpoint — both over HTTPS.
"""
import base64
import io
import json
import urllib.error
from email import policy
from email.parser import BytesParser
from unittest.mock import patch

import pytest

from tools.shared import gmail_sender

TOKEN_URL = "https://oauth2.googleapis.com/token"
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


class _FakeResp:
    """Minimal stand-in for an http.client.HTTPResponse used as a context mgr."""

    def __init__(self, status=200, body=b"{}"):
        self.status = status
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _urlopen(calls, *, token_status=200, send_status=200):
    """Fake urlopen that dispatches on the request URL and records requests.

    Mirrors real urllib: a >=400 status arrives as a raised HTTPError, not a
    returned response.
    """

    def _fake(req, timeout=None):
        calls.append(req)
        url = req.full_url
        if url == TOKEN_URL:
            if token_status >= 400:
                raise urllib.error.HTTPError(url, token_status, "err", {}, io.BytesIO(b"token err"))
            return _FakeResp(200, json.dumps({"access_token": "AT123", "expires_in": 3599}).encode())
        if url == SEND_URL:
            if send_status >= 400:
                raise urllib.error.HTTPError(url, send_status, "err", {}, io.BytesIO(b"send err"))
            return _FakeResp(200, b"{}")
        raise AssertionError(f"unexpected URL {url}")

    return _fake


@pytest.fixture(autouse=True)
def _env_and_cache(monkeypatch):
    monkeypatch.setenv("GMAIL_CLIENT_ID", "cid")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "csecret")
    monkeypatch.setenv("GMAIL_REFRESH_TOKEN", "rtoken")
    monkeypatch.setenv("EMAIL_FROM", "snec.tne.edu@gmail.com")
    gmail_sender._TOKEN_CACHE.update(token=None, exp=0.0)
    yield
    gmail_sender._TOKEN_CACHE.update(token=None, exp=0.0)


def test_exchanges_refresh_token_for_access_token():
    calls = []
    with patch("urllib.request.urlopen", _urlopen(calls)):
        gmail_sender.send_email("stu@example.com", "Subj", "<p>hi</p>")
    token_req = next(r for r in calls if r.full_url == TOKEN_URL)
    body = token_req.data.decode()
    assert "grant_type=refresh_token" in body
    assert "refresh_token=rtoken" in body
    assert "client_id=cid" in body
    assert "client_secret=csecret" in body


def test_send_posts_message_with_bearer_and_base64url_raw():
    calls = []
    with patch("urllib.request.urlopen", _urlopen(calls)):
        gmail_sender.send_email("stu@example.com", "Welcome", "<p>pw: X</p>", "pw: X")
    send_req = next(r for r in calls if r.full_url == SEND_URL)
    assert send_req.get_header("Authorization") == "Bearer AT123"
    raw = json.loads(send_req.data.decode())["raw"]
    msg = BytesParser(policy=policy.default).parsebytes(base64.urlsafe_b64decode(raw))
    assert msg["To"] == "stu@example.com"
    assert msg["Subject"] == "Welcome"
    assert "snec.tne.edu@gmail.com" in msg["From"]


def test_reuses_cached_access_token_across_sends():
    calls = []
    with patch("urllib.request.urlopen", _urlopen(calls)):
        gmail_sender.send_email("a@example.com", "S", "<p>a</p>")
        gmail_sender.send_email("b@example.com", "S", "<p>b</p>")
    assert len([r for r in calls if r.full_url == TOKEN_URL]) == 1
    assert len([r for r in calls if r.full_url == SEND_URL]) == 2


def test_send_failure_raises_runtime_error():
    with patch("urllib.request.urlopen", _urlopen([], send_status=403)):
        with pytest.raises(RuntimeError):
            gmail_sender.send_email("stu@example.com", "S", "<p>x</p>")


def test_missing_refresh_token_raises_runtime_error(monkeypatch):
    monkeypatch.delenv("GMAIL_REFRESH_TOKEN", raising=False)
    with patch("urllib.request.urlopen", _urlopen([])):
        with pytest.raises(RuntimeError):
            gmail_sender.send_email("stu@example.com", "S", "<p>x</p>")
