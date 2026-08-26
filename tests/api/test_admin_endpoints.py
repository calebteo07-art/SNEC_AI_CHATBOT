# tests/api/test_admin_endpoints.py
"""Security and functional tests for admin endpoints.

Two guard tiers:
  • require_staff  → read-only analytics: admin + trainer allowed, student 403.
  • require_admin  → add/remove/CSV/promote: admin only, trainer + student 403.
"""
import os
from contextlib import ExitStack

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from tools.api.routers.admin import _account_ready_html
from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

# Read-only analytics endpoints — require_staff (admin + trainer)
STAFF_READ_ENDPOINTS = [
    ("GET", "/api/admin/approved"),
    ("GET", "/api/admin/students"),
    ("GET", "/api/admin/staff"),
    ("GET", "/api/admin/activity"),
    ("GET", "/api/admin/student/stu_x/detail"),
    ("GET", "/api/admin/token-summary"),
    ("GET", "/api/admin/cohort-analytics"),
    ("GET", "/api/admin/performance-trend"),
]

# Mutating endpoints — require_admin (admin only)
ADMIN_ONLY_ENDPOINTS = [
    ("POST",   "/api/admin/approved"),
    ("DELETE", "/api/admin/approved/test@x.com"),
    ("POST",   "/api/admin/promote"),
    ("DELETE", "/api/admin/promote/test@x.com"),
    ("POST",   "/api/admin/upload-csv"),
]

ALL_ENDPOINTS = STAFF_READ_ENDPOINTS + ADMIN_ONLY_ENDPOINTS


def _cookies(role: str, student_role: str = "OA") -> dict:
    token = create_access_token("user_001", role, student_role)
    return {"eyebot_token": token}


def _admin_headers() -> dict:
    return _cookies("admin")


def _trainer_headers() -> dict:
    return _cookies("trainer")


def _student_headers() -> dict:
    return _cookies("student")


@pytest.fixture(autouse=True)
def _stub_provisioning_db():
    """The add-student / add-staff endpoints call identity.seed_student_name, which reads
    and writes student_consent, and read `supervisors` for the duplicate guard. Default
    those DB calls to no-ops so endpoint tests never touch the real database; tests that
    assert on the seed — or that need an EXISTING staff row — re-patch inside their own
    `with` block."""
    with patch("tools.shared.db.get_consent_by_email", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.upsert_consent", new=AsyncMock()), \
         patch("tools.shared.db.update_consent", new=AsyncMock()), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_all_supervisors", new=AsyncMock(return_value=[])):
        yield


