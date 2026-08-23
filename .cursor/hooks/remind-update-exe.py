#!/usr/bin/env python3
"""stop: if shipped app files changed, make the agent rebuild the desktop exe."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

FOLLOWUP = (
    "Shipped app files changed this request and E:\\thunder-fx-engine\\thunder-fx.exe "
    "was not updated. Read and follow .cursor/skills/update-desktop-exe/SKILL.md now: "
    "run the rebuild script, then stop. Do not skip."
)


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

    if sys.platform != "win32":
        emit({})
        return 0
    if not Path("E:/thunder-fx-engine").exists():
        emit({})
        return 0
    if data.get("status") != "completed":
        emit({})
        return 0
    if int(data.get("loop_count") or 0) > 0:
        emit({})
        return 0

    stamp = Path.cwd() / ".cursor" / "hooks" / "state" / "exe-dirty.txt"
    if not stamp.exists() or stamp.stat().st_size == 0:
        emit({})
        return 0

    emit({"followup_message": FOLLOWUP})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
