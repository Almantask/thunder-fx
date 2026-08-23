---
name: update-desktop-exe
description: Rebuilds the Thunder FX Windows desktop exe and NSIS installer onto E:\thunder-fx-engine after shipped app changes. Use when completing a request that changed src, src-tauri, engine, or frontend config, or when the user asks to update, recreate, or rebuild thunder-fx.exe or the desktop installer.
---

# Update desktop exe

Last step of any request that changed the shipped app: rebuild and copy `E:\thunder-fx-engine\thunder-fx.exe` **before** the final reply.

## Skip

- No writes under `src/`, `src-tauri/` (except `target/` / `gen/`), `engine/` (except `.venv`, `.hf-cache`, `__pycache__`), or frontend config (`package.json`, `package-lock.json`, `index.html`, `vite.config.*`, `components.json`, `tsconfig*.json`)
- Test-only files (`*.test.*`, `*.spec.*`, `test_*.py`)
- Ask mode, or the user said not to rebuild
- Not Windows, or `E:\thunder-fx-engine` is missing — say so and stop

## Rebuild

From the repo root (several minutes; `block_until_ms` at least `600000`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .cursor/skills/update-desktop-exe/scripts/rebuild-desktop-exe.ps1
```

The script sets `CARGO_TARGET_DIR` to `E:\thunder-fx-engine\cargo-target`, runs `npm run tauri:build`, copies `thunder-fx.exe` and the NSIS installer into `E:\thunder-fx-engine`, refreshes bundled `engine/worker.py`, and clears the dirty stamp.

If the copy fails because the app is open, it stops `thunder-fx` processes locking those exe paths.

## After

Tell the user the exe path and installer path, and that they should relaunch Thunder FX. Do not treat `npm run tauri:dev` or the browser Vite server as an updated exe.
