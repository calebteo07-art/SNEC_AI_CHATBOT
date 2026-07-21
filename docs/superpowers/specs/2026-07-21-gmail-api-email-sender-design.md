# Gmail API email sender (replace Brevo)

**Date:** 2026-07-21
**Status:** approved design, pre-implementation

## Why

EyeBot emails student login credentials from `snec.tne.edu@gmail.com`. Render
blocks outbound SMTP, so sending goes through an HTTPS provider. Brevo was that
provider, but it now rejects the sender: Google/Yahoo/Microsoft require
DKIM/SPF/DMARC on the **From domain**, and you cannot add DNS records to
`gmail.com` (you don't own it). SNEC has no other domain and won't register one.

The only way to send *from* a `gmail.com` address and pass authentication is to
send through Google's own servers — i.e. the **Gmail API**. Google DKIM-signs it,
so it's compliant and lands in the inbox.

Verified facts that make this practical:
- `gmail.send` is a **sensitive** scope (not restricted) → no third-party
  security assessment.
- Single-user app (only the owner's Gmail authorizes it, once) → **no Google
  verification needed**; accept a one-time "unverified app" warning.
- The 7-day refresh-token expiry applies **only in "Testing" status**. Publishing
  the app to "In Production" (allowed while unverified, for personal use) makes
  the refresh token persist indefinitely.

## Scope

Rewrite `tools/shared/gmail_sender.py` into a single Gmail-API path. Delete the
provider-dispatch and all unused relays (brevo, resend, sendgrid, **and** the
local-dev smtp path — collapsing to one path per the approved simplification).
Keep the filename and the `send_email(to, subject, html, text="")` signature, so
the two callers in `tools/api/routers/admin.py` are untouched.

## Components

### 1. Runtime sender — `send_email` → `_send_gmail_api`
All HTTPS/443, so it works on Render.
1. **Access token:** `POST https://oauth2.googleapis.com/token`, form-urlencoded
   body `grant_type=refresh_token, refresh_token, client_id, client_secret` →
   JSON `{access_token, expires_in}`.
2. **Build message:** `MIMEMultipart("alternative")` with plain + HTML parts;
   headers `Subject`, `From: EyeBot · SNEC <EMAIL_FROM>`, `To`. Encode with
   `base64.urlsafe_b64encode(msg.as_bytes())`.
3. **Send:** `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
   with `Authorization: Bearer <token>`, JSON body `{"raw": "<b64url>"}`.
4. Non-2xx / token failure → `RuntimeError(<legible message>)`.

### 2. Per-worker access-token cache
Module-level `(_token, _expiry_epoch)`. Reuse while `now < expiry - 60s`, else
refresh. Avoids re-minting a token per message during a bulk-CSV cohort. It's a
per-worker idempotent cache of a 1-hour credential (same shape as the existing
`_case_cache`), so it respects the "no shared in-process state" invariant — each
worker derives its own token.

### 3. One-time consent script — `scripts/gmail_oauth_setup.py`
**Stdlib only** (no new dependency): `http.server` loopback on `localhost:<port>`,
`webbrowser` opens the Google consent URL
(`scope=.../gmail.send`, `access_type=offline`, `prompt=consent`), captures the
`?code=`, exchanges it at the token endpoint, prints `GMAIL_REFRESH_TOKEN`. Run
once, locally, by the account owner.

### 4. Config / env
- **Add:** `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`; keep
  `EMAIL_FROM` (must equal the authenticated account address).
- **Remove:** `EMAIL_PROVIDER`, `BREVO_API_KEY`, `SENDGRID_API_KEY`,
  `RESEND_API_KEY`, `SMTP_EMAIL`, `SMTP_APP_PASSWORD`.
- Update `.env.template`, the email comments in `render.yaml`, and the single
  Brevo line in `CLAUDE.md` (Render-preflight guardrail).

## Data flow
`admin approves student → send_email(to, subject, html) → _send_gmail_api →
cached/fresh access token → MIME → b64url → POST send → success | RuntimeError →
caller sets email_sent true/false`. On failure the admin screen still shows the
temp password (existing behavior, unchanged).

## Error handling
Token exchange or send returning non-2xx raises `RuntimeError` with the provider
body (truncated). Callers already wrap `send_email` in try/except and degrade to
`email_sent=false` + visible password. No caller change.

## Testing (TDD, keyless)
`tests/` — mock `urllib.request.urlopen`:
- token exchange issued with the right grant/params;
- send POST hits the send endpoint with `Bearer` header and a base64url `raw`;
- two sends in a row trigger **one** token exchange (cache works);
- a non-2xx send surfaces as `RuntimeError` (→ caller's `email_sent=false`).

## Ship coordination
Code lands **inert** — sends keep failing (as they do now with Brevo's `550`)
until the Google setup is done and the 3 secrets are set on Render. It does **not**
break boot (`assert_production_ready` doesn't check email vars). Ship, then do the
setup below.

## Google Cloud setup checklist (owner, one-time)
1. Google Cloud Console → create/select a project.
2. **APIs & Services → Library → enable "Gmail API".**
3. **OAuth consent screen** → User type **External** → fill app name + support
   email + developer email → add scope `.../auth/gmail.send` → Save.
4. **Publishing status → Publish app → confirm "In production"** (stays
   unverified; personal-use exempt — this is what kills the 7-day token expiry).
5. **Credentials → Create credentials → OAuth client ID → type "Desktop app"** →
   copy the **client ID** and **client secret**.
6. Run `python scripts/gmail_oauth_setup.py` locally with those two values → log
   in as `snec.tne.edu@gmail.com` → on the warning click **Advanced → Go to (unsafe)**
   → grant → copy the printed **refresh token**.
7. On **Render**, set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN`, `EMAIL_FROM=snec.tne.edu@gmail.com`; delete the old
   `EMAIL_PROVIDER` / `BREVO_API_KEY`.
8. Redeploy → approve a test student → confirm it lands (check spam once).

## Residual gotchas
- Changing the Gmail account password revokes the refresh token → re-run step 6.
- Consumer Gmail send cap ≈ 500 recipients/day. Fine for cohort onboarding; flag
  if a single-day intake exceeds it.