@pytest.fixture(autouse=True)
def _stub_admin_db():
    """Neutral defaults for every db call the admin endpoints make.

    Complements `_stub_provisioning_db` (which covers the add-account write path) by
    covering the read surface behind STAFF_READ_ENDPOINTS, plus the audit write every
    mutating endpoint emits. Without these, `test_staff_read_endpoint_allows_trainer_token`
    ran the handlers for real: two whole-table scans of live production Supabase per
    pytest run, and audit rows written into the production `audit_events` table.

    Empty/neutral on purpose — the guard tests only assert the caller got past
    require_staff, so the payload is irrelevant. Tests that assert on *content*
    re-patch the specific reader inside their own `with` block, which nests over
    this one and restores it on exit.

    Built fresh per test rather than as a module constant: an AsyncMock hands the
    same object back on every call, so one shared `[]` would leak mutations between
    tests. Adding a read endpoint means adding one line here.
    """
    defaults = {
        # GET /api/admin/approved
        "tools.shared.db.get_all_approved": [],
        # GET /api/admin/students (also reads get_all_approved)
        "tools.shared.db.get_all_profiles": [],
        "tools.shared.db.get_all_consent": [],
        # GET /api/admin/staff — composite over supervisors/consent/profiles, but
        # stubbed directly so the test doesn't depend on that composition holding.
        "tools.shared.db.get_staff_roster": [],
        # GET /api/admin/activity
        "tools.shared.db.get_all_sessions": [],
        "tools.shared.db.get_all_case_progress": [],
        "tools.shared.db.get_active_leaderboard_profiles": [],
        # GET /api/admin/student/{id}/detail — get_profile is imported into the
        # router's namespace, so it patches there, not on tools.profile.
        "tools.api.routers.admin.get_profile": {},
        "tools.shared.db.get_consent_by_student_id": None,
        "tools.shared.db.get_sessions": [],
        "tools.shared.db.get_case_results": [],
        # The detail endpoint reads the RAW attempts now and aggregates them in-process —
        # get_topic_accuracy called this same function and discarded the timestamps.
        "tools.shared.db.get_flashcard_attempts": [],
        # GET /api/admin/token-summary — (rows, complete) pagination tuple
        "tools.shared.db.get_all_session_tokens": ([], True),
        # GET /api/admin/cohort-analytics — the two bulk readers are whole-table
        # paged scans of case_progress and flashcard_attempts, i.e. the most
        # expensive thing in this file to leave unstubbed. get_active_student_profiles
        # is stubbed directly (same reasoning as get_staff_roster above) and returns
        # the (students, staff_excluded) tuple its callers unpack.
        "tools.shared.db.get_active_student_profiles": ([], 0),
        "tools.shared.db.get_all_case_scores": ([], True),
        "tools.shared.db.get_all_flashcard_attempts": ([], True),
        # GET /api/admin/performance-trend — windowed, but still a paged scan of
        # case_progress, and it returns the same (rows, complete) tuple.
        "tools.shared.db.get_case_scores_since": ([], True),
        # Every mutating admin endpoint logs one of these.
        "tools.shared.db.insert_audit_event": None,
    }
    with ExitStack() as stack:
        for target, value in defaults.items():
            stack.enter_context(patch(target, new=AsyncMock(return_value=value)))
        yield


# ---------------------------------------------------------------------------
# Auth enforcement — no token
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ALL_ENDPOINTS)
def test_admin_endpoint_rejects_unauthenticated(method, path):
    r = client.request(method, path)
    assert r.status_code in (401, 403), f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Auth enforcement — student rejected everywhere
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ALL_ENDPOINTS)
def test_admin_endpoint_rejects_student_token(method, path):
    r = client.request(method, path, cookies=_student_headers())
    assert r.status_code == 403, f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Auth enforcement — trainer: allowed on reads, 403 on mutations
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ADMIN_ONLY_ENDPOINTS)
def test_admin_only_endpoint_rejects_trainer_token(method, path):
    """The single trainer exception: add/remove/CSV/promote stay admin-only."""
    r = client.request(method, path, cookies=_trainer_headers())
    assert r.status_code == 403, f"{method} {path} → {r.status_code}"


@pytest.mark.parametrize("method,path", STAFF_READ_ENDPOINTS)
def test_staff_read_endpoint_allows_trainer_token(method, path):
    """Trainer must pass the require_staff guard on read-only analytics endpoints.

    The point is the guard let the trainer through rather than returning 401/403, so
    the assertion stays deliberately loose about *which* success/error code comes back.
    The reads themselves are stubbed by `_stub_admin_db` — running these handlers
    unstubbed scanned live production Supabase on every pytest run.
    """
    r = client.request(method, path, cookies=_trainer_headers())
    assert r.status_code not in (401, 403), f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Functional: list approved students
# ---------------------------------------------------------------------------

def test_admin_list_approved_returns_students():
    rows = [
        {"email": "a@test.com", "full_name": "Alice", "role": "OA"},
        {"email": "b@test.com", "full_name": "Bob",   "role": "OT"},
    ]
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=rows)):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 200
    assert len(r.json()["students"]) == 2


def test_admin_list_approved_returns_empty_list():
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=[])):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 200
    assert r.json()["students"] == []


def test_admin_list_approved_500_on_sheets_failure():
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(side_effect=Exception("db down"))):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 500
    assert "db down" not in r.json()["detail"]


