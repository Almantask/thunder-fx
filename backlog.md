# Thunder FX — Feature Backlog

Prioritized product enhancements, architectural updates, and technical specifications for
upcoming releases of **Thunder FX**.

Anything already delivered moves to [Shipped](#shipped) with the release it went out in, so
this table only ever lists work that has not happened yet. Release notes live in
[CHANGELOG.md](CHANGELOG.md).

---

## Priority Summary

| ID | Feature | Category | Target Audience | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BF-15** | [Loop-point metadata in exported audio](#bf-15-loop-point-metadata-in-exported-audio) | Delivery | Game Devs | High | Open |
| **BF-16** | [Durable overnight batch rendering](#bf-16-durable-overnight-batch-rendering) | Generative Engine | Creators, Power Users | High | Open |
| **BF-17** | [Drag a clip out of the app](#bf-17-drag-a-clip-out-of-the-app) | Delivery | Game Devs, Sound Designers | Medium | Open |
| **BF-18** | [Engine export presets](#bf-18-engine-export-presets) | Delivery | Game Devs | Medium | Open |
| **BF-19** | [Layer two clips into one asset](#bf-19-layer-two-clips-into-one-asset) | Waveform & Editing | Sound Designers | Medium | Open |
| **BF-20** | [Audio-to-audio continuation spike](#bf-20-audio-to-audio-continuation-spike) | Inference & Engine | All Users | Medium | Spike |
| **BF-21** | [Medium-Base download: resume and precheck](#bf-21-medium-base-download-resume-and-precheck) | Inference & Engine | Max Quality Users | Medium | Open |
| **BF-22** | [Idle model unload](#bf-22-idle-model-unload) | Hardware & Telemetry | All GPU Users | Low | Open |
| **BF-23** | [Headless CLI mode](#bf-23-headless-cli-mode) | Library & Pipeline | Game Devs | Low | Open |
| **BF-24** | [Scene player mode](#bf-24-scene-player-mode) | Product Direction | Tabletop DMs | Undecided | Proposal |

---

## Feature Specifications

### BF-15: Loop-point metadata in exported audio

* **Description:** Write the loop region into the exported file so a game engine loops it
  natively, instead of shipping a seamless loop the engine cannot tell is one.
* **Scope:**
  * **`smpl` chunk on WAV export** carrying one sustain loop over the trimmed region.
  * **OGG/Opus comment tags** (`LOOPSTART` / `LOOPLENGTH`), the convention Unity and Godot
    tooling reads.
  * Written only when the clip was generated or exported as a seamless loop, so a one-shot is
    never tagged as looping.
* **Why It Matters:** BF-04 already produces a genuinely seamless bed, but the loop points are
  thrown away at export, so every importer has to rediscover them by hand. This is the largest
  value-per-hour item left in the delivery path.
* **Technical Touchpoints:**
  * `src/lib/wav.ts`: emit a `smpl` chunk alongside the existing `LIST`/`INFO` writer.
  * `engine/worker.py`: pass loop tags through the FLAC/Opus/OGG encoders.
  * `src/components/Altar.tsx`: surface that the export will carry loop points.

---

### BF-16: Durable overnight batch rendering

* **Description:** Render a whole prompt-catalog category unattended, and survive a crash,
  a driver reset, or a reboot without losing the run.
* **Scope:**
  * **Persistent run state** on disk rather than in `localStorage`, recording which prompts
    are done, which failed, and with what settings.
  * **Resume on launch:** an interrupted run offers to continue where it stopped.
  * **Per-item failure isolation** so one CUDA OOM does not end a 400-clip night.
  * **Run report** listing what was produced, what failed, and why.
* **Why It Matters:** The shipped catalog is 134 files and roughly 8,000 cues. Rendering a full
  themed pack overnight is a headline capability, and the current queue cannot survive the
  interruptions a multi-hour run actually meets.
* **Technical Touchpoints:**
  * `src/lib/promptCatalog.ts`, `src/components/Studio.tsx`: move queue state to a durable store.
  * `engine/worker.py`: report a per-item failure without ending the session.

---

### BF-17: Drag a clip out of the app

* **Description:** Drag a library card straight into a game engine, DAW, or Explorer window.
* **Scope:** Native drag-out of the clip's WAV, and of a multi-selection as several files.
  Honours the default export format so the dragged file is the one the user wants.
* **Why It Matters:** The shortest possible path from generated to in-engine, and the step
  every other export route is a longer version of.
* **Technical Touchpoints:** `src-tauri/src/lib.rs` (drag-out via the webview's drag source),
  `src/components/GrimoireRail.tsx`.

---

### BF-18: Engine export presets

* **Description:** One-click export layouts matching what a given engine or middleware expects.
* **Scope:** Unity, Unreal, Godot and FMOD/Wwise presets covering folder structure, naming
  convention, sample rate, bit depth and channel count. Builds on the existing pack templates
  (BF-02) and loop points (BF-15).
* **Why It Matters:** Removes the manual reorganisation step between a sound pack and a project.
* **Technical Touchpoints:** `src/lib/packNaming.ts`, `src/components/GrimoireRail.tsx`.

---

### BF-19: Layer two clips into one asset

* **Description:** Mix two library clips into a new one — a sword swing over an impact, rain
  under thunder — with an offset and a level trim.
* **Scope:** Pick two clips, set the offset and the overlay level, preview, and save the result
  as a new library clip. Sum is peak-limited so a layered file never ships clipped.
* **Why It Matters:** Layering is how most one-shot sound design actually happens, and it costs
  no GPU time. The DSP already exists — `layerWavs` in `src/lib/audioEdit.ts` is implemented and
  tested; what is missing is the two-clip picker and preview UI.
* **Technical Touchpoints:** `src/lib/audioEdit.ts` (`layerWavs`, done), a new layering dialog,
  `src/components/Studio.tsx`.

---

### BF-20: Audio-to-audio continuation spike

* **Description:** Establish whether Stable Audio 3 supports init-audio, inpainting or
  continuation, and what it would take to expose.
* **Scope:** A read of `stable_audio_3` for an init-audio or masked-sampling path; if one
  exists, a prototype of **"extend this clip"** and **"regenerate this section"**.
* **Why It Matters:** Extending an ambience bed rather than regenerating it whole would be the
  single largest change to how the app is used. It is listed as a spike rather than a feature
  because the answer may be no.
* **Technical Touchpoints:** `engine/worker.py`, and whatever the spike finds.

---

### BF-21: Medium-Base download: resume and precheck

* **Description:** Make the ~9 GB Max quality download survivable.
* **Scope:** Free-space precheck against `HF_HUB_CACHE` before starting, resume after an
  interrupted download, and a real progress figure rather than an indeterminate one.
* **Why It Matters:** 9 GB with no resume and no space check is the roughest step in setup, and
  it sits in front of the only preset where negative prompts work at all.
* **Technical Touchpoints:** `engine/worker.py`, `src/components/SettingsPanel.tsx`.

---

### BF-22: Idle model unload

* **Description:** Release VRAM automatically after a configurable idle period.
* **Scope:** An idle timer in Settings (off by default), reusing the existing `engine_unload`
  command, with the next Generate reloading transparently.
* **Why It Matters:** Thunder FX holds several GB of VRAM while idle, which matters when a game
  or engine is running alongside it.
* **Technical Touchpoints:** `src/components/Studio.tsx`, `src/components/SettingsPanel.tsx`.

---

### BF-23: Headless CLI mode

* **Description:** `thunder-fx --prompt "..." --seconds 8 --out sword.wav` for scripting.
* **Scope:** Argument parsing that bypasses the window, reusing the engine process and preset
  system, with a non-zero exit code on failure.
* **Why It Matters:** Puts generation inside an asset pipeline or a build step.
* **Technical Touchpoints:** `src-tauri/src/lib.rs`, `engine/worker.py`.

---

### BF-24: Scene player mode

* **Description:** *Proposal, not scheduled.* A playback surface for running ambience live —
  looping beds, crossfades between scenes, hotkeys, layered one-shots over a bed.
* **Why It Matters:** The ambience catalog is 100 tabletop scene files (`tavern`, `boss`,
  `chase`, `camp`, `dragon-presence`). A DM generating a tavern bed today ends up with a WAV and
  needs a second application to use it at the table. Either the app follows that audience
  through to playback, or it stays a generator and says so.
* **Decision needed:** This is a second product surface and a real commitment. It is recorded
  here so the choice is made deliberately rather than by drift.

---

## Shipped

Delivered features, kept for the record. Details are in [CHANGELOG.md](CHANGELOG.md).

| ID | Feature | Category | Released |
| :--- | :--- | :--- | :--- |
| **BF-01** | Multi-sample rate & pro audio export options | Export & DAW | 0.5.0 |
| **BF-02** | Batch asset renaming, exporting & sound pack zipping | Library & Pipeline | 0.4.0 |
| **BF-03** | Auto-silence detection & instant tight-trim | Waveform & Editing | 0.4.0 |
| **BF-04** | Seamless looper & crossfade engine | Ambience & Audio | 0.4.0 |
| **BF-05** | Multi-take / variation grid ("Generate 4 takes") | Generative Engine | 0.4.0 |
| **BF-06** | Precision VRAM monitor in titlebar | Hardware & Telemetry | 0.4.0 |
| **BF-07** | Half-precision (fp16 / bf16) & low-VRAM generation profiles | Inference & Engine | 0.4.0 |
| **BF-08** | Version consistency check & signed update channel | Release & Delivery | 0.5.0 |
| **BF-09** | Favourites, ratings and reject flags | Library & Pipeline | 0.5.0 |
| **BF-10** | Clip rename, on disk and in the library | Library & Pipeline | 0.5.0 |
| **BF-11** | Trash with undo, restore and retention | Library & Pipeline | 0.5.0 |
| **BF-12** | Free-text tags and library filters | Library & Pipeline | 0.5.0 |
| **BF-13** | Level-matched A/B comparison | Waveform & Editing | 0.5.0 |
| **BF-14** | Fades, reverse, gain, normalize and pitch variants | Waveform & Editing | 0.5.0 |
