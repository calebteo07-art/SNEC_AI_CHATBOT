"""Regression tests for `scripts/start-harness.sh` — both ways it can report a
green harness against a build it never loaded.

`stop`, observed twice in one session (2026-07-28): `.tmp/harness-server.pid`
held 5884 while the node.exe listening on :3000 was 19200, so `stop` printed
"harness server stopped", exited 0 — and left the server serving. The next run
then took the "reusing server already answering on :3000" branch and asserted a
STALE build. Root cause: under Git Bash the `$!` captured after `(cd … && nohup
node … &)` is the msys subshell, not the node.exe that owns the port; on Linux
the exec chain collapses into one pid, which is why CI never saw it.

`start`, observed the same day: an orphaned node (its parent already dead) was
LISTENING on :3000 serving a build from before the /dashboard → /homepage
rename. It answered too slowly for the gate's 2s probe, so the script skipped
the stop and took the start branch; its own node then died of EADDRINUSE into
.tmp/harness-server.log, which nothing reads, and the 60-iteration poll went
green off the SQUATTER's replies. "── server up", then aurora_assert.mjs failed
on a missing "Homepage" navitem — which reads as a code regression, not an
environment problem. Worse than the `stop` trap: a stranger's build that is
close to yours produces a false GREEN, not a red.

Contract locked here: when `stop` exits 0 the port is free, and when `start`
says "server up" the process answering the port is the child it just launched —
whatever the pidfile claims, in either direction.

OWNERSHIP, added 2026-07-30 after a third variant of the same false signal: the
script used to start node, exit, and leave an ORPHAN nobody owned, which the
next SKIP_BUILD=1 run happily reused. Whatever later reaped that orphan killed
it MID-SUITE, and the harness in flight failed on whichever wait it happened to
be in — a different scenario each run, against an unchanged bundle. A server
that dies after the HTML but before the /_next chunks strands the app on
BrandSplash, so it surfaced as a UI wait timing out, not as "the server is
gone". Contract locked here: an assert run reaps the server it started, on the
red path as well as the green one; `serve` alone hands it to the operator; a
second concurrent run in the same tree is refused rather than allowed to
`rm -rf` static out from under a live server; and a lock whose holder is dead
is reclaimed, so a hard-killed run can never brick the next one.

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
    shutil.which("bash") is None or NODE is None or shutil.which("curl") is None,
    reason="needs bash + node + curl to drive scripts/start-harness.sh",
)

# Stands in for the standalone server: all `stop` cares about is who owns the port.
LISTENER = "require('http').createServer((_, r) => r.end('ok')).listen(+process.argv[1], '127.0.0.1');"

# Stands in for .next/standalone/server.js, so the start branch costs `node -e`, not a
# `next build`. Left to crash on its own 'error' event — node's uncaught EADDRINUSE is
# exactly what the real bundle writes to the log.
STANDALONE = "require('http').createServer((_, r) => r.end('ok')).listen(+process.env.PORT, '127.0.0.1');\n"

# The orphan that fooled the poll. Cold for the gate's two probes (both curls give up at
# --max-time 2, so the script never stops it and takes the START branch), warm by the
# time the post-launch poll asks — the sequence that turned a squatter into "server up".
SQUATTER = (
    "let seen = 0;"
    "require('http').createServer((_, r) => {"
    "  if (++seen <= 2) { setTimeout(() => r.end('stale'), 30000); return; }"
    "  r.end('stale');"
    "}).listen(+process.argv[1], '127.0.0.1');"
)


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


def _harness(root: Path, mode: str, port: int, **env) -> subprocess.CompletedProcess:
    """The script drives itself off its own location, so `root` picks which tree it runs."""
    return subprocess.run(
        ["bash", str(root / "scripts" / "start-harness.sh"), mode],
        cwd=root,
        env={**os.environ, "HARNESS_PORT": str(port), **env},
        capture_output=True,
        text=True,
        encoding="utf-8",  # the script's box-drawing prefixes are UTF-8, the console is not
        errors="replace",
        timeout=180,
    )


def _stop(port: int) -> subprocess.CompletedProcess:
    return _harness(ROOT, "stop", port)


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


@pytest.fixture
def sandbox(tmp_path):
    """The script in a throwaway tree with a fake standalone bundle.

    SKIP_BUILD=1 skips `next build`, but the start branch still copies static/ and
    public/ into the bundle and runs it — so drive it against a two-line server.js
    instead of the real one, and never touch the worktree's own .next.
    """
    (tmp_path / "scripts").mkdir()
    shutil.copy(SCRIPT, tmp_path / "scripts" / SCRIPT.name)
    fe = tmp_path / "frontend"
    (fe / "public").mkdir(parents=True)
    (fe / ".next" / "static").mkdir(parents=True)
    (fe / ".next" / "standalone" / ".next").mkdir(parents=True)
    (fe / ".next" / "BUILD_ID").write_text("sandbox\n")
    (fe / ".next" / "standalone" / "server.js").write_text(STANDALONE)
    return tmp_path


@pytest.fixture
def squatter():
    """An orphan on the port that the gate's 2s probe cannot see (see module docstring)."""
    port = _free_port()
    proc = subprocess.Popen(
        [NODE, "-e", SQUATTER, str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    assert _wait_until(lambda: _listening(port)), "test squatter never came up"
    yield port
    proc.kill()
    proc.wait(timeout=30)


def test_start_refuses_to_call_a_squatters_replies_its_own_server(sandbox, squatter):
    """The reported case: node dies of EADDRINUSE, the poll goes green off the orphan."""
    res = _harness(sandbox, "serve", squatter, SKIP_BUILD="1")
    out = res.stdout + res.stderr

    assert res.returncode != 0, f"start reported success against a stranger's build:\n{out}"
    assert "server up" not in res.stdout, res.stdout
    assert "EADDRINUSE" in out, out
    assert _listening(squatter), "the squatter is not ours to kill — only to refuse"


def test_start_reports_up_only_after_its_own_child_answers(sandbox):
    """The guard must not cry wolf on the happy path — a live child owning a free port."""
    port = _free_port()
    try:
        res = _harness(sandbox, "serve", port, SKIP_BUILD="1")

        assert res.returncode == 0, res.stdout + res.stderr
        assert "server up" in res.stdout, res.stdout
        assert _listening(port), "start said it was up but nothing is serving"
    finally:
        _harness(sandbox, "stop", port)


def test_start_surfaces_the_log_when_its_child_dies_for_any_other_reason(sandbox):
    """A crashing bundle used to poll for 60s and print only 'see $LOGFILE'."""
    (sandbox / "frontend" / ".next" / "standalone" / "server.js").write_text(
        "throw new Error('bundle is broken');\n"
    )

    res = _harness(sandbox, "serve", _free_port(), SKIP_BUILD="1")
    out = res.stdout + res.stderr

    assert res.returncode != 0, out
    assert "bundle is broken" in out, f"the log tail never reached the operator:\n{out}"


# ── ownership (see the module docstring) ───────────────────────────────────────


def _fake_assert(sandbox: Path, exit_code: int) -> None:
    """A stand-in for aurora_assert.mjs, so an assert run costs a `node -e`, not a browser."""
    tests = sandbox / "frontend" / "tests"
    tests.mkdir(parents=True, exist_ok=True)
    (tests / "aurora_assert.mjs").write_text(f"process.exit({exit_code});\n")


def _bash_written_pid(target: Path, alive: bool):
    """A pid in the namespace the script's `kill -0` reads.

    Git Bash msys pids and the Windows pids Python sees are different numbers for the
    same process, so a pid captured from subprocess would be judged dead (or, worse,
    collide with a live stranger). Letting bash write its own `$$` is the only way to
    put a truthful pid in the lockfile from here. Returns the holder to kill, or None.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    script = f'echo $$ > "{target.as_posix()}"'
    if not alive:
        subprocess.run(["bash", "-c", script], check=True, timeout=60)
        return None  # that bash has exited, so the pid it wrote is dead
    holder = subprocess.Popen(
        ["bash", "-c", f"{script}; sleep 120"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    assert _wait_until(lambda: target.exists() and target.read_text().strip() != ""), (
        "the lock holder never wrote its pid"
    )
    return holder


def test_an_assert_run_leaves_no_server_behind(sandbox):
    """The orphan at its source: a green run must not leave a server for the next to reuse."""
    _fake_assert(sandbox, 0)
    port = _free_port()
    try:
        res = _harness(sandbox, "aurora", port, SKIP_BUILD="1")

        assert res.returncode == 0, res.stdout + res.stderr
        assert "server up" in res.stdout, res.stdout
        assert _wait_until(lambda: not _listening(port)), (
            f"the run exited but :{port} is still serving — that orphan is what the next "
            f"SKIP_BUILD=1 run silently reuses, and what dies mid-suite"
        )
    finally:
        _harness(sandbox, "stop", port)


def test_a_failing_assert_run_still_reaps_its_server(sandbox):
    """Red runs leaked hardest: you rerun immediately, straight onto the orphan."""
    _fake_assert(sandbox, 1)
    port = _free_port()
    try:
        res = _harness(sandbox, "aurora", port, SKIP_BUILD="1")

        assert res.returncode != 0, res.stdout
        assert _wait_until(lambda: not _listening(port)), f":{port} leaked after a failed run"
    finally:
        _harness(sandbox, "stop", port)


def test_serve_hands_the_server_over_instead_of_reaping_it(sandbox):
    """`serve` is the one mode whose server must OUTLIVE the script — the escape hatch."""
    port = _free_port()
    try:
        res = _harness(sandbox, "serve", port, SKIP_BUILD="1")

        assert res.returncode == 0, res.stdout + res.stderr
        assert _listening(port), "serve reaped the server it was supposed to hand over"
    finally:
        _harness(sandbox, "stop", port)


def test_a_second_concurrent_run_in_the_same_tree_is_refused(sandbox):
    """Two runs race `rm -rf .next/standalone/static` out from under each other's server."""
    port = _free_port()
    holder = _bash_written_pid(sandbox / ".tmp" / f"harness-{port}.lock" / "pid", alive=True)
    try:
        res = _harness(sandbox, "serve", port, SKIP_BUILD="1")
        out = res.stdout + res.stderr

        assert res.returncode != 0, out
        assert "already owns" in out, out
        assert not _listening(port), "a refused run must not have started a server"
    finally:
        if holder is not None:
            holder.kill()
            holder.wait(timeout=30)


def test_a_stale_lock_never_bricks_the_next_run(sandbox):
    """A hard-killed run leaves the lock dir behind; reclaiming it must be automatic."""
    port = _free_port()
    _bash_written_pid(sandbox / ".tmp" / f"harness-{port}.lock" / "pid", alive=False)
    try:
        res = _harness(sandbox, "serve", port, SKIP_BUILD="1")

        assert res.returncode == 0, res.stdout + res.stderr
        assert "stale lock" in res.stdout, res.stdout
        assert _listening(port), "the reclaiming run never came up"
    finally:
        _harness(sandbox, "stop", port)
