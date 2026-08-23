"""Regression guard for the weekly digest's "Open Dashboard" call-to-action.

The digest is a real email sent to SNEC supervisors, and its one button was hardcoded to
`http://localhost:5173/supervisor` — two dead ends in a single href:

**`localhost:5173`** is a Vite dev address. Vite is not this app's dev server any more
(Next.js on :3000 is), and either way a `localhost` link in a *mailed* page resolves
against the recipient's own machine — so the button reached nothing at all for every
supervisor who clicked it.

**`/supervisor`** is not a route. The staff console lives at `/admin`
(frontend/src/app/(console)/admin/page.tsx); there has never been a `/supervisor` page,
only the `/api/supervisor/*` endpoints it reads. Even against the right host the link
would have landed on a 404.

The base now comes from `config.app_base_url()`, derived from ALLOWED_ORIGINS — the
origin the deployment already has to configure, and which `assert_production_ready`
guarantees is explicit and non-wildcard in production. These tests pin the rendered
output rather than the helper (tests/shared/test_config.py owns that) because the
defect that shipped was in the *render*: a correct helper still mails a dead link if the
CTA ignores it.
"""
import pytest

from tools.supervisor import weekly_digest
from tools.supervisor.weekly_digest import build_digest_html

_PROD_ORIGIN = "https://eyebot.snec.example"


@pytest.fixture(autouse=True)
def _stub_cohort_reads(monkeypatch):
    """The three roll-ups the digest awaits, stubbed at the digest's own namespace.

    Every one of them reaches Supabase; the global `_forbid_real_supabase` fixture would
    fail the test on the way out. Their content is irrelevant here — this file is about
    the one href — so they return the smallest well-formed payloads that render.
    """
    async def _summary():
        return {"total": 12, "active_this_week": 9, "at_risk_count": 1,
                "weakest_topics": [{"topic": "tonometry", "count": 3}]}

    async def _at_risk():
        return [{"student_id": "s1234567890ab", "risk_score": 68, "band": "high",
                 "reasons": [{"factor": "osce_pass_rate", "weight": 31.2,
                              "detail": "Passing 1 of 5 graded stations"}],
                 "days_inactive": 14, "weak_topics": ["tonometry"]}]

    async def _benchmarks():
        return [{"topic": "tonometry", "avg_score": 0.62, "student_count": 8}]

    async def _names():
        # A FOURTH read, added when the at-risk table stopped identifying students by
        # truncated UUID. It reaches student_consent like the three above, so it needs
        # the same stub — without it `_forbid_real_supabase` fails these tests on the
        # way out, which is the guard working, not a flake.
        return {"s1234567890ab": "Caleb Teo"}

    monkeypatch.setattr(weekly_digest, "cohort_summary", _summary)
    monkeypatch.setattr(weekly_digest, "get_at_risk", _at_risk)
    monkeypatch.setattr(weekly_digest, "get_cohort_benchmarks", _benchmarks)
    monkeypatch.setattr(weekly_digest, "resolve_names", _names)


@pytest.mark.asyncio
async def test_the_mailed_digest_never_contains_a_localhost_address(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", _PROD_ORIGIN)

    html = await build_digest_html("supervisor@snec.example")

    assert "localhost" not in html, \
        "a loopback address in a mailed page resolves on the RECIPIENT's machine"
    assert "127.0.0.1" not in html
    assert ":5173" not in html, "Vite is not this app's dev server"


@pytest.mark.asyncio
async def test_the_call_to_action_links_to_the_console_route_that_exists(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", _PROD_ORIGIN)

    html = await build_digest_html("supervisor@snec.example")

    assert 'href="' + _PROD_ORIGIN + '/admin"' in html
    assert "/supervisor" not in html, \
        "there is no /supervisor page — only /api/supervisor/* endpoints"


@pytest.mark.asyncio
async def test_the_base_follows_the_deployment_rather_than_a_baked_in_literal(monkeypatch):
    """Two renders under two deployments must produce two different hrefs.

    Without this a future 'fix' could hardcode the current Render hostname and pass both
    tests above, re-creating the exact defect one deploy later.
    """
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://eyebot.a.example")
    first = await build_digest_html("supervisor@snec.example")

    monkeypatch.setenv("ALLOWED_ORIGINS", "https://eyebot.b.example")
    second = await build_digest_html("supervisor@snec.example")

    assert 'href="https://eyebot.a.example/admin"' in first
    assert 'href="https://eyebot.b.example/admin"' in second


@pytest.mark.asyncio
async def test_a_dev_origin_list_still_yields_the_public_host(monkeypatch):
    """ALLOWED_ORIGINS commonly carries the dev origins alongside the real one; the
    button has to pick the host a mail client can actually reach."""
    monkeypatch.setenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000," + _PROD_ORIGIN,
    )

    html = await build_digest_html("supervisor@snec.example")

    assert 'href="' + _PROD_ORIGIN + '/admin"' in html
    assert "localhost" not in html
