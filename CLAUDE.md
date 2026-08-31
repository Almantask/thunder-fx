# Thunder FX — agent instructions

Shared agent config lives in `.cursor/`. `.agent`, `.agents`, and `.claude/skills` are
symlinks into it, so Cursor, Antigravity, and Claude Code run the same skills.

- `.cursor/skills/` — skills (also visible as `.claude/skills/`)
- `.cursor/rules/*.mdc` — Cursor-only rules; their content is mirrored below for Claude
- `.cursor/hooks/` — hook scripts, shared by Cursor (`.cursor/hooks.json`) and
  Claude Code (`.claude/settings.json`)

Edit the real files under `.cursor/`, never through a symlink alias.

## Update the desktop exe before finishing

When a request created or modified shipped app files, **update**
`E:\thunder-fx-engine\thunder-fx.exe` before the final reply. Do not leave the user on a
stale exe. `npm run tauri:dev` and the Vite browser app are not replacements.

Shipped paths: `src/`, `src-tauri/` (not `target/` or `gen/`), `engine/` (not `.venv`,
`.hf-cache`, or `__pycache__`), plus `package.json`, `package-lock.json`, `index.html`,
`vite.config.*`, `components.json`, and `tsconfig*.json`. Ignore test-only files
(`*.test.*`, `*.spec.*`, `test_*.py`).

1. Use the `update-desktop-exe` skill and run its rebuild script.
2. Skip only when no shipped files changed, the user forbade a rebuild, or the session
   cannot write files.
3. If the running app has the exe locked, stop those `thunder-fx` processes so the copy
   can succeed, then say the app was closed.
