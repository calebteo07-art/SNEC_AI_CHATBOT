"""Tests for the PreCompact auto-snapshot hook (.claude/hooks/session_snapshot.py).

The hook writes a mechanical "breadcrumb" before Claude Code compacts/ends a
session so a resume is never a total black box. It must FAIL OPEN (never raise,
never block) and produce a clearly-labelled, non-empty markdown snapshot.
"""
import importlib.util
import json
from pathlib import Path

HOOK = Path(__file__).resolve().parent.parent / ".claude" / "hooks" / "session_snapshot.py"


def _load():
    spec = importlib.util.spec_from_file_location("session_snapshot", HOOK)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _transcript(*objs):
    return "\n".join(json.dumps(o) for o in objs)


SAMPLE = _transcript(
    {"type": "user", "message": {"role": "user", "content": "redesign the leaderboard"}},
    {"type": "assistant", "message": {"role": "assistant", "content": [
        {"type": "text", "text": "On it — reading the current board."},
        {"type": "tool_use", "name": "Read", "input": {"file_path": "frontend/src/app/x/page.tsx"}},
    ]}},
    {"type": "assistant", "message": {"role": "assistant", "content": [
        {"type": "tool_use", "name": "Edit", "input": {"file_path": "frontend/src/board.tsx"}},
    ]}},
    {"type": "user", "message": {"role": "user", "content": [
        {"type": "tool_result", "content": "ok"}]}},
    {"type": "user", "message": {"role": "user", "content": "make the podium taller"}},
)


def test_hook_file_exists():
    assert HOOK.exists(), f"hook script missing at {HOOK}"


def test_collect_modified_files_finds_edit_write_paths():
    mod = _load()
    files = mod.collect_modified_files(SAMPLE)
    assert "frontend/src/board.tsx" in files
    # Read targets are not "modified"
    assert "frontend/src/app/x/page.tsx" not in files


def test_parse_transcript_tail_keeps_real_user_prose_and_tools():
    mod = _load()
    tail = mod.parse_transcript_tail(SAMPLE, max_turns=10)
    joined = "\n".join(tail)
    assert "redesign the leaderboard" in joined
    assert "make the podium taller" in joined
    assert "Edit" in joined  # tool activity surfaced
    # injected tool_result payloads are not user prose
    assert "\"tool_result\"" not in joined


def test_build_snapshot_has_labelled_sections_and_is_non_empty():
    mod = _load()
    payload = {"session_id": "abc123", "hook_event_name": "PreCompact", "trigger": "auto"}
    git = {"branch": "main", "status": " M frontend/src/board.tsx", "recent": "abc feat: x"}
    out = mod.build_snapshot(payload, SAMPLE, git)
    assert out.strip()
    # honest labelling: must say it is a mechanical/auto snapshot, not a full handoff
    assert "auto" in out.lower() and "handoff" in out.lower()
    assert "main" in out                      # git branch surfaced
    assert "frontend/src/board.tsx" in out    # modified file surfaced
    assert "make the podium taller" in out    # recent intent surfaced


def test_build_snapshot_never_raises_on_garbage_input():
    mod = _load()
    # transcript that is not valid jsonl, missing git keys — must degrade gracefully
    out = mod.build_snapshot({}, "not json\n{bad", {})
    assert isinstance(out, str) and out.strip()
