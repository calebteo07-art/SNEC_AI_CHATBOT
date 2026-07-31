# tests/api/test_auth_endpoints.py
import importlib.util
import os
from contextlib import ExitStack

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def _stub_auth_db():
    """Neutral defaults for the db calls the auth surface makes *besides* the ones each
    test patches for itself.

    Every test here patches the reads its own scenario turns on (get_approved / get_auth /
    get_supervisor / get_consent_by_student_id), but the handlers also emit calls no test
    names — and those ran for real: `insert_audit_event` WROTE an audit_events row to
    production Supabase on nearly every login, password-change and reset test, and the
    login path's `update_approved` WROTE to approved_students. See `_forbid_real_supabase`
    in tests/conftest.py for why an unstubbed db call reaches prod at all.

    Neutral on purpose — no assertion here depends on the payload. Tests that assert on
    these calls (e.g. `test_login_links_student_id_to_approved` on update_approved)
    re-patch inside their own `with`, which nests over this one and restores it on exit.
    """
    defaults = {
        # Written by login (success/failed/denied), change-password and both reset routes.
        "tools.shared.db.insert_audit_event": None,
        # Login links approved_students.student_id back on first login.
        "tools.shared.db.update_approved": None,
        # GET /api/admin/student/{id}/detail → db.get_topic_accuracy aggregates these.
        "tools.shared.db.get_flashcard_attempts": [],
    }
    with ExitStack() as stack:
        for target, value in defaults.items():
            stack.enter_context(patch(target, new=AsyncMock(return_value=value)))
        yield


def _auth_cookie(student_id: str, role: str = "student", student_role: str = "OA") -> dict:
    """Return a cookie dict with a valid JWT for the given identity."""
    token = create_access_token(student_id, role, student_role)
    return {"eyebot_token": token}


def _make_auth_row(email, plain_password, must_change=False):
    from tools.shared.auth import hash_password
    return {"email": email, "password_hash": hash_password(plain_password), "must_change": must_change}


def _make_consent_row(email, student_id, full_name):
    return {"email": email, "student_id": student_id, "full_name": full_name, "consented": "true"}


def _make_approved_row(email, role="OA"):
    return {"email": email, "full_name": "Test User", "role": role}


def test_login_success():
    auth_row = _make_auth_row("alice@test.com", "password1")
    approved_row = _make_approved_row("alice@test.com")

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_001", "Test User")), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "alice@test.com", "password": "password1"})
    assert r.status_code == 200
    data = r.json()
    assert data["student_id"] == "stu_001"
    assert data["must_change"] is False
    assert data["is_new"] is False


def test_login_links_student_id_to_approved():
    """First login must link the identity back to approved_students.student_id, so the
    admin roster's Active/Pending badge flips to Active on login — not only via
    /api/onboard. Without this, a student who logs in but never onboards shows
    'Pending' forever."""
    auth_row = _make_auth_row("newstud@test.com", "password1")
    approved_row = {"email": "newstud@test.com", "full_name": "New Stud", "role": "OA", "student_id": None}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.shared.db.update_approved", new=AsyncMock()) as mock_update, \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_777", "New Stud")), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "newstud@test.com", "password": "password1"})
    assert r.status_code == 200
    mock_update.assert_awaited_once_with("newstud@test.com", student_id="stu_777")


def test_login_does_not_relink_when_student_id_present():
    """If the approved row is already linked, login must NOT re-write student_id
    (no redundant DB write on every login)."""
    auth_row = _make_auth_row("linked@test.com", "password1")
    approved_row = {"email": "linked@test.com", "full_name": "Linked", "role": "OA", "student_id": "stu_existing"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.shared.db.update_approved", new=AsyncMock()) as mock_update, \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_existing", "Linked")), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "linked@test.com", "password": "password1"})
    assert r.status_code == 200
    mock_update.assert_not_awaited()


