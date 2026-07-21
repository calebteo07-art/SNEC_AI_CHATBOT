#!/usr/bin/env python3
"""One-time: mint a Gmail API refresh token for EyeBot's transactional email.

Run locally by the owner of the sender account (e.g. snec.tne.edu@gmail.com):

    python scripts/gmail_oauth_setup.py

Google Cloud Console prereqs (one-time):
  1. Create/select a project; APIs & Services -> Library -> enable "Gmail API".
  2. OAuth consent screen: User type External; add scope .../auth/gmail.send;
     then Publishing status -> Publish app -> "In production". (Personal use needs
     no verification -- click through the "unverified app" warning. Publishing is
     what stops the refresh token expiring after 7 days.)
  3. Credentials -> Create credentials -> OAuth client ID -> type "Desktop app".
     Note the client id and client secret.

This opens a browser for you to log in and grant access, then prints the four
env values to set on Render:
  GMAIL_CLIENT_ID  GMAIL_CLIENT_SECRET  GMAIL_REFRESH_TOKEN  EMAIL_FROM
"""

import http.server
import json
import os
import urllib.parse
import urllib.request
import webbrowser

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SCOPE = "https://www.googleapis.com/auth/gmail.send"
_PORT = 8765
_REDIRECT_URI = f"http://localhost:{_PORT}/"


def build_auth_url(client_id: str, redirect_uri: str) -> str:
    """The Google consent URL. access_type=offline is required to be issued a
    refresh token; prompt=consent forces a fresh one on every run."""
    params = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": _SCOPE,
            "access_type": "offline",
            "prompt": "consent",
        }
    )
    return f"{_AUTH_URL}?{params}"


def exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str) -> str:
    """Trade the one-time authorization code for a long-lived refresh token."""
    body = urllib.parse.urlencode(
        {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        }
    ).encode("utf-8")
    req = urllib.request.Request(_TOKEN_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    if "refresh_token" not in data:
        raise SystemExit(
            "No refresh_token in Google's response. Ensure the OAuth consent screen "
            "is published and you granted a fresh consent. Response keys: "
            f"{list(data)}"
        )
    return data["refresh_token"]


class _CodeHandler(http.server.BaseHTTPRequestHandler):
    code = None

    def do_GET(self):  # noqa: N802 (http.server API)
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        _CodeHandler.code = (params.get("code") or [None])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h2>EyeBot: authorization received. You can close this tab.</h2>")

    def log_message(self, *args):  # silence default stderr access logging
        pass


def main() -> None:
    client_id = os.environ.get("GMAIL_CLIENT_ID") or input("OAuth client id: ").strip()
    client_secret = os.environ.get("GMAIL_CLIENT_SECRET") or input("OAuth client secret: ").strip()
    if not client_id or not client_secret:
        raise SystemExit("client id and secret are required")

    url = build_auth_url(client_id, _REDIRECT_URI)
    print(f"\nOpening your browser to authorize. If it doesn't open, visit:\n{url}\n")
    webbrowser.open(url)

    server = http.server.HTTPServer(("localhost", _PORT), _CodeHandler)
    server.handle_request()  # serve exactly one request: Google's redirect
    code = _CodeHandler.code
    if not code:
        raise SystemExit("No authorization code received.")

    refresh_token = exchange_code(client_id, client_secret, code, _REDIRECT_URI)
    print("\n=== SUCCESS ===")
    print("Set these on Render (and in local .env if you want to send from dev):\n")
    print(f"GMAIL_CLIENT_ID={client_id}")
    print(f"GMAIL_CLIENT_SECRET={client_secret}")
    print(f"GMAIL_REFRESH_TOKEN={refresh_token}")
    print("EMAIL_FROM=snec.tne.edu@gmail.com   # the account you just authorized")


if __name__ == "__main__":
    main()
