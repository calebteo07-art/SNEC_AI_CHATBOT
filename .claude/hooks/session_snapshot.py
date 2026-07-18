"""PreCompact hook: write a mechanical "breadcrumb" before Claude Code compacts.

Why: the 2026-07-18 friction audit found 27 sessions were *born from a dead one*
("SESSION RESUME — restore the black box") and 30 more hit mid-session compaction.
When a session dies at the context limit without anyone running `/handoff`, the
resume starts from nothing.

This hook can't reproduce a real `/handoff` — that snapshot (NEXT ACTION, DECISIONS,
OPEN QUESTIONS) lives in the model's head, and a shell hook has no access to it. What
it CAN do is drop a mechanical breadcrumb: git state + the files touched this session
+ the tail of the conversation. Better than a black box; honestly labelled as partial.

Contract: reads hook JSON on stdin (session_id, transcript_path, cwd, trigger).
ALWAYS exits 0 — a snapshot hook must never block a compaction or wedge a session
(same fail-open rule as bash_guard.py). Writes `.session-handoff-auto.md` at the repo
root; never overwrites the human `/handoff` file `.session-handoff.md`.
"""
import json
import os
import subprocess
import sys

WRAPPER_PREFIXES = (
    "<task-notification", "<system-reminder", "<command-name", "<command-message",
    "<local-command", "<user-memory", "Base directory for this skill",
    "This session is being continued", "Caveat:", "<post-tool", "<additional-context",
)


def _prose(content):
    """Real human/assistant text from a message.content (str or block list)."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return "\n".join(
            b.get("text", "") for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        ).strip()
    return ""


def _is_wrapper(text):
    return any(text.startswith(p) for p in WRAPPER_PREFIXES)


def collect_modified_files(transcript_text):
    """Distinct file_path targets of Edit/Write tool calls, in first-seen order."""
    seen = []
    for line in transcript_text.splitlines():
        try:
            o = json.loads(line)
        except Exception:
            continue
        msg = o.get("message")
        if not isinstance(msg, dict):
            continue
        c = msg.get("content")
        if not isinstance(c, list):
            continue
        for b in c:
            if not isinstance(b, dict) or b.get("type") != "tool_use":
                continue
            if b.get("name") in ("Edit", "Write", "NotebookEdit"):
                p = (b.get("input") or {}).get("file_path")
                if p and p not in seen:
                    seen.append(p)
    return seen


def parse_transcript_tail(transcript_text, max_turns=12):
    """Compact tail: real user prose + assistant intent/tool activity, oldest→newest."""
    events = []
    for line in transcript_text.splitlines():
        try:
            o = json.loads(line)
        except Exception:
            continue
        t = o.get("type")
        msg = o.get("message")
        if not isinstance(msg, dict):
            continue
        c = msg.get("content")
        if t == "user":
            text = _prose(c)
            if text and not _is_wrapper(text) and not text.startswith("[Request interrupted"):
                events.append("USER: " + text[:280])
        elif t == "assistant":
            text = _prose(c)
            tools = []
            if isinstance(c, list):
                for b in c:
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        tools.append(b.get("name"))
            parts = []
            if text:
                parts.append(text[:180])
            if tools:
                parts.append("[" + ", ".join(tools[:8]) + "]")
            if parts:
                events.append("ASSISTANT: " + " ".join(parts))
    return events[-max_turns:]


def build_snapshot(payload, transcript_text, git_info):
    """Assemble the breadcrumb markdown. Pure + defensive: never raises."""
    try:
        payload = payload or {}
        git_info = git_info or {}
        trigger = payload.get("trigger", "unknown")
        sid = payload.get("session_id", "unknown")
        modified = collect_modified_files(transcript_text or "")
        tail = parse_transcript_tail(transcript_text or "")

        lines = [
            "# SESSION AUTO-SNAPSHOT (mechanical breadcrumb)",
            "",
            "> ⚠ This is an **auto** snapshot written by the PreCompact hook — NOT a full "
            "`/handoff`. It has git state, touched files, and the conversation tail, but "
            "**no semantic context** (next action, decisions, open questions). If a richer "
            "handoff exists, prefer `.session-handoff.md`. To resume: read this, then "
            "re-read the key files before editing.",
            "",
            f"- trigger: `{trigger}`  ·  session: `{sid}`",
            f"- git branch: `{git_info.get('branch', '?')}`",
            "",
            "## Uncommitted changes (git status)",
            "```",
            (git_info.get("status") or "(clean or unavailable)").strip() or "(clean)",
            "```",
            "",
            "## Recent commits",
            "```",
            (git_info.get("recent") or "(unavailable)").strip(),
            "```",
            "",
            "## Files edited this session",
        ]
        lines += [f"- `{p}`" for p in modified] or ["- (none recorded)"]
        lines += ["", "## Conversation tail (most recent last)"]
        lines += [f"- {e}" for e in tail] or ["- (none recorded)"]
        lines.append("")
        return "\n".join(lines)
    except Exception:
        # Absolute last resort — a snapshot hook must always yield *something*.
        return "# SESSION AUTO-SNAPSHOT\n\n(auto handoff snapshot; content unavailable)\n"


def _git(args, cwd):
    try:
        return subprocess.run(
            ["git", *args], cwd=cwd, capture_output=True, text=True, timeout=8
        ).stdout.strip()
    except Exception:
        return ""


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    root = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()

    transcript_text = ""
    tp = payload.get("transcript_path")
    if tp and os.path.isfile(tp):
        try:
            with open(tp, encoding="utf-8", errors="replace") as fh:
                transcript_text = fh.read()
        except Exception:
            transcript_text = ""

    git_info = {
        "branch": _git(["rev-parse", "--abbrev-ref", "HEAD"], root),
        "status": _git(["status", "--porcelain"], root),
        "recent": _git(["log", "-5", "--format=%h %s"], root),
    }

    try:
        out = build_snapshot(payload, transcript_text, git_info)
        with open(os.path.join(root, ".session-handoff-auto.md"), "w", encoding="utf-8") as fh:
            fh.write(out)
    except Exception:
        pass  # fail open: never block a compaction

    return 0


if __name__ == "__main__":
    sys.exit(main())