# ---------------------------------------------------------------------------
# Functional: list staff (trainers + admins)
# ---------------------------------------------------------------------------

def test_admin_list_staff_returns_staff_with_pending():
    """The Staff section lists trainers/admins; a trainer with a profile is Active,
    a supervisors row with no profile yet is Pending (email + role only)."""
    staff = [
        {"student_id": "sup1", "full_name": "Coach Lee", "email": "coach@test.com",
         "role": "trainer", "status": "active", "session_count": 7, "streak": 3, "last_active": "2026-07-10"},
        {"student_id": "", "full_name": "", "email": "new@test.com",
         "role": "admin", "status": "pending", "session_count": 0, "streak": 0, "last_active": ""},
    ]
    with patch("tools.shared.db.get_staff_roster", new=AsyncMock(return_value=staff)):
        r = client.get("/api/admin/staff", cookies=_trainer_headers())
    assert r.status_code == 200
    body = r.json()["staff"]
    assert len(body) == 2
    assert body[0]["status"] == "active" and body[0]["role"] == "trainer"
    assert body[1]["status"] == "pending" and body[1]["email"] == "new@test.com"


def test_admin_list_staff_500_on_db_failure():
    with patch("tools.shared.db.get_staff_roster", new=AsyncMock(side_effect=Exception("db down"))):
        r = client.get("/api/admin/staff", cookies=_admin_headers())
    assert r.status_code == 500
    assert "db down" not in r.json()["detail"]


# ---------------------------------------------------------------------------
# Functional: approve one student
# ---------------------------------------------------------------------------

def test_admin_approve_student_success():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "new@test.com", "full_name": "New User", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["password"] == "TmpPass1!"
    assert r.json()["email_sent"] is True


def test_account_ready_email_tells_students_to_use_a_personal_ipad_or_laptop():
    """EyeBot isn't released on SNEC corporate devices yet, so the credentials
    email has to say to bring a personal device, and that iPad/laptop is best."""
    html = _account_ready_html("New User", "new@test.com", "TmpPass1!")
    assert "personal device" in html
    assert "corporate device" in html
    assert "iPad" in html and "laptop" in html


def test_account_ready_email_links_to_the_configured_host_not_a_baked_in_one():
    """The welcome link must follow ALLOWED_ORIGINS, not a hardcoded URL.

    tools/shared/config.py::app_base_url exists precisely so a deployment can
    move host without a code change. The credentials email is the one message
    every new student receives, so a stale link there locks out a whole cohort
    on the day the service moves — exactly what a handover to a new owner makes
    likely.
    """
    with patch.dict(os.environ, {"ALLOWED_ORIGINS": "https://eyebot.example.edu"}):
        html = _account_ready_html("New User", "new@test.com", "TmpPass1!")
    assert "https://eyebot.example.edu" in html
    assert "onrender.com" not in html


def test_admin_approve_student_email_carries_device_guidance():
    """Guards the call site: approve must send the shared template, not its own."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.gmail_sender.send_email", return_value=None) as mock_send, \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "new@test.com", "full_name": "New User", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert mock_send.call_args.kwargs["html"] == _account_ready_html("New User", "new@test.com", "TmpPass1!")


def test_admin_approve_trainer_provisions_supervisor():
    """A staff role (Trainer/Admin) creates a supervisors row + auth credential,
    NOT an approved-students row, so a brand-new trainer can log in."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_supervisor", new=AsyncMock()) as mock_sup, \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()) as mock_appr, \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "coach@test.com", "full_name": "Coach", "role": "trainer"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_sup.assert_called_once_with("coach@test.com", role="trainer")
    mock_appr.assert_not_called()


