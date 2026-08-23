# Release notes

All notable Thunder FX changes are listed here.

## 0.3.0 — 2026-08-23

### Added

- **Instrumental** generate mode beside Sound effects. Same local Medium engine; music prompts use `TrackType: Music`, music shortcuts, a 20s default duration, and a vocals/speech negative prompt.
- Music clips embed named instruments in the WAVE file (RIFF INFO `IKEY` / `ICMT`) and show them in the library.
- Library empty state shows music starters when Instrumental is selected. Saved clips are tagged SFX or Music.
- **Prompt catalog** on Generate loads the shipped `prompts/` markdown pack. Add effects or a whole category to a queue, then **Generate queue** to create them in order. **Use** fills the current prompt without queueing.

### Changed

- Duration can go to 380 seconds, the Stable Audio 3 Medium maximum (6m 20s).
- Generate no longer loads Medium. After an app restart, click **Load model** once, then Generate only runs the clip.

## 0.2.0 — 2026-08-23

The app is now three tabs: **Library**, **Generate**, and **Settings**. Hover any control for a short explanation.

### Added

- **Library** tab for saved sounds (search, starter prompts, delete). Opening a clip or starter loads it in Generate.
- **Generate** tab for generate, waveform, preview, trim, and WAV/OGG export.
- **Settings** tab for:
  - generated-sounds folder (desktop Generate writes WAV files here; default `%LOCALAPPDATA%\thunder-fx\library`)
  - default export folder
  - Hugging Face token and default duration
  - error log (newest first, Refresh, Reveal file)
- Hover tooltips on studio, setup, and Settings controls.
- Setup **Show full token instructions** (account, Stability and Gemma licenses, Read token).
- Persistent error log at `%LOCALAPPDATA%\thunder-fx\logs\error.log` (generate, sidecar, and client failures). Ctrl+K **Error log** opens Settings.
- Command palette entries for Library, Generate, and Settings.

### Fixed

- Generated WAV output is 16-bit stereo PCM at 44.1 kHz so the waveform can parse it. NumPy/tensor scalars no longer crash the sidecar as “0-dimensional arrays”.
- CUDA out-of-memory retries with chunked decode; the first OOM is logged.
- First generate and setup download no longer freeze the app. Sidecar waits run off the UI thread, Generate shows a live loading bar, and the waveform clock keeps ticking while Medium loads.

### Changed

- The old settings sheet and titlebar Keep / Logs buttons are gone. Settings is the tab for folders, token, and logs.
- UI and README use plain language (Generate, Cancel, Library, Prompt, Setup). Fantasy terms are no longer shown in the app.

### Notes

- Rebuild the desktop app (`npm run tauri:dev` or a new installer) to pick up UI tabs and the `library_path` / `read_error_log` commands. `engine/worker.py` generate and file-log fixes apply on sidecar restart when the exe uses the repo worker.
- Browser `npm run dev` still stores library clips in IndexedDB and uses the mock engine.
