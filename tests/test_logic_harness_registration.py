"""The frontend logic harnesses are DISCOVERED, so none of them can exist unenforced.

`.github/workflows/ci.yml` named each harness on its own line, and the list drifted to
16 of 29. The other thirteen — caseFilter, charts, eyecon_layers, eyecon_studio,
flashcards_deckladder, flashcards_scoring, logo_mark, pool_toggle, session_export,
station_timer, student-report, tiers and tutor_sessions — all existed, all passed when
run by hand, and none of them gated a push. That is worse than having no harness at all:
the file sitting in the tree reads as coverage, so nobody writes the test again.

A hand list cannot notice its own gaps, so the drift is pinned here instead: the rule is
mechanical, it defaults to RUNNING a file, and CI is forbidden from naming harnesses.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
TESTS = ROOT / "frontend" / "tests"
RUNNER = TESTS / "_run_logic.mjs"
CI = ROOT / ".github" / "workflows" / "ci.yml"

NODE = shutil.which("node")


def _logic_harnesses() -> set[str]:
    """The same rule `_run_logic.mjs` applies, implemented independently of it.

    A second implementation is the whole point. If the runner's filter breaks in a way
    that selects nothing, spawning zero harnesses exits 0 and reads as a green suite —
    so the two must be able to disagree.
    """
    return {
        p.name
        for p in TESTS.glob("*.mjs")
        if not p.name.startswith("_")
        and 'from "playwright"' not in p.read_text(encoding="utf-8")
    }


def test_ci_invokes_the_runner_instead_of_naming_harnesses():
    """The regression itself: a hand list that nothing forces anyone to extend."""
    ci = CI.read_text(encoding="utf-8")

    assert "npm run test:logic" in ci, (
        "the frontend job must run the discovery runner; naming harnesses in ci.yml is "
        "what drifted to 16 of 29"
    )
    named = sorted(n for n in _logic_harnesses() if n in ci)
    assert not named, (
        f"ci.yml names {len(named)} harness file(s) directly ({', '.join(named)}). A list "
        f"only covers what someone remembered to add to it — let discovery run them."
    )

    scripts = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))["scripts"]
    assert RUNNER.name in scripts.get("test:logic", ""), (
        "frontend/package.json needs a test:logic script pointing at the runner, so the "
        "gate is one command locally and in CI"
    )


@pytest.mark.skipif(NODE is None, reason="needs node to drive the runner")
def test_the_runner_discovers_every_logic_harness():
    res = subprocess.run(
        [NODE, str(RUNNER), "--list"], capture_output=True, text=True, timeout=60
    )

    assert res.returncode == 0, res.stderr
    assert set(res.stdout.split()) == _logic_harnesses()


@pytest.mark.skipif(NODE is None, reason="needs node to drive the runner")
def test_one_failing_harness_fails_the_whole_run(tmp_path):
    """Running all 29 is worth nothing if the exit code only reflects the last one.

    Driven against a throwaway directory of trivial harnesses so the contract is tested
    without a red harness in the real tree.
    """
    for i in range(26):
        (tmp_path / f"h{i:02d}_logic.mjs").write_text("process.exit(0);\n", encoding="utf-8")

    def run() -> subprocess.CompletedProcess:
        return subprocess.run(
            [NODE, str(RUNNER), str(tmp_path)], capture_output=True, text=True, timeout=120
        )

    assert run().returncode == 0, "an all-green directory must not be reported as failing"

    # Not the last one: a runner that only forwards the final child's status passes here.
    (tmp_path / "h00_logic.mjs").write_text("process.exit(1);\n", encoding="utf-8")
    res = run()

    assert res.returncode != 0, "a failing harness did not fail the run"
    assert "FAIL  h00_logic.mjs" in res.stdout, res.stdout


@pytest.mark.skipif(NODE is None, reason="needs node to drive the runner")
def test_the_runner_fails_rather_than_silently_discovering_nothing(tmp_path):
    """Discovery collapsing is the one way this design can go false-green on its own.

    A filter that selects nothing spawns nothing, and a loop over an empty list exits 0.
    """
    (tmp_path / "_mocks.mjs").write_text("export const x = 1;\n", encoding="utf-8")

    res = subprocess.run(
        [NODE, str(RUNNER), str(tmp_path)], capture_output=True, text=True, timeout=60
    )

    assert res.returncode != 0, "running no harnesses reported success"
    assert "expected at least" in res.stderr, res.stderr
