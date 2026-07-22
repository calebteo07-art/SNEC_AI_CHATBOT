# tests/api/test_admin_endpoints.py
"""Security and functional tests for admin endpoints.

Two guard tiers:
  • require_staff  → read-only analytics: admin + trainer allowed, student 403.
  • require_admin  → add/remove/CSV/promote: admin only, trainer + student 403.
"""
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
def _stub_consent_seed():
    """The add-student / add-staff endpoints call identity.seed_student_name, which reads
    and writes student_consent. Default those DB calls to no-ops so endpoint tests never
    touch the real database; tests that assert on the seed re-patch upsert_consent inside
    their own `with` block."""
    with patch("tools.shared.db.get_consent_by_email", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.upsert_consent", new=AsyncMock()), \
         patch("tools.shared.db.update_consent", new=AsyncMock()):
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

    The DB reads aren't mocked here, so a 500 is acceptable — the point is the
    guard let the trainer through rather than returning 401/403.
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
        patch("tools.shared.db.get_topic_accuracy", new=AsyncMock(return_value={})),
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
