# Release notes

All notable Thunder FX changes are listed here.

## Unreleased

### Added

- **Library triage.** A generated library outgrew what could be found in it: a queue run and
  "Generate 4 takes" produce far more audio than anyone can name or sort. Clips now carry
  **favourites, a 0-5 rating, free-text tags and a reject flag**, with a filter bar for
  favourites, a rating floor and tag combinations. A reject is hidden rather than deleted, and
  favourite and reject clear each other because they are opposite verdicts on the same clip.
- **Rename a clip**, which renames the WAV on disk as well — so the name given in the library is
  the name it exports under. A clip's id *is* its file stem, so its metadata row moves with the
  rename rather than being orphaned by it.
- **Trash, with undo.** Deleting moves the WAV into `<library>/.trash` and offers an immediate
  Undo; a Trash view restores or purges, and entries older than 30 days are cleared on their own.
  A library clip can be several minutes of GPU time, and delete used to destroy the file outright.
  The library scanners now skip dot-directories so a trashed clip cannot be rescanned back in.
- **Level-matched A/B compare.** Pick two clips and switch between them at the same moment in
  each, with their RMS matched by default — without that, the louder take wins regardless of
  which is better.
- **Shape: post-generation editing that costs no GPU time.** Equal-power fade in and out,
  reverse, gain, peak normalize to −1 dBFS, and a resampling pitch shift. Edits apply to the
  working clip immediately, so playback and export follow them, with Undo stepping back through
  the stack and Save writing them into the library file.
- **Pitch variants.** Save several re-pitched copies of a clip in one click — the standard way to
  stop a repeated footstep or impact sounding machine-gunned, and it needs no GPU time at all.
- **Update channel.** `tauri-plugin-updater` ships in the app, a tagged release builds and signs
  an installer through `.github/workflows/release.yml`, and Settings shows the running version
  with a Check for updates button. A local build has no update channel and says so plainly rather
  than reporting an error.
- `npm run version:check` fails when `package.json`, `tauri.conf.json`, `Cargo.toml` and the
  newest CHANGELOG release disagree, and it runs in CI. `npm run version:set <version>` is the
  only sanctioned way to bump. The manifests were on **0.2.0 while this file was on 0.4.0**, so
  every installer and exe built from them was labelled two minor versions behind.

### Fixed

- **A decimal could not be typed into the Shape number fields.** The controlled inputs re-parsed
  on every keystroke, so "0.5" passed through "0." — which `Number` reads as 0 — and the dot was
  discarded, landing the next digit as "05". Sub-second fades were unreachable. The fields keep
  their draft text and clamp on blur instead.
- **Peak normalize was capped by the manual gain range.** It went through the ±24 dB gain
  control, so a clip more than 24 dB down came back still quiet, with nothing saying why.

- **Quality presets — Max speed, Balanced, Max quality.** Steps were never the quality dial on
  this model: Medium is ARC-distilled and sampled with `pingpong`, which re-injects fresh noise on
  every step, so a higher step count buys invented detail rather than fidelity. A preset now
  chooses the *checkpoint* instead, and is tuned per content type. Max quality runs the
  un-distilled `medium-base` with the deterministic `euler` sampler — the only configuration
  where extra steps converge and where negative prompts do anything at all — at CFG 4 for sound
  effects and CFG 2 for ambience, because more guidance sharpens a one-shot and dulls a bed.
  Instrumental keeps Balanced: sweeping CFG 1/2/4/7, `medium-base` measured darker and less
  varied at every setting, so the preset does not pretend otherwise. A deterministic sampler is never allowed on Medium:
  distillation trains the model *for* pingpong's per-step re-noising, so stepping through it
  deterministically averages the texture away and sounds muffled, flat and uniform. On Medium
  alone, Balanced is the ceiling. Set the default in
  **Settings → Default quality**, override it per clip on Generate, and force a whole queue run
  with **Run queue at**; queued items otherwise keep the preset they were added with.
- **Medium-Base download** in Settings (~9 GB; shares Medium's text encoder, so Medium must be
  installed first). Until it is installed,
  the Max quality button reads "needs download", Generate is disabled with the reason shown, and
  the engine refuses the request with advice — it never substitutes another configuration. There
  is no fallback anywhere in the preset system by design: an earlier version substituted a
  deterministic sampler on Medium, which sounds muffled and flat, and the substitution is exactly
  what made that hard to trace. `THUNDER_FX_BASE_MODEL_READY=0` forces the state for testing.