def test_login_wrong_password():
    auth_row = _make_auth_row("bob@test.com", "realpass")
    approved_row = {"email": "bob@test.com", "full_name": "Bob", "role": "OT"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)):
        r = client.post("/api/auth/login", json={"email": "bob@test.com", "password": "wrongpass"})
    assert r.status_code == 401


def test_login_not_approved():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)):
        r = client.post("/api/auth/login", json={"email": "unknown@test.com", "password": "any"})
    assert r.status_code == 403


def test_login_no_password_hash_rejected():
    """An approved account that has never had a password set must NOT be logged in
    on an arbitrary string (the old 'legacy account' hole). It is directed to the
    reset flow instead. This also closes super-admin first-login privilege escalation."""
    approved_row = _make_approved_row("nopass@test.com")

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=None)):
        r = client.post("/api/auth/login", json={"email": "nopass@test.com", "password": "anything-at-all"})
    assert r.status_code == 403
    assert "password" in r.json()["detail"].lower()
    # No session cookie may be issued on a rejected login.
    assert "eyebot_token" not in r.cookies


def test_login_empty_password_hash_rejected():
    """An auth row present but with a blank hash must also be rejected, not
    silently accepted (the second branch of the same bug)."""
    approved_row = _make_approved_row("blank@test.com")
    auth_row = {"email": "blank@test.com", "password_hash": "", "must_change": True}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)):
        r = client.post("/api/auth/login", json={"email": "blank@test.com", "password": "anything"})
    assert r.status_code == 403
    assert "eyebot_token" not in r.cookies


