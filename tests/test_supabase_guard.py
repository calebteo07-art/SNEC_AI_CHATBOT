"""The suite must not be able to reach production Supabase through ANY seam.

``tests/conftest.py::_forbid_real_supabase`` blocked ``tools.shared.db._get_client``
and its docstring claimed "every db function funnels through" it. That was true of
``tools/shared/db.py`` and false of the process as a whole: ``tools/kb/supabase_client.py``
is a *second*, independent client factory, and two runtime modules build their client
from it —

    tools/shared/otp_store.py:14   from tools.kb.supabase_client import get_client
    tools/api/health.py:18         from tools.kb.supabase_client import get_client

``otp_store`` is the password-reset path, so it WRITES (inserting OTP rows, bumping the
per-email attempt counter). ``.env`` is gitignored and absent from a fresh worktree, but
it exists on the maintainer's checkout — and ``load_dotenv()`` means a test reaching this
seam unstubbed there hits the live production database on an ordinary ``pytest`` run.

This test pins both seams so the guard cannot silently cover half the surface again.

It asserts the patch is *installed* rather than calling through it: tripping the blocker
records the attempt, and the fixture's own teardown then fails the test for leaking — so
a behavioural check here would poison the very fixture it is verifying.
"""


def test_both_supabase_seams_are_guarded():
    from tools.kb import supabase_client
    from tools.shared import db

    assert db._get_client.__name__ == "_blocked", (
        "tools.shared.db._get_client is not patched — the suite can reach production Supabase"
    )
    assert supabase_client.get_client.__name__ == "_blocked_sync", (
        "tools.kb.supabase_client.get_client is not patched — otp_store (which WRITES "
        "password-reset rows) and the readiness probe can reach production Supabase"
    )
