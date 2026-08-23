"""Regression guard for the digest's documented manual-send entry point.

The module docstring advertises

    python tools/supervisor/weekly_digest.py supervisor@example.com

but ``__main__`` called ``send_weekly_digest(...)`` — an ``async def`` — without
awaiting it. Python built a coroutine object, dropped it unexecuted, and the very
next line printed ``Digest sent to <email>``. The one command a supervisor is told
to run therefore reported success while mailing nothing at all. Its only trace was a
``coroutine 'send_weekly_digest' was never awaited`` RuntimeWarning, emitted at
garbage-collection time and trivially lost in a redirected stream.

These tests drive the real ``__main__`` block via ``runpy`` and assert on the OUTCOME — that
``send_email`` was actually invoked, and that the success line is never printed
when it wasn't — rather than on ``asyncio.run`` appearing in the source. Any future
entry point that forgets to drive the coroutine to completion fails here no matter
how it is spelled.

The stubs are installed on the modules the entry point imports *from*, not on
``weekly_digest``'s own namespace: ``runpy`` re-executes the file into a fresh
namespace, so its ``from ... import ...`` lines re-bind at run time and a patch
applied to ``weekly_digest`` itself would be thrown away — the trap that makes this
file's fixture look gratuitously different from its sibling in
tests/supervisor/test_weekly_digest_link.py. Stubbing also keeps the run keyless and
off Supabase — email sending is inert without GMAIL_*/EMAIL_FROM, and the global
``_forbid_real_supabase`` fixture would fail the test on the way out.
"""
import runpy
import sys
from pathlib import Path

import pytest

from tools.shared import gmail_sender, identity
from tools.supervisor import at_risk, cohort_benchmarks, cohort_summary, weekly_digest

_ENTRY_POINT = Path(weekly_digest.__file__)
_SUPERVISOR = "supervisor@snec.example"


@pytest.fixture
def sent(monkeypatch):
    """Record every send_email call, and stub the four Supabase reads it renders."""
    calls: list[dict] = []

    def _send_email(*, to, subject, html, text=""):
        calls.append({"to": to, "subject": subject, "html": html})

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
        # The fourth read, added when the at-risk table stopped identifying students by
        # truncated UUID. It reaches student_consent like the three above.
        return {"s1234567890ab": "Caleb Teo"}

    monkeypatch.setenv("ALLOWED_ORIGINS", "https://eyebot.snec.example")
    monkeypatch.setattr(gmail_sender, "send_email", _send_email)
    monkeypatch.setattr(cohort_summary, "cohort_summary", _summary)
    monkeypatch.setattr(at_risk, "get_at_risk", _at_risk)
    monkeypatch.setattr(cohort_benchmarks, "get_cohort_benchmarks", _benchmarks)
    monkeypatch.setattr(identity, "resolve_names", _names)
    return calls


def _run_cli(monkeypatch, *args: str) -> None:
    """Execute the file's ``__main__`` block exactly as ``python <file> <args>`` would."""
    monkeypatch.setattr(sys, "argv", [str(_ENTRY_POINT), *args])
    runpy.run_path(str(_ENTRY_POINT), run_name="__main__")


def test_the_documented_manual_send_actually_delivers_the_digest(monkeypatch, sent, capsys):
    _run_cli(monkeypatch, _SUPERVISOR)

    assert len(sent) == 1, (
        "the entry point built the coroutine but never ran it — "
        "the documented manual send mailed nothing"
    )
    assert sent[0]["to"] == _SUPERVISOR
    assert "Weekly Digest" in sent[0]["subject"]
    assert "Open Dashboard" in sent[0]["html"], "the rendered digest, not an empty body"
    assert "Digest sent to " + _SUPERVISOR in capsys.readouterr().out


def test_a_failed_delivery_is_never_reported_as_success(monkeypatch, sent, capsys):
    """The original defect was a success message with no send behind it.

    Awaiting the coroutine is what lets a real delivery failure reach the operator:
    ``send_email`` raises RuntimeError on misconfiguration, and that has to surface
    as a non-zero exit rather than as "Digest sent".
    """
    def _boom(**_kwargs):
        raise RuntimeError("GMAIL_REFRESH_TOKEN missing")

    monkeypatch.setattr(gmail_sender, "send_email", _boom)

    with pytest.raises(RuntimeError):
        _run_cli(monkeypatch, _SUPERVISOR)

    assert "Digest sent" not in capsys.readouterr().out


def test_a_missing_recipient_exits_nonzero_without_sending(monkeypatch, sent, capsys):
    with pytest.raises(SystemExit) as exc:
        _run_cli(monkeypatch)

    assert exc.value.code == 1
    assert not sent
    assert "Usage:" in capsys.readouterr().out
