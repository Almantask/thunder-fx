#!/usr/bin/env python3
"""Record shipped-app edits that stale thunder-fx.exe.

Cursor/Antigravity call this as an afterFileEdit hook; Claude Code calls it as a
PostToolUse hook. The two payloads differ only in where the path lives.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from exe_paths import is_exe_relevant


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()
    time.sleep(0.05)


def main() -> int:
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        emit({})
        return 0

    tool_input = data.get("tool_input") or {}
    file_path = data.get("file_path") or tool_input.get("file_path") or ""
    root = Path.cwd().resolve()
    try:
        rel = Path(file_path).resolve().relative_to(root).as_posix()
    except (OSError, ValueError):
        emit({})
        return 0

    if not is_exe_relevant(rel):
        emit({})
        return 0

    state_dir = root / ".cursor" / "hooks" / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    stamp = state_dir / "exe-dirty.txt"
    existing = stamp.read_text(encoding="utf-8") if stamp.exists() else ""
    lines = [line for line in existing.splitlines() if line.strip()]
    if rel not in lines:
        lines.append(rel)
        stamp.write_text("\n".join(lines) + "\n", encoding="utf-8")

    emit({})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
