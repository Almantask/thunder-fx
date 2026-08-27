# Thunder FX — Feature Backlog

This backlog tracks prioritized product enhancements, architectural updates, and technical specifications for upcoming releases of **Thunder FX**.

---

## Priority Summary

| ID | Feature | Category | Target Audience | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BF-01** | [Multi-Sample Rate & Pro Audio Export Options](#bf-01-multi-sample-rate--pro-audio-export-options) | Export & DAW | Game Devs, Sound Designers | High | Implemented |
| **BF-02** | [Batch Asset Renaming, Exporting & Sound Pack Zipping](#bf-02-batch-asset-renaming-exporting--sound-pack-zipping) | Library & Pipeline | Game Devs, Creators | High | Implemented |
| **BF-03** | [Auto-Silence Detection & Instant Tight-Trim](#bf-03-auto-silence-detection--instant-tight-trim) | Waveform & Editing | All Users | High | Implemented |
| **BF-04** | [Seamless Looper & Crossfade Engine](#bf-04-seamless-looper--crossfade-engine) | Ambience & Audio | Game Devs, Tabletop DMs | High | Implemented |
| **BF-05** | [Multi-Take / Variation Grid ("Generate 4 Takes")](#bf-05-multi-take--variation-grid-generate-4-takes) | Generative Engine | Creators, Power Users | High | Implemented |
| **BF-06** | [Precision VRAM Monitor in Titlebar](#bf-06-precision-vram-monitor-in-titlebar) | Hardware & Telemetry | All GPU Users | Medium | Implemented |
| **BF-07** | [Half-Precision (fp16 / bf16) & Low-VRAM Generation Profiles](#bf-07-half-precision-fp16--bf16--low-vram-generation-profiles) | Inference & Engine | 4GB–6GB GPU Users | Medium | Implemented |

---

## Feature Specifications

### BF-01: Multi-Sample Rate & Pro Audio Export Options

* **Description:** Expand the audio export pipeline beyond the current 44.1 kHz 16-bit WAV / OGG Vorbis baseline to support broadcast and game-engine standards.
* **Scope:**
  * **48 kHz / 24-bit PCM WAV:** Industry standard for Unreal Engine, Unity, and video editors (Premiere, DaVinci).
  * **FLAC (Lossless Compressed):** Space-efficient studio master archival format.
  * **MP3 (320 kbps CBR):** Lightweight distribution format for web and mobile game targets.
  * **Mono Downmix Toggle:** Single-channel export option required for 3D positional audio emitters in game engines.
* **Why It Matters:** Eliminates external DAW transcoding steps for developers importing assets directly into game engines.
* **Technical Touchpoints:**
  * [`src/components/Altar.tsx`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/components/Altar.tsx): Expand the export format dropdown and add sample rate/channel selectors.
  * [`src-tauri/src/lib.rs`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src-tauri/src/lib.rs): Add sample rate conversion and 24-bit encoding in `hound` / audio export commands.
  * [`engine/worker.py`](file:///c:/Users/ITWORK/source/repos/thunder-fx/engine/worker.py): Extend `soundfile` / `soxr` routines for FLAC, MP3, and sample rate resampling.

---

### BF-02: Batch Asset Renaming, Exporting & Sound Pack Zipping

* **Description:** Allow multi-selection of library tracks to export them as structured directories or ZIP bundles adhering to game asset naming conventions.
* **Scope:**
  * **Batch Selection Mode:** Multi-select checkboxes or range select in the Library tab.
  * **Prefix & Template Naming:** Custom naming masks such as `[TYPE]_[CATEGORY]_[NAME]_[INDEX].[EXT]` (e.g., `SFX_Combat_Sword_01.wav`, `MUS_Tavern_Loop_01.ogg`).
  * **Zip Archiving:** Generate a single `.zip` sound pack containing all selected audio files and an optional `manifest.json` metadata index.
* **Why It Matters:** Enables rapid asset delivery when producing thematic sound packs for game releases or tabletop modules.
* **Technical Touchpoints:**
  * [`src/components/GrimoireRail.tsx`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/components/GrimoireRail.tsx): Multi-select UI toolbar, batch action drawer.
  * [`src-tauri/src/lib.rs`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src-tauri/src/lib.rs): Native ZIP packaging command using `zip-rs`.

---

### BF-03: Auto-Silence Detection & Instant Tight-Trim

* **Description:** Single-click **"Auto-Trim Silence"** button that analyzes the decoded PCM waveform buffer and snaps the In/Out markers to audio onset/offset boundaries.
* **Scope:**
  * **Onset Energy Detection:** Detects when audio energy rises above a configurable threshold (e.g., -42 dB) to skip initial diffusion pre-roll silence (typically 50–200ms).
  * **Offset Decay Detection:** Detects trailing noise floor/reverb decay cutoff to prevent unnecessary trailing silence.
  * **Safety Margin:** Preserves a 20–40ms pre-transient headroom and tail fade to eliminate audio pops.
* **Why It Matters:** One-shot sound effects (gunshots, sword swings, UI clicks) require immediate sample triggering without manual dragging of trim handles on every clip.
* **Technical Touchpoints:**
  * [`src/lib/wav.ts`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/lib/wav.ts): Implement RMS / Peak amplitude scanning algorithm.
  * [`src/components/ScrollCanvas.tsx`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/components/ScrollCanvas.tsx) & [`src/components/Altar.tsx`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/components/Altar.tsx): Add one-click "Auto-Trim" action button.

---

### BF-04: Seamless Looper & Crossfade Engine

* **Description:** Dedicated looping engine for background music and environmental beds that blends the tail of an audio clip back into its head.
* **Scope:**
  * **Configurable Crossfade Window:** 0.5s to 3.0s equal-power crossfade between the end and beginning of the clip.
  * **Zero-Crossing Alignment:** Snaps crossfade points to audio zero-crossings to eliminate phase cancellation clicks.
  * **Seamless Waveform Loop Preview:** Dedicated loop preview button verifying gapless playback before export.
* **Why It Matters:** Environmental audio beds (taverns, rain, dungeons) and background music must loop continuously during games without audible seams.
* **Technical Touchpoints:**
  * [`src/lib/wav.ts`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/lib/wav.ts): Implement equal-power crossfade audio buffer transformation.
  * [`src/components/Altar.tsx`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/components/Altar.tsx): Add "Generate Seamless Loop" toggle to trim and export controls.

---

### BF-05: Multi-Take / Variation Grid ("Generate 4 Takes")

* **Description:** An audition generation mode that runs 3–4 variations of the prompt across distinct random seeds and renders them into an interactive comparison grid.
* **Scope:**
  * **Quad-Take Generation:** Automatically submits 4 variations with randomized seeds.
  * **Interactive Audition Tiles:** 2x2 or 1x4 playback tiles with mini-waveforms, single-click solo playback, and "Keep" / "Discard" actions.
  * **Favorite / Save Selected:** Automatically adds chosen take(s) to the Library and discards unselected buffer files.
* **Why It Matters:** Generative diffusion models are stochastic; generating multiple takes in a batch mirrors standard creator workflows (Midjourney, ElevenLabs) and increases hit rates.
* **Technical Touchpoints:**
  * [`src/components/IncantationConsole.tsx`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/components/IncantationConsole.tsx): Add "Generate 4 Takes" alternate trigger button.
  * [`src/components/Studio.tsx`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/components/Studio.tsx): Multi-take queue state and preview grid modal/overlay.

---

### BF-06: Precision VRAM Monitor in Titlebar

* **Description:** Real-time GPU VRAM telemetry display integrated directly into the application titlebar.
* **Scope:**
  * **Live Memory Metrics:** Shows currently used VRAM vs. total device capacity (e.g., `VRAM: 4.8 / 8.0 GB (60%)`).
  * **GPU Thermals & Model Status:** Tooltip with active GPU device name, temperature (°C), and loaded model footprint.
  * **OOM Warning Indicator:** Highlights amber/red when VRAM pressure exceeds 85% to warn users before initiating long generations.
* **Why It Matters:** Stable Audio 3 Medium VRAM demands scale with clip duration. Real-time telemetry prevents unexpected CUDA Out-of-Memory crashes.
* **Technical Touchpoints:**
  * [`engine/worker.py`](file:///c:/Users/ITWORK/source/repos/thunder-fx/engine/worker.py): Report `torch.cuda.memory_allocated()`, `torch.cuda.memory_reserved()`, and NVML stats in `cmd_status` / progress heartbeat.
  * [`src/components/Titlebar.tsx`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/components/Titlebar.tsx): Render live memory badge with tooltip metrics.

---

### BF-07: Half-Precision (fp16 / bf16) & Low-VRAM Generation Profiles

* **Description:** Provide a configurable precision profile in Settings allowing Stable Audio 3 to run in `float16` / `bfloat16` mode instead of full `float32`.
* **Scope:**
  * **Precision Mode Selector:** Toggle between `FP32 (Full Precision, Default)` and `FP16 / BF16 (Low VRAM Mode)`.
  * **VRAM Reduction:** Decreases model weight footprint in VRAM from ~5.5 GB to ~2.8 GB.
  * **Chunked Decode Fallback Safeguard:** Prevents CUDA OOM on 4GB and 6GB entry-level GPUs during 380-second generation runs.
* **Why It Matters:** Broadens hardware accessibility to users running NVIDIA RTX 3050/4050 mobile or GTX 1660 6GB cards without hardware upgrade requirements.
* **Technical Touchpoints:**
  * [`src/components/SettingsPanel.tsx`](file:///c:/Users/ITWORK/source/repos/thunder-fx/src/components/SettingsPanel.tsx): Add Precision Mode radio selector to settings.
  * [`engine/worker.py`](file:///c:/Users/ITWORK/source/repos/thunder-fx/engine/worker.py): Update `_try_load_model()` and `model.generate()` to accept `model_half=True` / `dtype=torch.float16`.