def test_admin_approve_staff_seeds_consent_name():
    """The name typed when adding staff MUST be persisted to student_consent (the identity
    of record). supervisors has no name column, so otherwise the name only reaches the
    welcome email and the person renders as 'Student' on the leaderboard."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_supervisor", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.db.get_consent_by_email", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.upsert_consent", new=AsyncMock()) as mock_consent, \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "coach@test.com", "full_name": "Coach Lee", "role": "trainer"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    mock_consent.assert_awaited_once()
    _, kwargs = mock_consent.call_args
    assert kwargs.get("student_name") == "Coach Lee"
    assert kwargs.get("email") == "coach@test.com"


def test_admin_approve_student_seeds_consent_name():
    """Students too: the name is written to student_consent at add-time so it is
    authoritative immediately (before first login), not only to approved_students."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.db.get_consent_by_email", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.upsert_consent", new=AsyncMock()) as mock_consent, \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "new@test.com", "full_name": "New User", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    mock_consent.assert_awaited_once()
    _, kwargs = mock_consent.call_args
    assert kwargs.get("student_name") == "New User"


def test_admin_approve_student_409_duplicate():
    existing = {"email": "dup@test.com", "full_name": "Dup", "role": "OA"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=existing)):
        r = client.post(
            "/api/admin/approved",
            json={"email": "dup@test.com", "full_name": "Dup", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# Provisioning must never re-provision an existing account
#
# Real incident: an SNEC admin who had already set her own password was locked out
# of production. Cause — "Add account" deduped ONLY against approved_students, where
# staff never appear (they live in `supervisors`). Re-adding her therefore sailed past
# the guard and called upsert_auth() with a fresh random password + must_change=True,
# silently destroying the password she had chosen. Same hole in the CSV importer.
# ---------------------------------------------------------------------------

def test_admin_approve_existing_staff_409_duplicate():
    """Staff live in `supervisors`, never in `approved_students`, so a duplicate guard
    that reads only approved_students never fires for an existing trainer/admin."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value={"email": "claire@test.com", "role": "admin"})):
        r = client.post(
            "/api/admin/approved",
            json={"email": "claire@test.com", "full_name": "Claire Ong", "role": "admin"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 409


def test_admin_approve_existing_staff_does_not_reset_their_password():
    """THE regression: re-adding an existing staff member must not touch their
    credential. upsert_auth() here would overwrite a password they already use."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value={"email": "claire@test.com", "role": "admin"})), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_supervisor", new=AsyncMock()) as mock_sup, \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()) as mock_auth, \
         patch("tools.shared.gmail_sender.send_email", return_value=None):
        r = client.post(
            "/api/admin/approved",
            json={"email": "claire@test.com", "full_name": "Claire Ong", "role": "admin"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 409
    mock_auth.assert_not_called()
    mock_sup.assert_not_called()


def test_admin_approve_staff_email_as_student_does_not_reset_password():
    """The guard is role-INDEPENDENT: mistyping an existing admin into the student
    form must not re-provision them either (same clobber, different requested role)."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value={"email": "claire@test.com", "role": "admin"})), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()) as mock_appr, \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()) as mock_auth, \
         patch("tools.shared.gmail_sender.send_email", return_value=None):
        r = client.post(
            "/api/admin/approved",
            json={"email": "claire@test.com", "full_name": "Claire Ong", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 409
    mock_auth.assert_not_called()
    mock_appr.assert_not_called()


def test_admin_csv_skips_existing_staff_email():
    """The CSV importer deduped only against approved_students too, so a staff address
    sitting in a roster row re-provisioned them and wiped their password."""
    csv_bytes = b"full_name,email,role\nClaire Ong,claire@test.com,OA\n"
    token = create_access_token("csv_staff_guard", "admin", "")
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_all_supervisors", new=AsyncMock(return_value=[{"email": "claire@test.com", "role": "admin"}])), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "csv_staff_guard"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()) as mock_appr, \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()) as mock_auth, \
         patch("tools.shared.gmail_sender.send_email", return_value=None):
        r = client.post(
            "/api/admin/upload-csv",
            files={"file": ("roster.csv", csv_bytes, "text/csv")},
            cookies={"eyebot_token": token},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 0
    assert body["skipped"] == 1
    mock_auth.assert_not_called()
    mock_appr.assert_not_called()


def test_admin_approve_student_400_empty_email():
    r = client.post(
        "/api/admin/approved",
        json={"email": "   ", "full_name": "X", "role": "OA"},
        cookies=_admin_headers(),
    )
    assert r.status_code == 400


def test_admin_approve_student_returns_temp_password_when_email_fails():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.gmail_sender.send_email", side_effect=Exception("smtp down")), \
         patch("tools.api.routers.admin.generate_password", return_value="SuperSecret1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "safe@test.com", "full_name": "Safe User", "role": "OT"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["email_sent"] is False
    assert r.json()["password"] == "SuperSecret1!"


# ---------------------------------------------------------------------------
# Functional: remove student
# ---------------------------------------------------------------------------

def test_admin_remove_student_success():
    with patch("tools.shared.db.delete_approved", new=AsyncMock(return_value=True)):
        r = client.delete("/api/admin/approved/gone@test.com", cookies=_admin_headers())
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_admin_remove_student_404_not_found():
    with patch("tools.shared.db.delete_approved", new=AsyncMock(return_value=False)):
        r = client.delete("/api/admin/approved/nobody@test.com", cookies=_admin_headers())
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Functional: student detail
# ---------------------------------------------------------------------------

def _detail_profile() -> dict:
    """A student_profiles row as Supabase actually returns it — no name, no email."""
    return {"student_id": "stu_x", "role": "OA", "session_count": 3, "streak": 2}


def _detail_patches(consent):
    return (
        patch("tools.api.routers.admin.get_profile", new=AsyncMock(return_value=_detail_profile())),
        patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=consent)),
        patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_flashcard_attempts", new=AsyncMock(return_value=[])),
    )


def test_admin_student_detail_carries_name_and_email():
    """Identity lives in student_consent, not student_profiles — the latter has no
    full_name/email column, so reading them off the profile always yielded "" and
    titled the downloadable student report with a blank name."""
    consent = {"student_id": "stu_x", "student_name": "Alice Tan", "email": "alice@test.com"}
    p1, p2, p3, p4, p5 = _detail_patches(consent)
    with p1, p2, p3, p4, p5:
        r = client.get("/api/admin/student/stu_x/detail", cookies=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["full_name"] == "Alice Tan"
    assert body["email"] == "alice@test.com"


def test_admin_student_detail_survives_missing_consent_row():
    """No consent row → blank identity, but still a 200 rather than a 500."""
    p1, p2, p3, p4, p5 = _detail_patches(None)
    with p1, p2, p3, p4, p5:
        r = client.get("/api/admin/student/stu_x/detail", cookies=_admin_headers())
    assert r.status_code == 200
    assert r.json()["full_name"] == ""
    assert r.json()["email"] == ""


# ---------------------------------------------------------------------------
# Functional: promote staff (widened to trainer/admin)
# ---------------------------------------------------------------------------

def test_admin_promote_trainer_success():
    with patch("tools.shared.db.upsert_supervisor", new=AsyncMock()) as mock_sup:
        r = client.post(
            "/api/admin/promote",
            json={"email": "staff@test.com", "new_role": "trainer"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    mock_sup.assert_called_once_with("staff@test.com", role="trainer")


def test_admin_promote_invalid_role():
    # Role check fires before any DB call; no patch needed
    r = client.post(
        "/api/admin/promote",
        json={"email": "x@test.com", "new_role": "overlord"},
        cookies=_admin_headers(),
    )
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Removed students must vanish from every read surface (active-member filter)
# ---------------------------------------------------------------------------

def test_admin_activity_excludes_removed_student():
    """A removed student's activity must not appear in the feed. The feed is filtered
    to active members (active students + staff); a student no longer in
    approved_students is dropped."""
    sessions = [
        {"student_id": "act1", "topic": "Chat", "created_at": "2026-07-20", "token_count": 10},
        {"student_id": "rem1", "topic": "Chat", "created_at": "2026-07-19", "token_count": 5},
    ]
    consent = [
        {"student_id": "act1", "student_name": "Active Ann"},
        {"student_id": "rem1", "student_name": "Removed Rex"},
    ]
    active = [{"student_id": "act1", "role": "OA"}]  # rem1 is not an active member
    with patch("tools.shared.db.get_all_sessions", new=AsyncMock(return_value=sessions)), \
         patch("tools.shared.db.get_all_case_progress", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=consent)), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/activity", cookies=_admin_headers())
    assert r.status_code == 200
    sids = {item["student_id"] for item in r.json()["feed"]}
    assert "act1" in sids
    assert "rem1" not in sids


def test_admin_token_summary_excludes_removed_student():
    """Token totals must exclude a removed student — their tokens drop out of the
    grand total and the per-student breakdown."""
    sessions = [
        {"student_id": "act1", "token_count": 100},
        {"student_id": "rem1", "token_count": 50},
    ]
    active = [{"student_id": "act1", "role": "OA"}]  # rem1 is not an active member
    with patch("tools.shared.db.get_all_session_tokens", new=AsyncMock(return_value=(sessions, True))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["total_tokens"] == 100
    by_student = {row["student_id"]: row["tokens"] for row in body["by_student"]}
    assert by_student == {"act1": 100}


# ---------------------------------------------------------------------------
# Functional: the assembled per-student insight (spec §4.6)
# ---------------------------------------------------------------------------

def test_student_detail_returns_the_insight_payload():
    """The three renderers read `insight`. Its absence is a blank report, not a broken one,
    so this asserts the key exists and is shaped even for a student with no data at all."""
    r = client.get("/api/admin/student/stu_x/detail", cookies=_admin_headers())
    assert r.status_code == 200
    insight = r.json()["insight"]
    assert "topics" in insight and "mark_loss" in insight
    assert insight["osce_trajectory"]["band"] == "insufficient"


def test_the_insight_carries_this_students_own_cards_and_stations():
    """Shape alone would still pass with the assembler's arguments swapped — every key is
    always present, empty or not. Pin that the student's OWN two reads reach the payload,
    joined onto one topic by the case index."""
    cards = [{"topic_tag": "tonometry", "correct": True, "ts": "2026-08-01T09:00:00Z"}]
    cases = [{"case_id": "c1", "score_100": 60, "passed": True,
              "completed_at": "2026-08-02T09:00:00Z"}]
    with patch("tools.shared.db.get_flashcard_attempts", new=AsyncMock(return_value=cards)), \
         patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=cases)), \
         patch("tools.api.routers.admin.get_case_index",
               new=AsyncMock(return_value={"c1": {"topic": "Tonometry"}})):
        r = client.get("/api/admin/student/stu_x/detail", cookies=_admin_headers())
    assert r.status_code == 200
    topics = {t["topic"]: t for t in r.json()["insight"]["topics"]}
    assert topics["tonometry"]["flashcards"] == {"value": 100.0, "n": 1, "band": "thin"}
    assert topics["tonometry"]["station"] == {"value": 60.0, "n": 1, "band": "developing"}


def test_a_failed_insight_leaves_the_rest_of_the_page_standing():
    """`insight` is an ADDITION to a page trainers already use. A bug in the pure assembler
    must cost the new panel and nothing else — the same contract the mastery block keeps.
    build_student_insight patches on the ROUTER's namespace: admin.py binds it at import."""
    audit = AsyncMock()
    with patch("tools.api.routers.admin.build_student_insight",
               side_effect=RuntimeError("assembler blew up")), \
         patch("tools.shared.db.insert_audit_event", new=audit):
        r = client.get("/api/admin/student/stu_x/detail", cookies=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["insight"] is None
    assert "sessions" in body and "cases" in body and "insights" in body
    # ...and the failure is durable, not a silent permanent null — same detector the
    # mastery degrade got, for the same reason.
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "student_insight_failed"
    assert kw["target"] == "stu_x"
    assert "assembler blew up" in kw["detail"]
