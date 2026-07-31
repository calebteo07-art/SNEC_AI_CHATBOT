"""`start-harness.sh all` discovers the browser harnesses, and the opt-outs stay justified.

`all` named six of twenty. The other fourteen existed and **eleven of them passed** — they
gated nothing simply because nobody had extended the list, the same drift that had ci.yml
running 16 of 29 logic harnesses (see test_logic_harness_registration.py). The prior audit
assumed the ungated ones had rotted red; they had not. Nothing was broken, and nothing was
watching.

Discovery alone is not the guard. A list of exclusions is a list, and it rots the same way
the inclusion list did — the difference is only that this one fails SAFE, since anything
left out of it still runs. So the exclusions are duplicated here with their reasons: adding
one means editing this file, which means saying why.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
TESTS = ROOT / "frontend" / "tests"
SCRIPT = ROOT / "scripts" / "start-harness.sh"
CI = ROOT / ".github" / "workflows" / "ci.yml"

BASH = shutil.which("bash")
pytestmark = pytest.mark.skipif(BASH is None, reason="needs bash to drive start-harness.sh")

# Every harness deliberately NOT gated, and why. Keep this in step with NOT_GATED in the
# script — the duplication is the point, not an accident.
EXPECTED_NOT_GATED = {
    # A screenshot sweep with no exit code: it cannot fail, so gating it buys CI minutes
    # and a false sense of cover. This is the only justified exclusion — every other
    # browser harness runs. Do not grow this list; fix the harness or fix the defect.
    "visual_sweep.mjs",
}


def _browser_harnesses() -> set[str]:
    """Every real browser harness, by the same rule the script applies — independently.

    The `_` prefix is load-bearing, not tidiness: tests/_run_logic.mjs contains the string
    `from "playwright"` inside its own filter, so a grep alone adopts the logic runner as a
    browser harness and `all` tries to run it against a live server.
    """
    return {
        p.name
        for p in TESTS.glob("*.mjs")
        if not p.name.startswith("_")
        and 'from "playwright"' in p.read_text(encoding="utf-8")
    }


def _listed(root: Path = ROOT) -> subprocess.CompletedProcess:
    """`list` answers a question about the tree, so it must not build or serve anything."""
    return subprocess.run(
        [BASH, str(root / "scripts" / "start-harness.sh"), "list"],
        cwd=root, capture_output=True, text=True, timeout=120,
    )


def test_all_mode_runs_every_browser_harness_that_is_not_explicitly_excluded():
    res = _listed()
    assert res.returncode == 0, res.stderr

    listed = set(res.stdout.split())
    everything = _browser_harnesses()

    assert listed <= everything, (
        f"`list` names files that are not browser harnesses: {sorted(listed - everything)}"
    )
    assert everything - listed == EXPECTED_NOT_GATED, (
        f"the ungated set changed. Now ungated: {sorted(everything - listed)}. If a harness "
        f"was added to NOT_GATED, say why here; if one was re-gated, drop it from "
        f"EXPECTED_NOT_GATED."
    )


def _all_arm() -> str:
    """The `all)` arm of the mode dispatch, up to its `;;`."""
    lines = SCRIPT.read_text(encoding="utf-8").splitlines()
    start = next(i for i, ln in enumerate(lines) if ln.strip().startswith("all)"))
    arm = []
    for ln in lines[start:]:
        arm.append(ln)
        if ";;" in ln:
            break
    return "\n".join(arm)


def test_the_all_arm_actually_runs_what_list_reports():
    """`list` and `all` share gated_harnesses, and nothing but this stops them diverging.

    Every other test here drives `list`, so `all` could quietly go back to naming six while
    `list` kept reporting seventeen — a green pin over a gate that runs a third of the suite.
    The named modes above `all` (aurora, station, forfeit, hover) name harnesses on purpose;
    they are fast targeted subsets, not the gate.
    """
    arm = _all_arm()

    assert "gated_harnesses" in arm, f"`all` no longer discovers:\n{arm}"
    named = sorted(n for n in _browser_harnesses() if n in arm)
    assert not named, f"`all` names harnesses directly ({', '.join(named)}):\n{arm}"


def test_ci_drives_the_discovering_mode_rather_than_naming_harnesses():
    ci = CI.read_text(encoding="utf-8")

    assert "start-harness.sh all" in ci, "the browser gate must run the discovering mode"
    named = sorted(n for n in _browser_harnesses() if n in ci)
    assert not named, (
        f"ci.yml names {len(named)} browser harness file(s) directly ({', '.join(named)}) — "
        f"that is the list that drifted to 6 of 20"
    )


@pytest.fixture
def sandbox(tmp_path):
    """The script in a throwaway tree. `list` short-circuits before the lock, the build and
    the server, so this costs no build — and proving that is half the point of the mode."""
    (tmp_path / "scripts").mkdir()
    shutil.copy(SCRIPT, tmp_path / "scripts" / SCRIPT.name)
    (tmp_path / "frontend" / "tests").mkdir(parents=True)
    return tmp_path


def _fake_harnesses(sandbox: Path, n: int) -> None:
    for i in range(n):
        (sandbox / "frontend" / "tests" / f"h{i:02d}_assert.mjs").write_text(
            'import { chromium } from "playwright";\n', encoding="utf-8"
        )


def test_list_needs_no_build_and_no_server(sandbox):
    _fake_harnesses(sandbox, 17)

    res = _listed(sandbox)

    assert res.returncode == 0, res.stderr
    assert len(res.stdout.split()) == 17
    assert "building" not in res.stdout, "list must not trigger next build"


def test_discovering_almost_nothing_fails_instead_of_passing_quietly(sandbox):
    """A filter that selects nothing runs nothing, and a loop over nothing exits 0."""
    _fake_harnesses(sandbox, 5)

    res = _listed(sandbox)

    assert res.returncode != 0, "a collapsed discovery reported success"
    assert "expected at least" in res.stderr, res.stderr