- **Two guards against a "higher quality" setting that sounds worse.**
  `engine/test_quality.py` asserts no preset — including Custom, and including an explicit
  sampler override over IPC — can put a deterministic sampler on the distilled checkpoint.
  `engine/test_generation_quality.py` generates at each preset on the GPU and fails if a higher
  preset loses dynamics, brightness or variety, using the measures in `engine/audio_metrics.py`
  (crest factor, block-level spread, spectral centroid, high-band share, spectral flux).
- **Per-mode loudness.** Sound effects peak-normalize to −1.0 dBFS in both directions; ambience
  targets −20 LUFS and instrumental −18 LUFS, both peak-limited to −1.0 dBFS. Loudness uses a full
  ITU-R BS.1770-4 implementation verified against the EBU Tech 3341 reference tone. Near-silent
  clips are left alone instead of being amplified into noise.
- **TPDF dither** on the 16-bit master, applied without disturbing true digital silence.
- `scripts/bench_sampler.py` sweeps sampler × steps × content type into `bench/`, with objective
  metrics and a blind A/B player, so the preset table can be settled by ear and by measurement.
- `scripts/rewrite_prompts.py` normalises the shipped catalog to the trained prompt format.
- **Default audio format** in Settings. The export panel and the sound-pack dialog start on the
  chosen format instead of always on WAV, and the Export button names it. Generation still masters
  to WAV; the default is the format that master is written out as. In the browser build, a
  compressed default falls back to WAV.
- **Opus and AIFF exports**, bringing the format list to WAV, AIFF, FLAC, Opus, OGG Vorbis, and
  MP3 320. **Opus is the new default** — transparent quality at roughly a third of an MP3 320 file.
  Opus is always written at 48 kHz, the only rate near CD quality the codec defines.
- MP3 falls back to libsndfile's own encoder when neither torchaudio nor ffmpeg is available,
  instead of failing the export.

### Fixed

- **Long clips were silently capped at 120 seconds.** The worker never passed `sample_size` to
  `model.generate`, so Stable Audio 3's own 5292032-sample default (120.0s) clamped every longer
  request — while the model was still conditioned on the full `seconds_total` and paced an
  arrangement it never got to finish. A 380s ambience bed returned 120s of audio. Most of the
  shipped ambience and instrumental catalog runs 90–380s, so most of it was affected.
- **Negative prompts are no longer silently ignored.** The model's CFG branch only runs when
  `cfg_scale != 1.0`, and the worker pinned CFG to 1, so every negative prompt in the app and all
  ~18,000 in the catalog did nothing. They now work on Max quality, and the field is marked
  inactive on the presets where they cannot.
- **Quiet clips are no longer left quiet.** Peak normalization only ever attenuated, so takes of
  the same sound landed as much as 12 dB apart.
- **Cancel really does stop the GPU.** The per-step hook was chosen by probing `generate`'s
  signature for a callback parameter it does not declare — the probe always came up empty, so
  cancellation only took effect once the run had finished. `callback` is now passed straight
  through to the sampler, where it was accepted all along.
- **The loop crossfade no longer clips.** It ran *after* peak normalization, so an equal-power sum
  of two correlated windows could push the file back over the ceiling. Crossfade now happens
  before mastering, and joins snap to the nearest zero crossing as the browser build already did.
- **Export resampling no longer aliases.** 44.1 → 48 kHz used bare linear interpolation with no
  anti-alias filter (`soxr` is not installed, so that path was always the fallback), and the
  frontend resampled a second time before handing the file over. Resampling now happens once,
  through torchaudio's windowed-sinc resampler.
- **Precision defaults to FP16**, matching the worker, the Stable Audio library and the README.
  FP32 also disabled chunked decode, roughly doubling peak VRAM for anyone who never changed it.
- Prompts are normalised to the format Stable Audio 3 was trained on before they reach the model:
  `TrackType:` / `VocalType:` control tags, a trailing `BPM:` for music, and a `Length: N seconds`
  tag re-derived from the duration actually chosen. `VocalType: Instrumental` is a positive control
  tag, so it suppresses vocals at CFG 1 where the negative prompt cannot. Prompts past 45 words —
  the threshold Stability's own rewriter enforces — now raise a non-blocking warning.
