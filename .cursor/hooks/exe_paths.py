"""Shared helpers for Thunder FX desktop-exe dirty tracking."""

from __future__ import annotations

from pathlib import Path

FRONTEND_CONFIG = {
    "package.json",
    "package-lock.json",
    "index.html",
    "vite.config.ts",
    "vite.config.js",
    "components.json",
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
}

SKIP_DIR_PARTS = {
    "target",
    "gen",
    ".venv",
    ".hf-cache",
    "__pycache__",
    "node_modules",
    "dist",
}


def is_exe_relevant(relative_posix: str) -> bool:
    rel = relative_posix.replace("\\", "/").lstrip("./")
    if not rel:
        return False

    name = Path(rel).name.lower()
    if name.endswith(".test.ts") or name.endswith(".test.tsx"):
        return False
    if name.endswith(".spec.ts") or name.endswith(".spec.tsx"):
        return False
    if name.startswith("test_") and name.endswith(".py"):
        return False

    parts = Path(rel).parts
    if any(part in SKIP_DIR_PARTS for part in parts):
        return False

    top = parts[0] if parts else ""
    if top == "src":
        return True
    if top == "src-tauri":
        return True
    if top == "engine":
        return True
    if len(parts) == 1 and parts[0] in FRONTEND_CONFIG:
        return True
    if rel in FRONTEND_CONFIG:
        return True
    return False
