"""Regression tests for `scripts/start-harness.sh stop`.

Observed twice in one session (2026-07-28): `.tmp/harness-server.pid` held 5884
while the node.exe listening on :3000 was 19200, so `stop` printed "harness
server stopped", exited 0 — and left the server serving. The next run then took
the "reusing server already answering on :3000" branch and asserted a STALE
build. Root cause: under Git Bash the `$!` captured after `(cd … && nohup node
… &)` is the msys subshell, not the node.exe that owns the port; on Linux the
exec chain collapses into one pid, which is why CI never saw it.

Contract locked here: when `stop` exits 0 the port is free — whatever started
the server, and whatever the pidfile claims.

Driven on a private HARNESS_PORT so a real harness on :3000 is never killed.
"""
import os
import shutil
import socket
import subprocess
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "start-harness.sh"
PIDFILE = ROOT / ".tmp" / "harness-server.pid"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(
    shutil.which("bash") is None or NODE is None,
    reason="needs bash + node to drive scripts/start-harness.sh",
)

# Stands in for the standalone server: all `stop` cares about is who owns the port.
LISTENER = "require('http').createServer((_, r) => r.end('ok')).listen(+process.argv[1], '127.0.0.1');"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _listening(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _wait_until(pred, timeout: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if pred():
            return True
        time.sleep(0.1)
    return pred()


def _dead_pid() -> int:
    """A pid that has certainly exited — the pidfile's lie, reproduced."""
    proc = subprocess.Popen([NODE, "-e", ""], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    proc.wait(timeout=60)
    return proc.pid


def _stop(port: int) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(SCRIPT), "stop"],
        cwd=ROOT,
        env={**os.environ, "HARNESS_PORT": str(port)},
        capture_output=True,
        text=True,
        timeout=180,
    )


@pytest.fixture
def pidfile():
    """`stop` deletes .tmp/harness-server.pid — never eat a live harness's own."""
    saved = PIDFILE.read_text() if PIDFILE.exists() else None
    yield PIDFILE
    if saved is None:
        PIDFILE.unlink(missing_ok=True)
    else:
        PIDFILE.write_text(saved)


@pytest.fixture
def orphan():
    """A listener the script never started — the case no pidfile can describe."""
    port = _free_port()
    proc = subprocess.Popen(
        [NODE, "-e", LISTENER, str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    assert _wait_until(lambda: _listening(port)), "test listener never came up"
    yield port
    proc.kill()
    proc.wait(timeout=30)


def test_stop_frees_a_port_it_never_recorded(orphan, pidfile):
    """The orphan case: server up, no pidfile at all. Old script: 'nothing to stop'."""
    pidfile.unlink(missing_ok=True)

    res = _stop(orphan)

    assert res.returncode == 0, res.stderr
    assert _wait_until(lambda: not _listening(orphan)), (
        f"stop said {res.stdout.strip()!r} but :{orphan} is still serving"
    )


def test_stop_ignores_a_stale_pidfile_and_still_frees_the_port(orphan, pidfile):
    """The reported case verbatim: the pidfile names a process that is not the listener."""
    pidfile.write_text(f"{_dead_pid()}\n")

    res = _stop(orphan)

    assert res.returncode == 0, res.stderr
    assert _wait_until(lambda: not _listening(orphan)), (
        f"stop said {res.stdout.strip()!r} but :{orphan} is still serving"
    )
    assert not pidfile.exists(), "a successful stop must clear the pidfile"


def test_stop_reports_the_port_not_the_pidfile_when_nothing_is_listening(pidfile):
    """Idempotent, and honest about what it checked."""
    res = _stop(_free_port())

    assert res.returncode == 0, res.stderr
    assert "nothing listening" in res.stdout.lower(), res.stdout