def test_login_student_promoted_to_trainer():
    """Student also in supervisors resolves the staff role; a legacy 'supervisor'
    row normalises to 'trainer' so the account is never locked out."""
    auth_row = _make_auth_row("promo@test.com", "pass123")
    approved_row = _make_approved_row("promo@test.com", role="OA")
    sup_row = {"email": "promo@test.com", "role": "supervisor"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=sup_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_004", "Test User")), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "promo@test.com", "password": "pass123"})
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "trainer"
    assert data["must_change"] is False


def test_login_trainer_from_supervisors_only():
    """An email present ONLY in supervisors (not approved students) with role
    'trainer' logs in as trainer."""
    auth_row = _make_auth_row("coach@test.com", "pass123")
    sup_row = {"email": "coach@test.com", "role": "trainer"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=sup_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_005", "Coach")), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "coach@test.com", "password": "pass123"})
    assert r.status_code == 200
    assert r.json()["role"] == "trainer"


def test_login_super_admin_without_roster_row_is_admin():
    """The baseline the roster case must match: authorised by env var alone, with no
    approved_students row and no supervisors row to derive a role from."""
    auth_row = _make_auth_row("boss@snec.com", "pass123")

    with patch("tools.api.routers.auth.SUPER_ADMIN_EMAIL", "boss@snec.com"), \
         patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_boss", "Boss")), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "boss@snec.com", "password": "pass123"})
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_login_super_admin_with_roster_row_stays_admin():
    """SUPER_ADMIN_EMAIL is the authority on who the super-admin is, so it must win
    over an approved_students row. Adding your own address to the roster — the natural
    way to give the account a name — used to silently demote the super-admin to a
    student and lock them out of the admin console: the super-admin check only ran in
    the 'no roster row' branch, and the promotion pass can't rescue them because they
    are authorised by env var and have no supervisors row. /api/onboard already gets
    this precedence right; login was the outlier."""
    auth_row = _make_auth_row("boss@snec.com", "pass123")
    approved_row = _make_approved_row("boss@snec.com", role="OA")

    with patch("tools.api.routers.auth.SUPER_ADMIN_EMAIL", "boss@snec.com"), \
         patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_boss", "Test User")), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "boss@snec.com", "password": "pass123"})
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "admin"
    # Resolved as staff, so the roster's content pool is dropped — same as a
    # student promoted via supervisors.
    assert data["student_role"] == ""


def _load_shared_with_env(**env):
    """Execute tools/api/shared.py in a throwaway module under the given environment
    and return it.

    Deliberately not importlib.reload(): routers bind shared's singletons by reference
    (`from tools.api.shared import limiter, _case_cache`), so reloading it in place
    swaps those objects out from under them and the station endpoints start 404ing on
    a cache the router no longer points at. This leaves sys.modules untouched.
    """
    import tools.api.shared as real

    spec = importlib.util.spec_from_file_location("_shared_env_probe", real.__file__)
    mod = importlib.util.module_from_spec(spec)
    with patch.dict(os.environ, env, clear=True):
        spec.loader.exec_module(mod)
    return mod


def test_super_admin_email_constant_is_normalised_from_env():
    """The two tests above patch the constant, so they prove the *comparison* works
    given a normalised value. This proves the value IS normalised — the bug lives in
    how the constant is derived, which patching it can never catch.

    SUPER_ADMIN_EMAIL is read at import and compared against
    `body.email.strip().lower()`. A Render dashboard value with any uppercase or
    surrounding whitespace used to be carried through verbatim, so login/onboard's
    super-admin checks silently never matched — the account kept working as a student
    and lost the admin console, with no error anywhere. Same class of silent demotion
    as the roster-row bug above."""
    mod = _load_shared_with_env(SUPER_ADMIN_EMAIL="  Boss@SNEC.com ")
    assert mod.SUPER_ADMIN_EMAIL == "boss@snec.com"


def test_super_admin_email_constant_blank_when_env_unset():
    """Fail closed: with the var unset the constant must stay falsy, so login's
    `bool(SUPER_ADMIN_EMAIL) and email == SUPER_ADMIN_EMAIL` can never hand admin to
    a blank email."""
    mod = _load_shared_with_env()
    assert mod.SUPER_ADMIN_EMAIL == ""


def test_login_staff_without_roster_row_returns_stored_name():
    """Staff — the super-admin and promoted supervisors — have no approved_students
    row, so login fell through to `full_name = email` and the home greeting said
    "Good evening, snec.tne.edu@gmail.com". student_consent.student_name is the
    identity of record (it is what /api/auth/me returns), so login must agree with it."""
    auth_row = _make_auth_row("coach@test.com", "pass123")
    sup_row = {"email": "coach@test.com", "role": "trainer"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=sup_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_005", "Coach Lim")), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "coach@test.com", "password": "pass123"})
    assert r.status_code == 200
    assert r.json()["full_name"] == "Coach Lim"


def test_login_admin_entered_roster_name_wins_and_heals_stored_name():
    """The admin types the name when creating the account, and can correct it later —
    so approved_students.full_name is authoritative and beats a stale stored name.
    It must also HEAL the stored identity: /api/auth/me reads student_consent, so
    without the write the two would disagree and the greeting would change on reload."""
    auth_row = _make_auth_row("alice@test.com", "password1")
    approved_row = _make_approved_row("alice@test.com")  # admin typed "Test User"

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_001", "Stale Typo")), \
         patch("tools.shared.db.update_consent", new=AsyncMock()) as mock_update, \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "alice@test.com", "password": "password1"})
    assert r.status_code == 200
    assert r.json()["full_name"] == "Test User"
    mock_update.assert_awaited_once()
    assert mock_update.await_args[0][0] == "stu_001"
    assert mock_update.await_args[1]["student_name"] == "Test User"


def test_login_does_not_write_when_roster_and_stored_name_agree():
    """The heal is a write on the login path — it must fire only on a real mismatch,
    never on every login."""
    auth_row = _make_auth_row("alice@test.com", "password1")
    approved_row = _make_approved_row("alice@test.com")  # "Test User"

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_001", "Test User")), \
         patch("tools.shared.db.update_consent", new=AsyncMock()) as mock_update, \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "alice@test.com", "password": "password1"})
    assert r.status_code == 200
    assert r.json()["full_name"] == "Test User"
    mock_update.assert_not_awaited()


def test_login_staff_stored_name_survives_empty_roster():
    """Staff have no roster row, so there is no authoritative name to heal with —
    their stored name must NOT be clobbered back to their email address."""
    auth_row = _make_auth_row("coach@test.com", "pass123")
    sup_row = {"email": "coach@test.com", "role": "trainer"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=sup_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_005", "Coach Lim")), \
         patch("tools.shared.db.update_consent", new=AsyncMock()) as mock_update, \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "coach@test.com", "password": "pass123"})
    assert r.status_code == 200
    assert r.json()["full_name"] == "Coach Lim"
    mock_update.assert_not_awaited()


def test_login_seeds_new_identity_with_roster_name_not_email():
    """First ever login → the roster name seeds the identity, so a new student is
    never created with their email address stored as their name."""
    auth_row = _make_auth_row("fresh@test.com", "password1")
    approved_row = _make_approved_row("fresh@test.com")  # full_name = "Test User"

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student",
               return_value=("stu_new", "Test User")) as mock_create, \
         patch("tools.api.routers.auth.has_consented", return_value=False):
        r = client.post("/api/auth/login", json={"email": "fresh@test.com", "password": "password1"})
    assert r.status_code == 200
    assert r.json()["full_name"] == "Test User"
    # The name the identity row is seeded with must be the roster name, not the email.
    assert mock_create.await_args[0][0] == "Test User"


def test_me_student_role_from_profile():
    """/api/auth/me sources student_role from student_profiles.role (the effective
    content pool a staff toggle writes), not the stale JWT claim."""
    consent_row = {"email": "coach@test.com", "student_id": "stu_006", "student_name": "Coach"}

    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=consent_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_profile", new=AsyncMock(return_value={"role": "OT"})):
        r = client.get("/api/auth/me", cookies=_auth_cookie("stu_006", "trainer", "OA"))
    assert r.status_code == 200
    assert r.json()["student_role"] == "OT"


def test_onboard_preserves_trainer_role():
    """Onboarding an email in supervisors preserves the staff role (legacy
    'supervisor' → 'trainer'); it no longer collapses to 'supervisor'."""
    sup_row = {"email": "coach@test.com", "role": "supervisor"}

    with patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=sup_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_007", "Coach")), \
         patch("tools.api.routers.auth.has_consented", return_value=False), \
         patch("tools.api.routers.auth.record_consent"):
        r = client.post("/api/onboard", json={"full_name": "Coach", "email": "coach@test.com", "student_role": ""})
    assert r.status_code == 200
    assert r.json()["role"] == "trainer"


def test_change_password_success():
    from tools.shared.auth import hash_password
    old_hash = hash_password("oldpass")
    auth_row = {"email": "carol@test.com", "password_hash": old_hash, "must_change": True}
    consent_row = {"email": "carol@test.com", "student_id": "stu_002", "full_name": "Carol"}

    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=consent_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()) as mock_upsert:
        r = client.post(
            "/api/auth/change-password",
            json={
                "student_id": "stu_002",
                "current_password": "oldpass",
                "new_password": "newpass123",
            },
            cookies=_auth_cookie("stu_002"),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_upsert.assert_called_once()


def test_change_password_forced_first_time_no_student_id():
    """The forced first-time flow (new account) sends ONLY current_password +
    new_password — no student_id, current is empty. It must succeed, not 422.

    Regression: ChangePasswordRequest required a student_id the frontend never
    sends, so FastAPI returned a 422 whose detail array the UI tried to render
    as a React child (React error #31)."""
    consent_row = {"email": "newbie@test.com", "student_id": "stu_new", "full_name": "Newbie"}

    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=consent_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()) as mock_upsert:
        r = client.post(
            "/api/auth/change-password",
            json={"current_password": "", "new_password": "newpass123"},
            cookies=_auth_cookie("stu_new"),
        )
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    mock_upsert.assert_called_once()


def test_change_password_wrong_current():
    from tools.shared.auth import hash_password
    old_hash = hash_password("correctpass")
    auth_row = {"email": "dave@test.com", "password_hash": old_hash, "must_change": False}
    consent_row = {"email": "dave@test.com", "student_id": "stu_003", "full_name": "Dave"}

    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=consent_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)):
        r = client.post(
            "/api/auth/change-password",
            json={
                "student_id": "stu_003",
                "current_password": "wrongpass",
                "new_password": "newpass123",
            },
            cookies=_auth_cookie("stu_003"),
        )
    assert r.status_code == 401


