#!/usr/bin/env python3
"""Export the Selena avatar registry to a TypeScript mirror for the frontend.

The Python `AVATAR_AXES` in tools/avatar/parts.py is the SINGLE SOURCE OF TRUTH.
The frontend needs the same ids to build the sprite manifest + option pickers, so
this script renders a generated TS module. A parity test
(tests/avatar/test_axes_parity.py) fails if the checked-in file drifts from the
registry, so the two can never disagree.

Usage:
    python tools/avatar/export_axes.py           # write the TS file
    python tools/avatar/export_axes.py --check    # exit 1 if the file is stale
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.avatar.parts import AVATAR_AXES, DEFAULT_AVATAR, CONFIG_VERSION

TARGET = PROJECT_ROOT / "frontend" / "src" / "aurora" / "avatar" / "axes.generated.ts"


def render_ts() -> str:
    """Return the deterministic TypeScript source for the registry mirror."""
    lines: list[str] = [
        "// AUTO-GENERATED from tools/avatar/parts.py by tools/avatar/export_axes.py.",
        "// Do not edit by hand — run `python tools/avatar/export_axes.py` and commit.",
        "// Selena is Iris: a one-eyed mascot; these ids map to sprite parts (RICOE D9/D10).",
        "",
        f"export const CONFIG_VERSION = {CONFIG_VERSION} as const;",
        "",
        "export const AVATAR_AXES = {",
    ]
    for axis, options in AVATAR_AXES.items():
        lines.append(f"  {axis}: {json.dumps(options)},")
    lines.append("} as const;")
    lines.append("")
    lines.append("export type AvatarAxis = keyof typeof AVATAR_AXES;")
    lines.append("")
    lines.append("export const DEFAULT_AVATAR = {")
    for key, value in DEFAULT_AVATAR.items():
        rendered = value if isinstance(value, int) else json.dumps(value)
        lines.append(f"  {key}: {rendered},")
    lines.append("} as const;")
    lines.append("")
    lines.append("export type AvatarConfig = { version: number } & Record<AvatarAxis, string>;")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ts = render_ts()
    if "--check" in sys.argv:
        current = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
        if current != ts:
            print(f"[STALE] {TARGET} is out of date — run: python tools/avatar/export_axes.py")
            return 1
        print(f"[OK] {TARGET.name} matches the registry.")
        return 0
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(ts, encoding="utf-8")
    print(f"[WROTE] {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
