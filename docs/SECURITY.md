# Security Model

EyeBot handles student PII and is deployed to higher-education institutions. This
document describes the security posture, the production hardening, the required
configuration, and how to report issues.

## Authentication & sessions

- **Passwords:** bcrypt (cost 12). Plaintext is never stored or logged.
- **Sessions:** a signed JWT (HS256) in an **HttpOnly** cookie (`eyebot_token`)
  — `Secure` in production, `SameSite=Lax`, session-scoped (expires on browser
  close). JavaScript cannot read it, which blocks token theft via XSS.
- **Identity is server-derived.** Every authenticated route takes the user from
  `current_user["sub"]` (the JWT), never from the request body. Role guards
  (`require_admin`, `require_staff`) protect privileged routes (see **Roles &
  authorization** below).
- **First password is provisioned, not guessable.** Admin onboarding generates a
  random temporary password (bcrypt-hashed, `must_change=True`) and emails it.
  An account with **no password hash cannot log in** — it is routed to the reset
  flow. (This closed a prior hole where hashless accounts, including the
  super-admin, authenticated on any string.)
- **Password reset:** time-boxed 6-digit OTP, SHA-256-hashed at rest with a
  15-minute TTL (`tools/shared/otp_store.py`), single-use, constant-time
  comparison. `request-reset` always returns `ok` so it cannot enumerate
  accounts.

## Roles & authorization

Three top-level roles live in the JWT (`current_user["role"]`): **`student`**,
**`trainer`**, and **`admin`**. Two dependency guards in
`tools/shared/jwt_utils.py` gate privileged routes:

- **`require_staff`** (`{admin, trainer}`) — read-only cohort/per-student
  **analytics** (`/api/supervisor/*` and the `/api/admin/*` read endpoints) plus
  the caller's own content-pool toggle (`PATCH /api/profile/role`, which edits the
  caller's own profile only).
- **`require_admin`** (`{admin}`) — **provisioning** only: add/remove approved
  accounts, CSV import, and promote/demote. This is the single capability a
  trainer does **not** have — a trainer is *admin analytics minus provisioning*.

The legacy **`supervisor`** role is removed. Any lingering
`supervisors.role == "supervisor"` row is normalised to **`trainer`** at the auth
layer (login and onboard) — a safe demotion that keeps the account logged in with
analytics but drops provisioning. No data migration is required: the `supervisors`
table has no CHECK constraint on `role`, so storing `"trainer"` needs no DDL. The
effective content pool (`student_role`, OA·PSA vs OT) is derived server-side from
`student_profiles.role` and returned by `GET /api/auth/me`, never trusted from the
request body.

## Rate limiting

`slowapi` limits keyed by the **real caller** — the JWT subject when
authenticated, otherwise the leftmost `X-Forwarded-For` client IP — not the Next
reverse-proxy peer. In production the store is Redis (`REDIS_URL`) so limits are
correct and shared across workers. Login `5/min`, reset `3/min`, AI endpoints
`10–40/min`.

## Transport & headers

- **CSP** and frame/sniff/referrer/permissions headers are set by Next
  (`next.config.ts`) on every page; FastAPI re-asserts the API-level headers.
- **CORS** is locked to an explicit origin in production (`ALLOWED_ORIGINS`);
  wildcard is rejected by the boot guard. Credentials are only enabled with an
  explicit origin.
- **Request bodies** over `MAX_REQUEST_BYTES` (default 2 MB) are rejected (413)
  before routing.

## Fail-closed configuration

`tools/shared/config.py::assert_production_ready()` runs in the app lifespan and
**refuses to start** in production when any of these is true:

- `JWT_SECRET` is unset, a known default/placeholder, or shorter than 32 chars
- `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing
- `ALLOWED_ORIGINS` is `*` or empty

A misconfigured deploy fails loudly at boot instead of silently running on
forgeable tokens or wide-open CORS.

### Required production secrets (set in the Render dashboard)

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | 64-hex-char signing key — `python -c "import secrets; print(secrets.token_hex(32))"` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | database |
| `ALLOWED_ORIGINS` | exact public origin, e.g. `https://eyebot.yourschool.edu` |
| `GEMINI_API_KEY` | AI (omit ⇒ `MOCK_MODE`) |
| `SUPER_ADMIN_EMAIL` | bootstrap admin (see below) |
| `EMAIL_FROM` + `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN` | password-reset / onboarding email. Render blocks SMTP, so email goes out over the **Gmail API**; mint the refresh token with `scripts/gmail_oauth_setup.py`. All four are required together |
| `REDIS_URL` | rate-limit + Celery state (required for `WEB_CONCURRENCY > 1`) |
| `SENTRY_DSN` | *optional* — enables error tracking; dormant if unset |

The complete annotated inventory of every variable the code reads — including
the optional ones absent from this table — is in
[`OPERATIONS.md` §2](OPERATIONS.md#2-environment-variables--complete-inventory).

## Super-admin bootstrap

Because hashless accounts can no longer log in on an arbitrary password, the
first super-admin sets their password via the reset flow:

1. Set `SUPER_ADMIN_EMAIL`, and configure working email — all four of
   `EMAIL_FROM`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and
   `GMAIL_REFRESH_TOKEN`. **The bootstrap depends on an email actually
   arriving**, so verify sending works before you rely on this flow.
2. On the login page choose **Forgot password** for that email.
3. Enter the emailed OTP and set a password. The account now has admin access.

## Secrets hygiene

`.env`, `credentials.json`, and `token.json` are gitignored and must never be
committed. Rotate `JWT_SECRET` if you suspect exposure (this invalidates all
existing sessions). Secrets live only in the Render dashboard / local `.env`.

## Observability

Structured JSON logs carry a per-request `X-Request-ID` so an incident can be
traced to exact log lines. Errors flow to Sentry when `SENTRY_DSN` is set.

## Reporting a vulnerability

Email **snec.tne.edu@gmail.com** with details and reproduction steps. Please do
not open a public issue for security reports. We aim to acknowledge within a few
business days.