def test_change_password_too_short():
    # Length check fires before consent lookup; no gsheets call needed
    r = client.post(
        "/api/auth/change-password",
        json={
            "student_id": "x",
            "current_password": "any",
            "new_password": "short",
        },
        cookies=_auth_cookie("x"),
    )
    assert r.status_code == 400


def test_student_detail_requires_admin():
    r = TestClient(app).get("/api/admin/student/stu_001/detail")
    assert r.status_code == 401  # no cookie → 401


def test_student_detail_returns_shape():
    # No full_name/email here: student_profiles has neither column. Identity comes
    # from the student_consent row patched below.
    profile_data = {
        "student_id": "stu_001",
        "role": "OA", "session_count": 3, "streak": 2, "last_active": "2026-05-27",
        "learning_velocity": "improving", "weak_topics": [], "missed_findings": [],
        "retention_scores": {}, "supervisor_note": "",
    }
    consent_row = {"student_id": "stu_001", "student_name": "Alice", "email": "alice@test.com"}

    # The last three back the mastery block. Unstubbed, conftest's global
    # `_forbid_real_supabase` blocks them at `db._get_client`, so nothing reaches
    # production — but the handler degrades the resulting failure to `mastery: null`,
    # so the shape assertions below still pass and the only symptom is the guard's
    # teardown error naming a call this test never meant to make.
    with patch("tools.api.routers.admin.get_profile", new=AsyncMock(return_value=profile_data)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=consent_row)), \
         patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_active_student_profiles", new=AsyncMock(return_value=([], 0))), \
         patch("tools.shared.db.get_all_case_scores", new=AsyncMock(return_value=([], True))), \
         patch("tools.shared.db.get_all_flashcard_attempts", new=AsyncMock(return_value=([], True))):
        r = client.get("/api/admin/student/stu_001/detail",
                       cookies=_auth_cookie("admin-uuid", "admin", ""))
    assert r.status_code == 200
    data = r.json()
    assert "sessions" in data
    assert "cases" in data
    assert "retention_scores" in data


