# Release notes

All notable Thunder FX changes are listed here.

## 0.2.0 — 2026-08-23

The keep is now three tabs: **Library**, **Generate**, and **Settings**. Hover any control for a short explanation.

### Added

- **Library** tab for saved weaves (search, starter incantations, strike from the book). Opening a page or starter loads it in Generate.
- **Generate** tab for Cast, Scroll, Altar, trim, and WAV/OGG export.
- **Settings** tab for:
  - generated-sounds folder (desktop Casts write WAV files here; default `%LOCALAPPDATA%\thunder-fx\library`)
  - default export folder
  - Hugging Face token and default duration
  - error log (newest first, Refresh, Reveal file)
- Hover tooltips on studio, First Watch, and Settings controls.
- First Watch **Show full token instructions** (account, Stability and Gemma licenses, Read token).
- Persistent error log at `%LOCALAPPDATA%\thunder-fx\logs\error.log` (Cast, sidecar, and client failures). Ctrl+K **Error log** opens Settings.
- Command palette entries for Library, Generate, and Settings.

### Fixed

- Cast WAV output is 16-bit stereo PCM at 44.1 kHz so the Scroll can parse it. NumPy/tensor scalars no longer crash the sidecar as “0-dimensional arrays”.
- CUDA out-of-memory retries with chunked decode; the first OOM is logged.

### Changed

- The Keep sheet and titlebar Keep / Logs buttons are gone. Settings is the tab for folders, token, and logs.

### Notes

- Rebuild the desktop app (`npm run tauri:dev` or a new installer) to pick up UI tabs and the `library_path` / `read_error_log` commands. `engine/worker.py` Cast and file-log fixes apply on sidecar restart when the exe uses the repo worker.
- Browser `npm run dev` still stores Grimoire clips in IndexedDB and uses the mock weave.
