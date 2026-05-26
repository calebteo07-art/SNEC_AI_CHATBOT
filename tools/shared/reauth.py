#!/usr/bin/env python3
"""Re-authenticate Google OAuth and write a fresh token.json.

Run this whenever token.json expires:
    python tools/shared/reauth.py
"""

from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow
import json

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CREDENTIALS_FILE = PROJECT_ROOT / "credentials.json"
TOKEN_FILE = PROJECT_ROOT / "token.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

if __name__ == "__main__":
    flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
    creds = flow.run_local_server(port=0)
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    print(f"token.json written to {TOKEN_FILE}")