# ---------------------------------------------------------------------------
# /api/auth/request-reset and /api/auth/reset-password
# ---------------------------------------------------------------------------

def test_request_reset_returns_ok_for_approved_user():
    """request-reset returns {"ok": True} for a known approved email."""
    approved_row = {"email": "reset@test.com", "full_name": "Reset User", "role": "OA"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.auth.set_otp") as mock_set_otp, \
         patch("tools.shared.gmail_sender.send_email", side_effect=Exception("email disabled")):
        r = client.post("/api/auth/request-reset", json={"email": "reset@test.com"})

    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_set_otp.assert_called_once()
    assert mock_set_otp.call_args[0][0] == "reset@test.com"


def test_request_reset_returns_ok_for_unknown_email():
    """request-reset returns {"ok": True} even for unknown emails (no enumeration)."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)):
        r = client.post("/api/auth/request-reset", json={"email": "nobody@test.com"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_reset_password_success():
    """Valid OTP and new password updates auth row and returns {"ok": True}."""
    with patch("tools.api.routers.auth.verify_and_consume_otp", return_value=True), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()):
        r = client.post("/api/auth/reset-password", json={
            "email": "reset@test.com",
            "otp": "123456",
            "new_password": "newpassword1",
        })
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_reset_password_wrong_or_expired_otp_returns_400():
    """Invalid OTP must return 400."""
    with patch("tools.api.routers.auth.verify_and_consume_otp", return_value=False):
        r = client.post("/api/auth/reset-password", json={
            "email": "reset@test.com",
            "otp": "000000",
            "new_password": "newpassword1",
        })
    assert r.status_code == 400
    assert "Incorrect or expired" in r.json()["detail"]


def test_reset_password_too_short_returns_400():
    """Password shorter than 8 chars must return 400 even when OTP is valid."""
    with patch("tools.api.routers.auth.verify_and_consume_otp", return_value=True):
        r = client.post("/api/auth/reset-password", json={
            "email": "reset@test.com",
            "otp": "123456",
            "new_password": "short",
        })
    assert r.status_code == 400
    assert "8 characters" in r.json()["detail"]


def test_security_headers_present():
    """Every response must include security headers."""
    r = client.get("/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


# ---------------------------------------------------------------------------
# Rate limiting on the pre-auth endpoints (bug hunt ranks 1, 3, 4)
#
# The @limiter.limit decorator only enforces when it wraps the function the
# router registers, i.e. it must sit BELOW @router.post. On login and
# request-reset it was inverted (above @router.post), so slowapi wrapped a copy
# the router never called and the limit was a silent no-op. reset-password had
# no limiter at all — combined with an unbounded OTP guess it is an account
# takeover path. conftest resets limiter._storage between tests.
# ---------------------------------------------------------------------------

def test_login_is_rate_limited():
    """The 6th login inside a minute must be throttled (limit is 5/minute)."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)):
        codes = [
            client.post("/api/auth/login", json={"email": "x@t.com", "password": "p"}).status_code
            for _ in range(6)
        ]
    assert codes[-1] == 429, codes
    assert codes[:5] == [403] * 5, codes


def test_request_reset_is_rate_limited():
    """The 4th request-reset inside a minute must be throttled (limit is 3/minute)."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)):
        codes = [
            client.post("/api/auth/request-reset", json={"email": "x@t.com"}).status_code
            for _ in range(4)
        ]
    assert codes[-1] == 429, codes


def test_reset_password_is_rate_limited():
    """Unbounded OTP guessing is the account-takeover path: reset-password must
    throttle. The 6th attempt inside a minute must be 429 (limit is 5/minute)."""
    with patch("tools.api.routers.auth.verify_and_consume_otp", return_value=False):
        codes = [
            client.post(
                "/api/auth/reset-password",
                json={"email": "x@t.com", "otp": "000000", "new_password": "newpassword1"},
            ).status_code
            for _ in range(6)
        ]
    assert codes[-1] == 429, codes


# ---------------------------------------------------------------------------
# The OTP store uses the SYNC Supabase client; its calls must run off the event
# loop (bug hunt rank 7). A function offloaded via asyncio.to_thread runs in a
# worker thread with no running loop, so asyncio.get_running_loop() raises there.
# ---------------------------------------------------------------------------

def _loop_probe(store, return_value=None):
    """Return a fake that records whether it ran on the event loop thread."""
    import asyncio as _a

    def _fake(*_a_, **_k_):
        try:
            _a.get_running_loop()
            store["on_loop"] = True
        except RuntimeError:
            store["on_loop"] = False
        return return_value
    return _fake


def test_reset_password_offloads_otp_verify():
    seen: dict = {}
    with patch("tools.api.routers.auth.verify_and_consume_otp",
               side_effect=_loop_probe(seen, return_value=False)):
        client.post(
            "/api/auth/reset-password",
            json={"email": "x@t.com", "otp": "000000", "new_password": "newpassword1"},
        )
    assert seen.get("on_loop") is False, "verify_and_consume_otp must run off the event loop"


def test_request_reset_offloads_set_otp():
    seen: dict = {}
    approved_row = {"email": "x@t.com", "full_name": "X", "role": "OA"}
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.auth.set_otp", side_effect=_loop_probe(seen)), \
         patch("tools.shared.gmail_sender.send_email", side_effect=Exception("email disabled")):
        client.post("/api/auth/request-reset", json={"email": "x@t.com"})
    assert seen.get("on_loop") is False, "set_otp must run off the event loop"