- The shipped catalog (~18,000 prompts across 227 files) was rewritten into that same format.
- **The engine restarts itself.** A crashed Python worker previously bricked the session until the
  app was relaunched; every command now checks the worker is alive and respawns it if not.
- **Generation no longer times out on long clips.** The 600s cap could fire on a legitimate long,
  high-step run — reporting a failure while the worker went on to write the clip. The budget now
  scales with `seconds × steps`.
- **Unload is refused during a generation** rather than reporting freed VRAM the running job still
  holds.
- Seamless-loop crossfades clamp to the 16-bit range; an equal-power sum of two loud samples could
  overflow and abort the write.
- Opening a clip the parser cannot decode shows an error instead of failing silently.
- An unexpected render error now shows a recovery screen instead of a blank window.
- Time estimates account for quality steps, so switching between Draft and Hi-Fi no longer skews
  every prediction.

### Changed

- **Audio no longer round-trips through base64.** Clips move over the IPC boundary as raw bytes,
  and the redundant read-modify-write tagging pass after each generation is gone — the worker
  already embeds the same RIFF INFO tags.
- **Queues no longer rescan the library after every clip.** A full scan parses every WAV on disk;
  new clips are now spliced into the list, and full scans happen on entering the Library tab.
- File access is confined to the library, temp, and log folders, plus folders the user picks in a
  native dialog. Save and folder pickers moved to Rust so a picked folder is what grants access.
- A content security policy is enforced, and the broad `reveal-item-in-dir` permission is gone.
- Instrument names have a single source (`src/lib/instruments.ts`); the duplicate ~200-entry table
  in the worker was removed.

## 0.4.0 — 2026-08-27

### Added

- **Pro export:** 48 kHz and 24-bit WAV, mono downmix, FLAC, and MP3 320 kbps (desktop) beside OGG.
- **Auto-trim silence** snaps In/Out to onset and decay with a short safety pad.
- **Seamless loop** equal-power crossfade (0.5–3s) with a loop preview before export.
- **Library packs:** multi-select clips, naming templates, ZIP archive, and optional `manifest.json`.
- **Generate 4 takes** runs four random seeds and a keep/discard grid.
- **VRAM badge** in the titlebar (used / total, GPU name, temperature when available). Warns above 85%.
- **Precision:** Settings FP32 (default) or FP16/BF16 low-VRAM. Unload then Load model to apply. Long FP16 runs use chunked decode.

## 0.3.0 — 2026-08-23

### Added

- **Instrumental** generate mode beside Sound effects. Same local Medium engine; music prompts use `TrackType: Music`, a 20s default duration, and a vocals/speech negative prompt.
- Music clips embed named instruments in the WAVE file (RIFF INFO `IKEY` / `ICMT`) and show them in the library.
- Library empty state shows music starters when Instrumental is selected. Saved clips are tagged SFX or Music.
- **Browse prompts** on Generate loads the shipped markdown. Filter **FX** (`prompts/fx`) or **Ambience** (`prompts/ambience`). **Preview** shows the full prompt text. **Use** fills the current prompt without queueing. Add items or a whole category to a queue, then **Generate queue**.
- Load, generate, and queue actions show a `~m:ss` estimate from past runs on this machine. While a load or generate is in progress, the waveform clock adds estimated remaining time.

### Changed

- Duration can go to 380 seconds, the Stable Audio 3 Medium maximum (6m 20s).
- Ambience catalog cues use varying lengths (about 40–380s) instead of a fixed 20s/30s, including takes at the Medium maximum.
- Generate no longer loads Medium. After an app restart, click **Load model** once, then Generate only runs the clip.
- When the model is loading, **Load model** changes to a **Cancel** button so putting Medium into VRAM can be cancelled at any time.
- After the model is loaded, an **Unload model** button allows freeing GPU memory/VRAM at any time.
- Phrase chips that appended text to the prompt are gone. **Browse prompts** and **Generate queue** are large primary buttons.
- Hover hints wait longer, do not chain instantly between nearby controls, and no longer steal clicks from buttons they overlap.
- Library cards show a short prompt name. The full prompt appears in Generate after you open the clip.

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
