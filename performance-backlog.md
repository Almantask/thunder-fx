# Thunder FX — Performance & Quality Backlog

Engineering-health work for **Thunder FX**: generation speed, memory, audio fidelity,
reliability, code health and tooling. Product features live in [backlog.md](backlog.md); this
file is the list of things that make the existing product faster, leaner, more correct and
easier to change.

Every item below was checked against the tree at `d9bc61d` on `feat/tier-0-2`. Where a claim
has a number behind it (bundle size, hook count, log entries, test time) the number was measured
on this machine, not estimated. File and line references point at the code as it stood at that
commit; they will drift, the function names will not.

Items that ship move to [Done](#done) with the release they went out in.

---

## How to read this

- **ID** — `PQ-nn`, stable once assigned.
- **Type** — `Perf` (time, memory, VRAM, bundle), `Fidelity` (what the audio sounds like),
  `Reliability` (crashes, data loss, wrong results), `Health` (code and architecture), `DX`
  (tooling, tests, CI).
- **Impact** — High / Medium / Low, judged on the user's experience or on how much it
  unblocks other work.
- **Effort** — S (hours), M (a day or two), L (a week or a refactor with a design step).

**Quick wins** are High impact at S effort. They come first in the summary and should be
picked off before any of the L items is started.

### Measured baseline (2026-09-11)

| Measure | Value | Source |
| :--- | ---: | :--- |
| Main JS chunk in `dist/` | **7,480 KB** (one file) | `dist/index-*.js`, built 2026-09-10 |
| Prompt markdown inlined into that chunk | **6.6 MB / 235 files** | `import.meta.glob(..., { eager: true })` |
| `React.lazy` / `React.memo` / `useCallback` in `src/` | **0 / 0 / 0** | grep, non-test files |
| `useState` hooks in `Studio.tsx` | **55** (1,885 lines) | grep |
| `lib.rs` / `worker.py` / `GrimoireRail.tsx` | 2,247 / 2,196 / 1,142 lines | wc |
| Vitest suite | 45 files, 549 tests, **91.7 s** wall; environment 261 s vs tests 147 s (aggregate) | `npm test` |
| `engine_status` timeouts in the user's error log | **38** (`timed out after 10s`) | `%LOCALAPPDATA%\thunder-fx\logs\error.log` |
| 380 s stereo 16-bit WAV | 67 MB on disk; 134 MB as decoded float32 | arithmetic |

---

## Priority summary

Quick wins first, then by area. `Status` is `Open` unless noted.

### Quick wins (High impact, S effort)

Wave 1 shipped in this change. Remaining High/S items live in the area tables below as they
are closed.

| ID | Item | Area | Type | Impact | Effort | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PQ-01** | [Stop denoising 6 s of padding on every clip](#pq-01-stop-denoising-6-s-of-padding-on-every-clip) | Engine | Perf | High | S | **Done** |
| **PQ-02** | [Re-enable TF32 and cuDNN autotune after the model constructs](#pq-02-re-enable-tf32-and-cudnn-autotune-after-the-model-constructs) | Engine | Perf | High | S | **Done** |
| **PQ-19** | [Real 24-bit export instead of padded 16-bit](#pq-19-real-24-bit-export-instead-of-padded-16-bit) | Fidelity | Fidelity | High | S | **Done (label)** |
| **PQ-20** | [Bitrate and quality controls for Opus, Vorbis and MP3](#pq-20-bitrate-and-quality-controls-for-opus-vorbis-and-mp3) | Fidelity | Fidelity | High | S | **Done** |
| **PQ-29** | [One progress state object per engine event](#pq-29-one-progress-state-object-per-engine-event) | Frontend | Perf | High | S | **Done** |
| **PQ-30** | [Stop re-parsing the whole WAV on every Studio render](#pq-30-stop-re-parsing-the-whole-wav-on-every-studio-render) | Frontend | Perf | High | S | **Done** |
| **PQ-32** | [Engine status poll: stop colliding with a busy engine](#pq-32-engine-status-poll-stop-colliding-with-a-busy-engine) | Frontend | Reliability | High | S | **Done** |
| **PQ-40** | [`parseWav` must not copy the PCM](#pq-40-parsewav-must-not-copy-the-pcm) | Data path | Perf | High | S | **Done** |
| **PQ-56** | [Atomic, debounced writes for the meta, trash and scope files](#pq-56-atomic-debounced-writes-for-the-meta-trash-and-scope-files) | Library | Reliability | High | S | **Done** |
| **PQ-63** | [Allow-list the three commands the UI calls but the ACL omits](#pq-63-allow-list-the-three-commands-the-ui-calls-but-the-acl-omits) | Shell | Reliability | High | S | **Done** |
| **PQ-64** | [Scope-check the scan commands](#pq-64-scope-check-the-scan-commands) | Shell | Reliability | High | S | **Done** |
| **PQ-81** | [Reconcile the estimate baselines with the README measurements](#pq-81-reconcile-the-estimate-baselines-with-the-readme-measurements) | Estimates | Reliability | High | S | **Done** |

### A. Inference engine

| ID | Item | Type | Impact | Effort | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PQ-01** | [Stop denoising 6 s of padding on every clip](#pq-01-stop-denoising-6-s-of-padding-on-every-clip) | Perf | High | S | **Done** |
| **PQ-02** | [Re-enable TF32 and cuDNN autotune after the model constructs](#pq-02-re-enable-tf32-and-cudnn-autotune-after-the-model-constructs) | Perf | High | S | **Done** |
| **PQ-03** | [Cache text-encoder conditioning across takes and queue items](#pq-03-cache-text-encoder-conditioning-across-takes-and-queue-items) | Perf | High | M | |
| **PQ-04** | [Generate a take set as one batch](#pq-04-generate-a-take-set-as-one-batch) | Perf | High | M | |
| **PQ-05** | [Load FP16 weights without an FP32 peak on the GPU](#pq-05-load-fp16-weights-without-an-fp32-peak-on-the-gpu) | Perf | High | M | |
| **PQ-06** | [Warm the kernels after load](#pq-06-warm-the-kernels-after-load) | Perf | Medium | S | **Done** |
| **PQ-07** | [Make the OOM retry change something, and set the allocator config](#pq-07-make-the-oom-retry-change-something-and-set-the-allocator-config) | Reliability | Medium | S | **Done** |
| **PQ-08** | [Choose chunked decode by free VRAM, not by precision](#pq-08-choose-chunked-decode-by-free-vram-not-by-precision) | Perf | Medium | S | **Done** |
| **PQ-09** | [Vectorise the loudness block loop](#pq-09-vectorise-the-loudness-block-loop) | Perf | Medium | S | **Done** |
| **PQ-10** | [Master on the GPU with one device-to-host copy](#pq-10-master-on-the-gpu-with-one-device-to-host-copy) | Perf | Medium | S | **Done** |
| **PQ-11** | [Spike: `torch.compile` on the DiT](#pq-11-spike-torchcompile-on-the-dit) | Perf | Medium | L | |
| **PQ-12** | [Text encoder offload, and both checkpoints resident when VRAM allows](#pq-12-text-encoder-offload-and-both-checkpoints-resident-when-vram-allows) | Perf | Medium | M | |
| **PQ-13** | [Progress emit budget, and report the real output length](#pq-13-progress-emit-budget-and-report-the-real-output-length) | Perf | Low | S | **Done** |
| **PQ-14** | [Spike: confirm Flash Attention 2 is actually on the attention path](#pq-14-spike-confirm-flash-attention-2-is-actually-on-the-attention-path) | Perf | Medium | S | |
| **PQ-15** | [Seeds: CUDA generator and derived per-take seeds](#pq-15-seeds-cuda-generator-and-derived-per-take-seeds) | Reliability | Medium | S | **Done** |

### B. Audio fidelity

| ID | Item | Type | Impact | Effort | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PQ-16** | [A true-peak ceiling in the engine master](#pq-16-a-true-peak-ceiling-in-the-engine-master) | Fidelity | High | M | |
| **PQ-17** | [Float working buffer for Shape edits; quantise once on save](#pq-17-float-working-buffer-for-shape-edits-quantise-once-on-save) | Fidelity | High | M | |
| **PQ-18** | [Anti-aliased pitch shift](#pq-18-anti-aliased-pitch-shift) | Fidelity | High | M | |
| **PQ-19** | [Real 24-bit export instead of padded 16-bit](#pq-19-real-24-bit-export-instead-of-padded-16-bit) | Fidelity | High | S | **Done (label)** |
| **PQ-20** | [Bitrate and quality controls for Opus, Vorbis and MP3](#pq-20-bitrate-and-quality-controls-for-opus-vorbis-and-mp3) | Fidelity | High | S | **Done** |
| **PQ-21** | [Micro-fades at trim points; stereo-aware silence detection](#pq-21-micro-fades-at-trim-points-stereo-aware-silence-detection) | Fidelity | Medium | S | **Done** |
| **PQ-22** | [A real zero-crossing search, and shorter loop crossfades for short clips](#pq-22-a-real-zero-crossing-search-and-shorter-loop-crossfades-for-short-clips) | Fidelity | Low | S | **Done** |
| **PQ-23** | [Symmetric PCM ↔ float mapping](#pq-23-symmetric-pcm--float-mapping) | Fidelity | Low | S | **Done** |
| **PQ-24** | [Dither every 16-bit quantisation in the TypeScript path](#pq-24-dither-every-16-bit-quantisation-in-the-typescript-path) | Fidelity | Medium | S | **Done** |
| **PQ-25** | [A soft limiter instead of a hard clamp on hot beds](#pq-25-a-soft-limiter-instead-of-a-hard-clamp-on-hot-beds) | Fidelity | Medium | M | |
| **PQ-26** | [Make `soxr` a hard dependency and delete the linear fallback](#pq-26-make-soxr-a-hard-dependency-and-delete-the-linear-fallback) | Fidelity | Medium | S | **Done** |
| **PQ-27** | [A CI-able objective quality suite with golden seeds](#pq-27-a-ci-able-objective-quality-suite-with-golden-seeds) | Fidelity | Medium | M | |

### C. Frontend rendering and state

| ID | Item | Type | Impact | Effort | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PQ-28** | [Take the playhead out of React state](#pq-28-take-the-playhead-out-of-react-state) | Perf | High | M | |
| **PQ-29** | [One progress state object per engine event](#pq-29-one-progress-state-object-per-engine-event) | Perf | High | S | **Done** |
| **PQ-30** | [Stop re-parsing the whole WAV on every Studio render](#pq-30-stop-re-parsing-the-whole-wav-on-every-studio-render) | Perf | High | S | **Done** |
| **PQ-31** | [Split `Studio.tsx` into feature hooks and contexts](#pq-31-split-studiotsx-into-feature-hooks-and-contexts) | Health | High | L | |
| **PQ-32** | [Engine status poll: stop colliding with a busy engine](#pq-32-engine-status-poll-stop-colliding-with-a-busy-engine) | Reliability | High | S | **Done** |
| **PQ-33** | [Canvas at device resolution, sized by a `ResizeObserver`](#pq-33-canvas-at-device-resolution-sized-by-a-resizeobserver) | Perf | Medium | M | |
| **PQ-34** | [Layer the waveform canvas and stop animating when nothing moves](#pq-34-layer-the-waveform-canvas-and-stop-animating-when-nothing-moves) | Perf | Medium | M | |
| **PQ-35** | [Virtualise the library and catalog lists](#pq-35-virtualise-the-library-and-catalog-lists) | Perf | Medium | M | |
| **PQ-36** | [Debounced search over a precomputed index](#pq-36-debounced-search-over-a-precomputed-index) | Perf | Medium | S | **Done** |
| **PQ-37** | [Infer category, subcategory and intensity once, at ingest](#pq-37-infer-category-subcategory-and-intensity-once-at-ingest) | Perf | Medium | S | **Done (JS ingest)** |
| **PQ-38** | [Pure renders: no `Date.now()` in JSX, no playhead in effect deps](#pq-38-pure-renders-no-datenow-in-jsx-no-playhead-in-effect-deps) | Health | Low | S | **Done** |
| **PQ-39** | [A memoised `ClipCard` with selection out of the card props](#pq-39-a-memoised-clipcard-with-selection-out-of-the-card-props) | Perf | Medium | S | **Done** |

### D. Audio data path and memory

| ID | Item | Type | Impact | Effort | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PQ-40** | [`parseWav` must not copy the PCM](#pq-40-parsewav-must-not-copy-the-pcm) | Perf | High | S | **Done** |
| **PQ-41** | [One shared `AudioContext`; build buffers from the PCM you already have](#pq-41-one-shared-audiocontext-build-buffers-from-the-pcm-you-already-have) | Perf | High | M | |
| **PQ-42** | [Play and preview through the asset protocol, not through the IPC](#pq-42-play-and-preview-through-the-asset-protocol-not-through-the-ipc) | Perf | High | M | |
| **PQ-43** | [An undo stack of operations, not of whole WAV files](#pq-43-an-undo-stack-of-operations-not-of-whole-wav-files) | Perf | Medium | M | |
| **PQ-44** | [Move DSP off the main thread](#pq-44-move-dsp-off-the-main-thread) | Perf | Medium | L | |
| **PQ-45** | [Precompute the Kaiser window in the browser resampler](#pq-45-precompute-the-kaiser-window-in-the-browser-resampler) | Perf | Medium | S | **Done** |
| **PQ-46** | [Export from the file on disk, not from bytes pushed back out of the webview](#pq-46-export-from-the-file-on-disk-not-from-bytes-pushed-back-out-of-the-webview) | Perf | Medium | M | |
| **PQ-47** | [`write_file` and `toArrayBuffer` without the extra copy](#pq-47-write_file-and-toarraybuffer-without-the-extra-copy) | Perf | Medium | S | **Done (TS)** |
| **PQ-48** | [Trim and tag in Rust so long clips never enter JavaScript](#pq-48-trim-and-tag-in-rust-so-long-clips-never-enter-javascript) | Perf | Medium | M | |
| **PQ-49** | [Stream pack exports instead of holding every clip in memory](#pq-49-stream-pack-exports-instead-of-holding-every-clip-in-memory) | Perf | Medium | M | |

### E. Startup and bundle

| ID | Item | Type | Impact | Effort | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PQ-50** | [Take 6.6 MB of prompt markdown out of the main bundle](#pq-50-take-66-mb-of-prompt-markdown-out-of-the-main-bundle) | Perf | High | M | |
| **PQ-51** | [Lazy-load dialogs, onboarding, Settings and the goblin renderer](#pq-51-lazy-load-dialogs-onboarding-settings-and-the-goblin-renderer) | Perf | High | M | |
| **PQ-52** | [A build configuration that knows about chunks, targets and budgets](#pq-52-a-build-configuration-that-knows-about-chunks-targets-and-budgets) | Perf | Medium | S | **Done** |
| **PQ-53** | [A Rust release profile](#pq-53-a-rust-release-profile) | Perf | Medium | S | **Done** |
| **PQ-54** | [Unmount closed dialogs](#pq-54-unmount-closed-dialogs) | Perf | Low | S | **Done** |

### F. Library, metadata and filesystem

| ID | Item | Type | Impact | Effort | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PQ-55** | [A single-pass library scan with a cache](#pq-55-a-single-pass-library-scan-with-a-cache) | Perf | High | M | |
| **PQ-56** | [Atomic, debounced writes for the meta, trash and scope files](#pq-56-atomic-debounced-writes-for-the-meta-trash-and-scope-files) | Reliability | High | S | **Done** |
| **PQ-57** | [Trash sweep in the background, on the same volume](#pq-57-trash-sweep-in-the-background-on-the-same-volume) | Reliability | Medium | S | **Done** |
| **PQ-58** | [Watch the library folder instead of rescanning it](#pq-58-watch-the-library-folder-instead-of-rescanning-it) | Perf | Medium | M | |
| **PQ-59** | [A typed clip record filled from the RIFF tags on scan](#pq-59-a-typed-clip-record-filled-from-the-riff-tags-on-scan) | Reliability | Medium | S | **Done** |
| **PQ-60** | [Prune metadata rows whose audio is gone](#pq-60-prune-metadata-rows-whose-audio-is-gone) | Health | Low | S | **Done** |
| **PQ-61** | [Cache the IndexedDB connection in the browser build](#pq-61-cache-the-indexeddb-connection-in-the-browser-build) | Perf | Low | S | **Done** |
| **PQ-62** | [Stream zip entries; store compressed audio uncompressed](#pq-62-stream-zip-entries-store-compressed-audio-uncompressed) | Perf | Medium | S | **Done** |

### G. Rust shell: process, IPC, permissions

| ID | Item | Type | Impact | Effort |
| :--- | :--- | :--- | :--- | :--- |
| **PQ-63** | [Allow-list the three commands the UI calls but the ACL omits](#pq-63-allow-list-the-three-commands-the-ui-calls-but-the-acl-omits) | Reliability | High | S |
| **PQ-64** | [Scope-check the scan commands](#pq-64-scope-check-the-scan-commands) | Reliability | High | S |
| **PQ-65** | [A Job Object so an orphaned Python process dies with the app](#pq-65-a-job-object-so-an-orphaned-python-process-dies-with-the-app) | Reliability | High | M |
| **PQ-66** | [Spawn the engine off the IPC thread, and add a ping that never spawns](#pq-66-spawn-the-engine-off-the-ipc-thread-and-add-a-ping-that-never-spawns) | Perf | Medium | S |
| **PQ-67** | [One progress event, not two](#pq-67-one-progress-event-not-two) | Perf | Low | S |
| **PQ-68** | [A timed-out command cancels the worker and marks it unhealthy](#pq-68-a-timed-out-command-cancels-the-worker-and-marks-it-unhealthy) | Reliability | Medium | S |
| **PQ-69** | [Capture the worker's stderr into the error log](#pq-69-capture-the-workers-stderr-into-the-error-log) | Reliability | Medium | S |
| **PQ-70** | [Cache the resolved scope roots](#pq-70-cache-the-resolved-scope-roots) | Perf | Low | S |
| **PQ-71** | [One source of truth for the IPC contract](#pq-71-one-source-of-truth-for-the-ipc-contract) | Health | High | L |
| **PQ-72** | [Typed errors across the IPC boundary](#pq-72-typed-errors-across-the-ipc-boundary) | Health | Medium | M |

### H. Reliability and observability

| ID | Item | Type | Impact | Effort |
| :--- | :--- | :--- | :--- | :--- |
| **PQ-73** | [Log the reason, one timestamp format, and a level](#pq-73-log-the-reason-one-timestamp-format-and-a-level) | Reliability | Medium | S |
| **PQ-74** | [Tests must not write to the user's real error log](#pq-74-tests-must-not-write-to-the-users-real-error-log) | DX | Medium | S |
| **PQ-75** | [Rotate the error log and buffer its writes](#pq-75-rotate-the-error-log-and-buffer-its-writes) | Reliability | Medium | S |
| **PQ-76** | [A watchdog on the TypeScript side, and scan failures that say so](#pq-76-a-watchdog-on-the-typescript-side-and-scan-failures-that-say-so) | Reliability | Medium | S |
| **PQ-77** | [Nested error boundaries, and no silent catch blocks](#pq-77-nested-error-boundaries-and-no-silent-catch-blocks) | Reliability | Medium | S |
| **PQ-78** | [Aggregate warning toasts during a queue run](#pq-78-aggregate-warning-toasts-during-a-queue-run) | Reliability | Low | S |
| **PQ-79** | [Peak-VRAM telemetry per generation](#pq-79-peak-vram-telemetry-per-generation) | Perf | Low | S |
| **PQ-80** | [Keep third-party `print` off the JSON-lines channel](#pq-80-keep-third-party-print-off-the-json-lines-channel) | Reliability | Low | S |

### I. Time estimation

| ID | Item | Type | Impact | Effort |
| :--- | :--- | :--- | :--- | :--- |
| **PQ-81** | [Reconcile the estimate baselines with the README measurements](#pq-81-reconcile-the-estimate-baselines-with-the-readme-measurements) | Reliability | High | S |
| **PQ-82** | [Checkpoint and cold-load as features of the timing model](#pq-82-checkpoint-and-cold-load-as-features-of-the-timing-model) | Reliability | Medium | S |
| **PQ-83** | [One estimator path](#pq-83-one-estimator-path) | Health | Medium | S |
| **PQ-84** | [Re-fit the take-set estimate when batching lands](#pq-84-re-fit-the-take-set-estimate-when-batching-lands) | Reliability | Low | S |

### J. Code health

| ID | Item | Type | Impact | Effort |
| :--- | :--- | :--- | :--- | :--- |
| **PQ-85** | [Split the four monoliths](#pq-85-split-the-four-monoliths) | Health | Medium | L |
| **PQ-86** | [Argument structs instead of `too_many_arguments`](#pq-86-argument-structs-instead-of-too_many_arguments) | Health | Low | S |
| **PQ-87** | [Narrow the broad `except Exception` sites](#pq-87-narrow-the-broad-except-exception-sites) | Health | Low | S |
| **PQ-88** | [Parse 24-bit and float WAV, or refuse them consistently](#pq-88-parse-24-bit-and-float-wav-or-refuse-them-consistently) | Reliability | Medium | M |

### K. Tooling, tests and CI

| ID | Item | Type | Impact | Effort |
| :--- | :--- | :--- | :--- | :--- |
| **PQ-89** | [Cut the test suite's wall time](#pq-89-cut-the-test-suites-wall-time) | DX | Medium | M |
| **PQ-90** | [Stop type-checking twice, and cache the native job](#pq-90-stop-type-checking-twice-and-cache-the-native-job) | DX | Low | S |
| **PQ-91** | [Stricter TypeScript, formatted Python, typed Python](#pq-91-stricter-typescript-formatted-python-typed-python) | DX | Medium | M |
| **PQ-92** | [Close the test gaps, and fuzz the WAV codec](#pq-92-close-the-test-gaps-and-fuzz-the-wav-codec) | DX | Medium | M |
| **PQ-93** | [A bundle-size budget and a perf regression gate in CI](#pq-93-a-bundle-size-budget-and-a-perf-regression-gate-in-ci) | DX | Medium | S |
| **PQ-94** | [A GPU job for the generation-quality tests](#pq-94-a-gpu-job-for-the-generation-quality-tests) | DX | Low | M |

---

## A. Inference engine

The worker is `engine/worker.py`. A request runs `cmd_generate` → `_generate_body` →
`resolve_preset` → `model.generate(...)` → `_save_generated_wav` (loop → master → dither →
WAV) and answers with a path. Everything in this section is about the time between clicking
Generate and the `done` line.

Wave 2 (remaining S-effort engine items: PQ-06–10, PQ-13, PQ-15) shipped on top of the
quick-win padding/TF32 work. PQ-03–05 (High/M) and the `torch.compile` / Flash Attention
spikes are still open.

### PQ-01: Stop denoising 6 s of padding on every clip

* **Type / Impact / Effort:** Perf / High / S
* **Problem:** `StableAudioModel.generate` takes `duration_padding_sec: float = 6.0`
  (`engine/.venv/.../stable_audio_3/model.py:103`) and `_adapt_sample_size` builds the latent
  for `duration + 6 s`, denoises all of it, then truncates. The worker's call at
  `engine/worker.py:1715-1726` never passes the argument, so every clip pays for six seconds it
  throws away. An 8 s effect denoises 14 s (1.75× the work); a 1.5 s footstep denoises 7.5 s
  (5×). Seamless loops stack `loopOverlapSeconds` (0.5–3 s) on top of that.
* **Proposed change:** Pass `duration_padding_sec` explicitly. Start at 0 and A/B the clip
  tails against the padded output with `engine/audio_metrics.py`; if the end of a clip needs
  headroom to decay cleanly, settle on the smallest value that keeps it (likely 0.5–1 s), and
  make it a per-mode constant next to `LOUDNESS_TARGETS`.
* **Verification:** `scripts/bench_sampler.py` wall time per clip length before and after;
  `engine/test_generation_quality.py` still green; listen to the last 200 ms of ten short
  one-shots.
* **Touchpoints:** `engine/worker.py` (`_generate_body`), `engine/test_worker.py`,
  `src/lib/perfBenchmarks.ts` (re-fit once the step cost drops).

### PQ-02: Re-enable TF32 and cuDNN autotune after the model constructs

* **Type / Impact / Effort:** Perf / High / S
* **Problem:** The library turns them off at construction —
  `torch.backends.cuda.matmul.allow_tf32 = False`, `torch.backends.cudnn.allow_tf32 = False`,
  `torch.backends.cudnn.benchmark = False` (`stable_audio_3/model.py:25-28`). Those are
  training-time safety defaults. The worker never restores them, so every FP32 matmul in the
  pipeline (there are some even on the FP16 path: conditioning, parts of the VAE) runs at
  full FP32 rate on hardware that has TF32 tensor cores.
* **Proposed change:** After `_try_load_model` succeeds, set `allow_tf32 = True` on both
  backends and `cudnn.benchmark = True`, plus `torch.set_float32_matmul_precision("high")`.
  Gate behind an env flag for one release so it can be switched off in the field.
* **Verification:** Step time from the `weave-progress` stream on a fixed seed; the
  generation-quality ladder; a bit-difference report between TF32 and FP32 output on one seed
  (expect tiny, inaudible differences; document them in `learnings.md`).
* **Touchpoints:** `engine/worker.py` (`_try_load_model`).

### PQ-03: Cache text-encoder conditioning across takes and queue items

* **Type / Impact / Effort:** Perf / High / M
* **Problem:** Every `generate` re-runs the T5Gemma conditioner. "Generate 4 takes" sends the
  same prompt four times; a queue run of ten takes of one catalog cue sends it ten times.
  The encoder pass is a fixed cost paid before step 1 lands, and it is the bulk of the
  `leadMs` the timing model has to predict.
* **Proposed change:** Memoise the conditioning tensors keyed on
  `(checkpoint, prompt, negative, seconds_total)` with a small LRU (8 entries), and pass them
  into the sampler rather than re-encoding. The library already separates
  `_build_conditioning_dicts` from sampling, so the seam exists.
* **Verification:** `leadMs` in the persisted timing samples drops to near-zero for the second
  take of a set; output is bit-identical to the uncached path on the same seed.
* **Touchpoints:** `engine/worker.py`, `engine/test_worker.py`.

### PQ-04: Generate a take set as one batch

* **Type / Impact / Effort:** Perf / High / M
* **Problem:** `model.generate` accepts `batch_size` (`model.py:86`); the worker never passes it
  and the UI's take set awaits four sequential generations. Diffusion on a batch of four
  short clips is far cheaper than four runs: the fixed per-step overhead is paid once and the
  GPU is better occupied on short sequences.
* **Proposed change:** A `takes` field on the generate request; the worker batches when
  `seconds × takes` fits a VRAM budget it derives from `mem_get_info`, and falls back to
  serial when it does not. Progress reports one step stream for the batch. Seeds per take
  come from PQ-15.
* **Verification:** Wall time for four 1.5 s and four 8 s takes; VRAM watermark (PQ-79); the
  four outputs match the serial outputs for the same four seeds.
* **Touchpoints:** `engine/worker.py`, `src-tauri/src/lib.rs` (`engine_generate`),
  `src/lib/engine.ts`, `src/components/Studio.tsx` (`castTakes`), PQ-84.

### PQ-05: Load FP16 weights without an FP32 peak on the GPU

* **Type / Impact / Effort:** Perf / High / M
* **Problem:** `loading_utils.py:68-71` does `load_file(ckpt)` → `model.to(device)` →
  `model.to(torch.float16)`. The whole FP32 checkpoint lands on the GPU before it is halved, so
  the load peak is twice the resident size. For Medium-Base (9.2 GB on disk) that is the
  difference between loading and OOM on a 12 GB card, and the README already has to warn about
  it.
* **Proposed change:** Convert on the way in: open the safetensors with `safe_open`, cast each
  tensor to FP16 on the CPU (or directly on the device, tensor by tensor) and copy into a model
  already built in FP16. This is worker-side code around the library, not a fork of it.
* **Verification:** `torch.cuda.max_memory_allocated()` across a cold load, FP16, both
  checkpoints; the README's VRAM note gets a real number.
* **Touchpoints:** `engine/worker.py` (`_try_load_model`).

### PQ-06: Warm the kernels after load

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `_warmup_body` loads weights and returns. The first real generation then pays
  for CUDA context, kernel selection and the attention backend's first-call setup, so the first
  clip after "Load model" is always slower than the estimate, and it is the one the user is
  watching most closely.
* **Proposed change:** After a successful load, run a 0.5 s, 2-step generation on the loaded
  checkpoint and discard it. Report it as part of the load phase so the timing model attributes
  it correctly.
* **Verification:** First-generation `leadMs` and step time match later ones within noise.
* **Touchpoints:** `engine/worker.py` (`_warmup_body`).

### PQ-07: Make the OOM retry change something, and set the allocator config

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** `chunked = _model_precision == "fp16"` (`worker.py:1691`), and the OOM handler
  at `worker.py:1733-1738` retries with `chunked = True`. On the default FP16 path chunked
  decode was already on, so the retry re-runs the identical configuration and fails the same
  way after paying for the whole run twice. OOM is also detected by substring-matching the
  exception text. Separately, neither the worker nor the spawn env in `lib.rs` sets
  `PYTORCH_CUDA_ALLOC_CONF`, so long sessions accumulate allocator fragmentation and produce
  OOMs that are not real.
* **Proposed change:** Catch `torch.cuda.OutOfMemoryError`. On the first OOM: empty the cache,
  and if the config already had chunked decode, fail fast with the VRAM figure and specific
  advice (shorter clip, fewer takes, unload the other checkpoint). Set
  `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` in the engine's environment from the Rust
  spawner so it applies to every install.
* **Verification:** Force an OOM with a 380 s clip on a small VRAM cap
  (`set_per_process_memory_fraction`) and confirm one attempt, one clear message.
* **Touchpoints:** `engine/worker.py`, `src-tauri/src/lib.rs` (`spawn_engine`).

### PQ-08: Choose chunked decode by free VRAM, not by precision

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** Chunked VAE decode is a VRAM-saving trade that costs decode time in extra kernel
  launches. Tying it to precision means a 24 GB card on FP16 always takes the slow path, and a
  FP32 user on a small card never gets the safe one.
* **Proposed change:** Decide per generation from `torch.cuda.mem_get_info()` and the clip
  length; keep an env override.
* **Verification:** Tail time (`tailMs` in the timing samples) on a 24 GB card for 60 s and
  380 s clips.
* **Touchpoints:** `engine/worker.py` (`_generate_body`).

### PQ-09: Vectorise the loudness block loop

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `integrated_lufs` builds its 400 ms block powers with a Python list
  comprehension that slices, reduces and calls `.item()` once per block
  (`worker.py:833-838`). A 380 s bed is ~3,800 blocks, each a handful of tensor ops and a
  Python round-trip, and it runs in float64.
* **Proposed change:** `squares.unfold(-1, block, hop).mean(-1).sum(0)` gives every block
  power in one call; gates stay as they are. Keep float64 only if the EBU tone test needs it —
  it very likely passes in float32.
* **Verification:** `engine/test_worker.py` loudness cases (EBU Tech 3341 tone) unchanged;
  master time on a 380 s clip.
* **Touchpoints:** `engine/worker.py` (`integrated_lufs`).

### PQ-10: Master on the GPU with one device-to-host copy

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `_to_stereo_cpu` moves the decoded audio to the CPU as float32 first; DC
  removal, high-pass, loudness, gain, ceiling and dither then all run on the CPU. For a long
  bed that is a 134 MB copy followed by a CPU-bound pipeline while the GPU idles.
* **Proposed change:** Run the master on the device tensor and move the final int16 result
  once. The 25 Hz biquad, the K-weighting and the TPDF noise are all trivially expressible in
  torch on CUDA.
* **Verification:** Tail time on long clips; bit-identical output vs the CPU path on a seed.
* **Touchpoints:** `engine/worker.py` (`_master_audio_cpu`, `_quantize_pcm16`,
  `_save_generated_wav`).

### PQ-11: Spike: `torch.compile` on the DiT

* **Type / Impact / Effort:** Perf / Medium / L
* **Problem:** The sampling loop is eager PyTorch. `torch.compile` with `mode="reduce-overhead"`
  (CUDA graphs) is the standard next step for a fixed-shape diffusion loop, but on Windows with
  a prebuilt Flash Attention wheel it may not compile at all, and the first-call compile cost
  has to be hidden behind the warm-up (PQ-06).
* **Proposed change:** Time-boxed spike: compile the DiT forward only, dynamic=False per clip
  length bucket, measure step time and compile time, and record the answer in `learnings.md`
  either way.
* **Verification:** Step time at 8 s / 20 steps before and after; graceful fallback when the
  compiler errors.
* **Touchpoints:** `engine/worker.py`.

### PQ-12: Text encoder offload, and both checkpoints resident when VRAM allows

* **Type / Impact / Effort:** Perf / Medium / M
* **Problem:** The conditioner is moved to CUDA at load and stays there for the life of the
  process; once PQ-03 caches conditioning it is idle almost all the time. Separately, only one
  of Medium / Medium-Base can be resident, so switching preset across that boundary is a full
  unload and reload (the README has to explain this as a Settings-level decision).
* **Proposed change:** Move the text encoder to the CPU after encoding when free VRAM is under a
  threshold; keep both diffusion checkpoints resident when free VRAM after load exceeds the
  second one's footprint (BF-22 idle unload stays the release valve).
* **Verification:** VRAM badge before and after; preset switch time on a 24 GB card.
* **Touchpoints:** `engine/worker.py` (`_try_load_model`, `cmd_unload`).

### PQ-13: Progress emit budget, and report the real output length

* **Type / Impact / Effort:** Perf / Low / S
* **Problem:** `_Heartbeat` emits every 250 ms and step events are throttled to
  `_STEP_EMIT_MIN_S = 0.08` (`worker.py:45`), each line flushed, each line then parsed in Rust
  and emitted twice into the webview (PQ-67). During sampling the heartbeat carries no new
  information. `done.duration` reports the requested seconds, not the length actually written,
  which a seamless loop shortens.
* **Proposed change:** Heartbeat only while no step events flow (load, decode, write); report
  `wav.shape[-1] / sr` as the duration.
* **Verification:** Count of progress lines per generation; `Clip.duration` matches
  `wavDurationSeconds` for a looped clip.
* **Touchpoints:** `engine/worker.py` (`_Heartbeat`, `_generate_body`).

### PQ-14: Spike: confirm Flash Attention 2 is actually on the attention path

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `engine/pyproject.toml` pins a prebuilt `flash-attn` wheel and the setup probe
  requires `import flash_attn` to succeed, but a grep of the installed `stable_audio_3` tree
  finds no import of it. Either attention runs through SDPA (which may or may not select the
  flash kernel) or the dependency is dead weight that makes setup harder than it needs to be.
* **Proposed change:** Trace one forward with `torch.profiler` and read which attention kernel
  ran; if FA2 is not used, either wire `sdpa_kernel(SDPBackend.FLASH_ATTENTION)` explicitly or
  drop the wheel and the probe requirement. Record the finding.
* **Verification:** Profiler trace names; step time.
* **Touchpoints:** `engine/pyproject.toml`, `engine/worker.py` (`cmd_probe`), README setup.

### PQ-15: Seeds: CUDA generator and derived per-take seeds

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** The library seeds the global RNG with `torch.manual_seed` and draws noise with
  `torch.randn`, so any other random draw in the process between seeding and sampling changes
  the output. The worker picks a missing seed with Python's `random.randint`. Per-take seeds
  come from the UI's `randomSeed()` independently, so a set of four takes cannot be reproduced
  from one number.
* **Proposed change:** A `torch.Generator(device="cuda")` per generation passed into the noise
  draw; derive take seeds as `hash(parentSeed, takeIndex)` and show the parent seed on the
  take grid.
* **Verification:** Same seed → bit-identical WAV across two process lifetimes; a take set
  reproduces from its parent seed.
* **Touchpoints:** `engine/worker.py`, `src/lib/seed.ts`, `src/lib/promptCatalog.ts`
  (`expandEffectTakes`), `src/components/TakesGrid.tsx`.

---

## B. Audio fidelity

What comes out of the speakers. The engine master is already careful (BS.1770 loudness, TPDF
dither, DC removal); the gaps are a ceiling that is not the ceiling it claims to be, and a
TypeScript editing path that re-quantises on every step.

### PQ-16: A true-peak ceiling in the engine master

* **Type / Impact / Effort:** Fidelity / High / M
* **Problem:** The comment at `worker.py:891` says "True-peak ceiling always wins", and the code
  is `wav.abs().max()` — a sample peak. Inter-sample peaks on a −1 dBFS sample-peak master
  routinely reach +0.5 to +1 dBTP on transients, which is exactly what one-shot sound effects
  are made of. Those clip on reconstruction and, worse, on the Opus/MP3 encoders the default
  export uses. The same sample-peak rule is in `normalizePeak` and `layerWavs`
  (`src/lib/audioEdit.ts`).
* **Proposed change:** Measure true peak per BS.1770-4 Annex 2 (4× oversampling with the
  specified FIR), scale to a −1 dBTP ceiling, and lower the ceiling to about −2 dBTP when the
  destination is a lossy codec. Reuse the same measurement in the TS `peakDbfs`.
* **Verification:** A unit test with a known inter-sample-peak signal (two samples at
  ±0.9 with a sign flip) that the sample-peak code passes and the true-peak code catches;
  export ten SFX to Opus and decode-measure their peaks.
* **Touchpoints:** `engine/worker.py` (`_master_audio_cpu`), `src/lib/audioEdit.ts`.

### PQ-17: Float working buffer for Shape edits; quantise once on save

* **Type / Impact / Effort:** Fidelity / High / M
* **Problem:** The header of `src/lib/audioEdit.ts:9-11` says "All maths runs in float and is
  rounded once at the end." Every function in the file takes a WAV `ArrayBuffer`, parses it to
  `Int16Array`, computes, and writes a new int16 WAV (`clampSample` → `Math.round` at line 28;
  used at lines 96, 105, 133, 216, 324). Shape applies edits in sequence, so fade → gain → pitch
  quantises three times, with no dither (PQ-24). Each step also costs three full-buffer copies
  (parse copy, output array, `writeWav`), on the main thread.
* **Proposed change:** The working clip becomes `{ sampleRate, channels, pcm: Float32Array,
  info }`. Shape edits operate on that in place or via a copy-on-write; playback builds an
  `AudioBuffer` from it directly (PQ-41); `writeWav` quantises with TPDF dither exactly once on
  Save or Export. The source WAV stays as the undo base (PQ-43).
* **Verification:** Apply fade+gain+pitch+normalize, undo all, compare to source (must be
  bit-identical); measure noise floor after five chained edits on a −60 dBFS tone before and
  after.
* **Touchpoints:** `src/lib/audioEdit.ts`, `src/lib/wav.ts`, `src/lib/playback.ts`,
  `src/components/Studio.tsx`, `src/components/ShapePanel.tsx`.

### PQ-18: Anti-aliased pitch shift

* **Type / Impact / Effort:** Fidelity / High / M
* **Problem:** `pitchShiftWav` (`src/lib/audioEdit.ts:198-220`) is linear interpolation. Its
  comment claims the artefacts sit above the audible band for ±12 semitones. Pitching up is
  decimation: at +12 semitones every second source sample is skipped with no low-pass first, so
  anything in the source above 11 kHz folds back into the band. Pitching down is interpolation
  with a triangular kernel, which rolls off the top octave and leaves imaging. Pitch variants
  are the feature's headline use and are exactly the bright, transient material where this is
  audible.
* **Proposed change:** For ratio > 1, low-pass at `Nyquist / ratio` (a windowed-sinc FIR or the
  Kaiser kernel already in `audioExport.ts`) before resampling; use the same windowed-sinc
  interpolation for the resample itself. On the desktop, an alternative is to hand the shift
  to the worker's torchaudio resampler, which already does this correctly for export.
* **Verification:** Sweep a 1 kHz→20 kHz chirp +12 semitones; spectrogram before and after
  shows no reflected components; compare against `torchaudio.functional.resample` output.
* **Touchpoints:** `src/lib/audioEdit.ts`, `src/lib/audioExport.ts` (shared kernel).

### PQ-19: Real 24-bit export instead of padded 16-bit

* **Type / Impact / Effort:** Fidelity / High / S
* **Problem:** `writePcm24` (`src/lib/wav.ts:181-188`) writes `int16 << 8`. The exported file is
  24-bit in its header and 16-bit in its content; the extra byte is zeros. The engine masters to
  a 16-bit, dithered WAV before any export, so the desktop encoders (`worker.py:1966-1974`,
  `PCM_24`) also have nothing to put in the low bits. The UI offers 24-bit as a pro option and
  it is not one.
* **Proposed change:** Keep the float master. Either write the library file as 32-bit float WAV
  (PQ-88 makes the parser read it) and quantise per export, or store both a 16-bit playback
  file and a float sidecar. Until that lands, label the option "24-bit container (16-bit
  content)" or hide it.
* **Verification:** Export a clip at 24-bit; a histogram of the low byte is not all zeros.
* **Touchpoints:** `src/lib/wav.ts`, `src/lib/audioExport.ts`, `engine/worker.py`
  (`_save_generated_wav`, `cmd_encode_audio`), `src/components/Altar.tsx`.

### PQ-20: Bitrate and quality controls for Opus, Vorbis and MP3

* **Type / Impact / Effort:** Fidelity / High / S
* **Problem:** Opus is the default export format and is written by
  `sf.write(dest, data, sr, format="OGG", subtype="OPUS")` (`worker.py:1965`) with no bitrate;
  Vorbis the same (`:1961`). libsndfile's defaults decide the quality and the UI cannot see or
  change them. MP3 is 320 kbps CBR only on the ffmpeg path; the torchaudio path passes no
  bitrate and the libsndfile fallback cannot (`worker.py:1904-1909`).
* **Proposed change:** A `bitrate` (or `quality`) field on `engine_encode_audio` with sane
  per-format defaults (Opus 128 kbps stereo VBR, Vorbis q6, MP3 V0 or 320), exposed in the
  export panel's advanced row and in Settings for the default. Route Opus/Vorbis through
  ffmpeg or `soundfile`'s `compression_level` where libsndfile ≥ 1.1 supports it; report the
  effective encoder in the `done` message.
* **Verification:** `ffprobe` on the exports shows the requested bitrate; file sizes move.
* **Touchpoints:** `engine/worker.py` (`cmd_encode_audio`), `src/lib/audioExport.ts`,
  `src/components/Altar.tsx`, `src/components/SettingsPanel.tsx`.

### PQ-21: Micro-fades at trim points; stereo-aware silence detection

* **Type / Impact / Effort:** Fidelity / Medium / S
* **Status:** **Done** (fidelity S-wave)
* **Problem:** `detectSilenceBounds` only reports bounds; `trimWav` cuts at a sample. A cut
  through a non-zero sample is a click, and auto-trim pads by 30 ms, which is not a fade.
  `rmsWindow` (`src/lib/silenceTrim.ts:16`) reads the left channel only, so a hard-panned
  right-channel tail is trimmed off.
* **Proposed change:** `trimWav` applies a 2–5 ms equal-power fade at both cut points (reuse
  `fadeGain`); `rmsWindow` sums both channels.
* **Verification:** Trim a DC-offset square wave mid-cycle and confirm no step at the cut;
  detect bounds on a right-only clip.
* **Touchpoints:** `src/lib/silenceTrim.ts`, `src/lib/wav.ts` (`trimWav`).

### PQ-22: A real zero-crossing search, and shorter loop crossfades for short clips

* **Type / Impact / Effort:** Fidelity / Low / S
* **Status:** **Done** (fidelity S-wave)
* **Problem:** `nearestZeroCrossing` (`src/lib/seamlessLoop.ts:28-47`) finds the minimum
  absolute left-channel sample in a ±5 ms window, not a sign change, and ignores the right
  channel. `MIN_CROSSFADE_SEC = 0.5` forces half a second of crossfade onto a 2 s loop, which
  smears a quarter of it.
* **Proposed change:** Search for a sign change with matching slope on the summed channels;
  scale the minimum crossfade with clip length (e.g. 5 % of duration, floor 50 ms).
* **Verification:** `loopWrapJump` on the shipped loops; listen to a 2 s footstep-bed loop.
* **Touchpoints:** `src/lib/seamlessLoop.ts`, `engine/worker.py` (mirror the join logic).

### PQ-23: Symmetric PCM ↔ float mapping

* **Type / Impact / Effort:** Fidelity / Low / S
* **Status:** **Done** (fidelity S-wave)
* **Problem:** `pcmToFloat` divides by 32768 (`src/lib/audioExport.ts:88`) and `floatToPcm16`
  multiplies by 32767 (`:97`). A round trip attenuates by 1/32768 and a full-scale negative
  sample cannot be represented on the way back. Harmless once, cumulative across edits.
* **Proposed change:** Use 32768 in both directions with a clamp to [−32768, 32767], and make
  the same choice in `worker.py`'s `_quantize_pcm16` so the two paths agree.
* **Verification:** Round-trip test on full-scale ±1 samples is exact.
* **Touchpoints:** `src/lib/audioExport.ts`, `src/lib/audioEdit.ts`, `engine/worker.py`.

### PQ-24: Dither every 16-bit quantisation in the TypeScript path

* **Type / Impact / Effort:** Fidelity / Medium / S
* **Status:** **Done** (fidelity S-wave)
* **Problem:** The engine applies TPDF dither; nothing in `src/lib` does. `floatToPcm16`,
  `clampSample`, `downmixToMono` and the seamless-loop crossfade all truncate with
  `Math.round`, so an edited or exported clip loses the noise-shaping the engine paid for.
* **Proposed change:** A single `quantise16(float, { dither: true })` helper used by every
  int16 writer, with the same silence guard the engine has (no dither on true digital
  silence). Once PQ-17 lands this is called in exactly one place.
* **Verification:** Spectrum of a −80 dBFS fade tail shows noise, not harmonic distortion.
* **Touchpoints:** `src/lib/audioExport.ts`, `src/lib/audioEdit.ts`, `src/lib/seamlessLoop.ts`.

### PQ-25: A soft limiter instead of a hard clamp on hot beds

* **Type / Impact / Effort:** Fidelity / Medium / M
* **Problem:** `_master_audio_cpu` ends with `wav.clamp(-1.0, 1.0)`. The gain stage before it is
  capped by the peak ceiling so this rarely bites, but when the LUFS target pushes a bed whose
  peaks were already near the ceiling, the ceiling scaling wins and the loudness target is
  quietly missed. `layerWavs` with `normalize: false` hard-clips.
* **Proposed change:** A look-ahead peak limiter (1–2 ms attack, ~50 ms release) as the final
  stage so beds reach target loudness without flat-topping; report the gain reduction in the
  `done` message.
* **Verification:** Integrated LUFS of the ambience catalog sample lands within ±0.5 LU of
  −20; no sample at exactly ±32767 in the outputs.
* **Touchpoints:** `engine/worker.py`, `src/lib/audioEdit.ts`.

### PQ-26: Make `soxr` a hard dependency and delete the linear fallback

* **Type / Impact / Effort:** Fidelity / Medium / S
* **Status:** **Done** (fidelity S-wave)
* **Problem:** Export resampling prefers soxr, then torchaudio's windowed sinc, then
  `np.interp` (`worker.py:1854-1856`). The changelog already records that the linear path
  aliased and was the one actually running. The fallback still exists, so a broken torchaudio
  install silently degrades every 48 kHz export again.
* **Proposed change:** Pin `soxr` in `engine/pyproject.toml`; if neither soxr nor torchaudio
  resamples, refuse the export with a message rather than interpolate.
* **Verification:** `engine/test_worker.py` asserts the fallback branch is gone.
* **Touchpoints:** `engine/pyproject.toml`, `engine/worker.py`.

### PQ-27: A CI-able objective quality suite with golden seeds

* **Type / Impact / Effort:** Fidelity / Medium / M
* **Problem:** `engine/test_generation_quality.py` needs a GPU and runs only by hand. Nothing
  guards the master chain or the TypeScript DSP against a regression that a metric would
  catch. Several items in this section (PQ-01, PQ-02, PQ-16, PQ-18) change output slightly and
  need a yardstick.
* **Proposed change:** Golden WAVs for three seeds × three modes checked into a release asset
  (not the repo), plus `audio_metrics.verdict()` thresholds; a Vitest suite that runs the TS DSP
  on synthetic signals (chirps, tones, impulses) and asserts spectral properties. PQ-94 gives the
  GPU half a place to run.
* **Verification:** The suite fails when PQ-18's fix is reverted.
* **Touchpoints:** `engine/audio_metrics.py`, `engine/test_generation_quality.py`, new
  `src/lib/dsp.quality.test.ts`.

---

## C. Frontend rendering and state

`Studio.tsx` owns almost all application state: 55 `useState` hooks, no `useCallback`, no
memoised children anywhere in `src/`. Any state that changes often re-renders the whole tree
under it — Titlebar, waveform, console, library — and two things change very often: the
playhead and generation progress.

### PQ-28: Take the playhead out of React state

* **Type / Impact / Effort:** Perf / High / M
* **Problem:** A `requestAnimationFrame` loop calls `setPlayhead(t)` every frame
  (`src/components/Studio.tsx:1176`). Each call re-renders Studio and every child (there is no
  `React.memo`), then `ScrollCanvas` sees `playhead` in its effect deps
  (`ScrollCanvas.tsx:307-317`) and tears down and restarts its own draw effect. That is ~60
  full-tree renders a second for the duration of every preview. Combined with PQ-30 it also
  re-parses the WAV each frame.
* **Proposed change:** Keep the playhead in a ref owned by a `usePlayback` hook; `ScrollCanvas`
  reads it inside its draw loop and the clock label updates via a ref (the busy status already
  does this at `ScrollCanvas.tsx:288-299`). Commit React state only on play/pause/seek/end.
* **Verification:** React DevTools profiler during playback: zero Studio commits per second
  while playing; CPU in the Tauri webview process drops.
* **Touchpoints:** `src/components/Studio.tsx`, `src/components/ScrollCanvas.tsx`,
  `src/components/Altar.tsx`, `src/lib/playback.ts`.

### PQ-29: One progress state object per engine event

* **Type / Impact / Effort:** Perf / High / S
* **Problem:** `onProgress` sets five separate states per event — `setRite`, `setTotalRites`,
  `setElapsedMs`, `setWeavePhase`, `setWeaveRatio` (`Studio.tsx:935-939`), and the load path
  does the same at `:775-777` and `:822-824`. The heartbeat fires every 250 ms and steps every
  ≥80 ms, each event a full-tree render. `ScrollCanvas` already drives the bar and the status
  text imperatively from refs, so most of these renders change nothing visible.
* **Proposed change:** A single `weave` state object updated once per event (or a ref plus a
  low-rate `useSyncExternalStore` snapshot for the parts React must render). Pair with PQ-28
  under one `useWeave` hook.
* **Verification:** Profiler commit count during a 50-step generation drops from hundreds to a
  handful.
* **Touchpoints:** `src/components/Studio.tsx`, `src/lib/runTiming.ts` (already
  event-shaped).

### PQ-30: Stop re-parsing the whole WAV on every Studio render

* **Type / Impact / Effort:** Perf / High / S
* **Problem:** `const clipDuration = wav ? wavDurationSeconds(wav) : duration`
  (`Studio.tsx:280`) runs on every render. `wavDurationSeconds` calls `parseWav`, which walks the
  chunks and then copies the entire PCM (`src/lib/wav.ts:178`). With PQ-28 unfixed, that is a
  full-buffer copy of the current clip per animation frame during playback — for a 380 s bed,
  67 MB, sixty times a second — to read a number that never changes.
* **Proposed change:** `useMemo(() => ..., [wav, duration])` today; after PQ-40 the call is a
  header read; after PQ-17 the duration is a field.
* **Verification:** Allocation profile during playback shows no per-frame 67 MB arrays.
* **Touchpoints:** `src/components/Studio.tsx`, `src/lib/wav.ts`.

### PQ-31: Split `Studio.tsx` into feature hooks and contexts

* **Type / Impact / Effort:** Health / High / L
* **Problem:** 1,885 lines, 55 `useState`, 9 `useEffect`, 15 `useRef`, 0 `useCallback`;
  generation, queue, library, trash, compare, Shape edits, settings, catalog, timing and
  keyboard shortcuts in one component. Children receive 20–40 props each and every handler is
  an inline lambda (`Studio.tsx:1508-1575`, `:1680-1687`), so memoising a child would not help
  until the callbacks are stable. `remainingAt` is recreated each render (`:348-355`) and sits
  in a child effect's deps.
* **Proposed change:** In order: `usePlayback` (PQ-28), `useWeave` (PQ-29), `useLibrary`
  (clips, meta, trash, scan), `useQueue`, `useClipEdits` (Shape stack), `useEngineStatus`
  (PQ-32). Each exposes stable callbacks; contexts for the two slices with many consumers
  (engine status, playback). Studio becomes composition only. `React.memo` on `GrimoireRail`,
  `IncantationConsole`, `ScrollCanvas`, `Titlebar` once their props are stable.
* **Verification:** Studio under 400 lines; profiler shows only the affected subtree
  re-rendering on a rating change or a progress event; `Studio.test.tsx` passes unchanged.
* **Touchpoints:** `src/components/Studio.tsx`, new `src/hooks/*`.

### PQ-32: Engine status poll: stop colliding with a busy engine

* **Type / Impact / Effort:** Reliability / High / S
* **Problem:** `setInterval(refreshEngine, 4000)` (`Studio.tsx:582-584`) runs for the life of
  the app, including while a model loads or a clip generates. `engine_status` goes through
  `ensure_engine` (so an idle app can spawn Python just to ask how it is) and has a 10 s
  timeout; the user's error log holds **38** `Engine command timed out after 10s` entries each
  paired with `Engine status failed`. Every poll also re-renders the whole tree through
  `setEngine`, and the Titlebar VRAM badge is the only consumer that changes.
* **Proposed change:** Poll at 4 s only while the window is focused and the model is loaded and
  idle; back off to 20–30 s otherwise; skip the poll entirely while a generation or load is in
  flight (the progress stream already proves the engine is alive); add `engine_ping` (PQ-66)
  that never spawns; move VRAM into a small context so only the badge re-renders.
* **Verification:** Zero status timeouts in the log across a full queue run; profiler shows
  the badge, not Studio, committing on a poll.
* **Touchpoints:** `src/components/Studio.tsx`, `src/components/Titlebar.tsx`,
  `src-tauri/src/lib.rs`.

### PQ-33: Canvas at device resolution, sized by a `ResizeObserver`

* **Type / Impact / Effort:** Perf / Medium / M
* **Problem:** `<canvas width={960} height={280} className="size-full" />`
  (`ScrollCanvas.tsx:526`) has a fixed backing store stretched by CSS to whatever the layout
  gives it. On a 1440p or 4K display the waveform and the goblins are visibly soft; on a
  narrow window they are squashed; `devicePixelRatio` is never read. Hit-testing rescales
  pointer coordinates by the ratio of CSS to canvas pixels on every event to compensate.
* **Proposed change:** Size the backing store from a `ResizeObserver` × `devicePixelRatio`,
  scale the context once, and drop the coordinate rescaling. Recompute peaks for the new width
  (PQ-40 makes that cheap).
* **Verification:** Screenshot at 200 % scaling shows crisp 1 px playhead and text.
* **Touchpoints:** `src/components/ScrollCanvas.tsx`, `src/lib/goblinBand.ts`.

### PQ-34: Layer the waveform canvas and stop animating when nothing moves

* **Type / Impact / Effort:** Perf / Medium / M
* **Problem:** While the model is loaded and no clip is open, `targetVisualState` is
  `'resting'`, `shouldAnimate` is true, and the rAF loop clears the canvas and calls
  `drawGoblinBand` — a 98 KB renderer — every frame (`ScrollCanvas.tsx:227-306`), including when
  the window is minimised or on another tab, and regardless of `prefers-reduced-motion`
  (`index.css` handles it for CSS animations only). `Object.fromEntries(interactions)`
  allocates per frame (`:268`); `getGoblinHitTarget` runs on every `pointermove` (`:491-518`).
  The static waveform is redrawn in full on each playhead tick.
* **Proposed change:** Two canvases: a static layer (waveform, trim shading) drawn on
  `wav`/`trim`/resize changes only, and an overlay for playhead and goblins. Pause the loop
  when `document.hidden`, when reduced motion is requested (draw one still frame), and cap
  the resting animation at 30 fps. Use the rAF timestamp, not `Date.now()`.
* **Verification:** Task Manager CPU for the webview process at idle with the model loaded:
  from a steady few percent to ~0.
* **Touchpoints:** `src/components/ScrollCanvas.tsx`, `src/lib/goblinBand.ts`.

### PQ-35: Virtualise the library and catalog lists

* **Type / Impact / Effort:** Perf / Medium / M
* **Problem:** `GrimoireRail` maps every clip in every group to a card
  (`GrimoireRail.tsx:1005-1059`); `PromptCatalogDialog` maps every effect in a category or every
  search hit (`PromptCatalogDialog.tsx:652-787`). A queue run overnight produces hundreds of
  clips; a category holds hundreds of cues; a search across the ~18,000-cue catalog can match
  thousands. No virtualiser is in `package.json`.
* **Proposed change:** `@tanstack/react-virtual` on the flattened row list (section headers as
  sticky rows) in both places; keep the DOM under ~60 rows.
* **Verification:** Open the catalog dialog with an empty query on the largest library and
  count DOM nodes; time to interactive on a 1,000-clip library.
* **Touchpoints:** `src/components/GrimoireRail.tsx`, `src/components/PromptCatalogDialog.tsx`.

### PQ-36: Debounced search over a precomputed index

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** Both search boxes filter on every keystroke with no debounce, and the library
  filter calls `inferClipSubcategory` and `extractInstruments` per clip per keystroke
  (`GrimoireRail.tsx:192-205`); the catalog lower-cases and scans every effect
  (`PromptCatalogDialog.tsx:119-168`).
* **Proposed change:** A 150 ms debounce (or `useDeferredValue`) and a per-item lower-cased
  search string built once at ingest; a token index for the catalog if PQ-50 moves it to JSON.
* **Verification:** Typing a ten-character query into the catalog search produces one filter
  pass, not ten.
* **Touchpoints:** `src/components/GrimoireRail.tsx`, `src/components/PromptCatalogDialog.tsx`,
  `src/lib/promptCatalog.ts`.

### PQ-37: Infer category, subcategory and intensity once, at ingest

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `inferClipCategory` and friends scan the whole catalog (bounded by a 2,000-entry
  cache) and are called when grouping the library (`GrimoireRail.tsx:210-260`), when searching,
  per card for instruments and relative time (`:572-580`, `:662`), and again on every generate
  in `engine.ts`. The worker already writes `ISBJ`/`IART`/`IKEY` into the RIFF INFO chunk, so
  the answer is on disk.
* **Proposed change:** Fill `category`, `subcategory`, `intensity`, `instruments` on the `Clip`
  at scan time (Rust reads the tags, PQ-59) and at generate time; infer only for legacy files
  that lack tags, once, and write the result back into the meta file.
* **Verification:** No `infer*` calls in a render path (assert via a test spy on a 200-clip
  library render).
* **Touchpoints:** `src/components/GrimoireRail.tsx`, `src/lib/engine.ts`,
  `src/lib/promptCatalog.ts`, `src-tauri/src/lib.rs`.

### PQ-38: Pure renders: no `Date.now()` in JSX, no playhead in effect deps

* **Type / Impact / Effort:** Health / Low / S
* **Problem:** `ScrollCanvas` computes `barValue` with `remainingAt?.(Date.now())` during render
  (`:168-177`) and again in JSX (`:381`), so the render output depends on the clock and differs
  between the render and the commit React may re-run it in. The rAF effect's dependency list
  includes `elapsedMs`, `playhead`, `trimStart`, `trimEnd`, `wav` (`:307-317`), restarting the
  loop whenever any of them changes. The controlled `<Progress value>` and the imperative
  `transform` write fight over the same element (`:271-287` vs `:415-421`).
* **Proposed change:** Read the clock only inside the rAF tick; feed the loop from refs and give
  the effect a minimal dependency list; make the progress bar imperative-only while busy.
* **Verification:** React Strict Mode double-render produces identical output;
  `ScrollCanvas.test.tsx` gains a "does not restart the loop on playhead change" case.
* **Touchpoints:** `src/components/ScrollCanvas.tsx`.

### PQ-39: A memoised `ClipCard` with selection out of the card props

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `renderClipCard` is a closure over `selectedIds`, `playingId`, `fxPlayingIds` and
  the handlers, so toggling one checkbox reconciles every card in the library.
* **Proposed change:** `ClipCard` as a `React.memo` component taking primitives and stable
  callbacks; `isSelected`/`isPlaying` as booleans per card, or via a small selection context
  read inside the card.
* **Verification:** Profiler: one card commits on a checkbox toggle.
* **Touchpoints:** `src/components/GrimoireRail.tsx`.

---

## D. Audio data path and memory

How PCM moves between disk, Rust, the webview and the speakers. Audio already crosses the
IPC as raw bytes rather than base64 — that fix is in the changelog — but every clip still
lands in JavaScript in full, is copied several times, and is decoded into a second, float
copy for playback.

### PQ-40: `parseWav` must not copy the PCM

* **Type / Impact / Effort:** Perf / High / S
* **Problem:** `parseWav` ends with `pcm: new Int16Array(pcm)` (`src/lib/wav.ts:178`) — a full
  copy of the data chunk on every call — and it is called by `wavDurationSeconds`,
  `waveformPeaks`, `trimWav`, `loopWrapJump`, `detectSilenceBounds`, `peakDbfs`, `rmsDbfs` and
  every Shape edit. Opening a clip therefore copies it at least three times before it plays,
  and PQ-30 calls it per frame. `waveformPeaks` also reads the left channel only and produces
  a fixed 240 buckets regardless of canvas width.
* **Proposed change:** Return a view (`new Int16Array(buffer, dataOffset, n)`) and document
  that the result aliases the input; add `readWavHeader(buffer)` for duration/format without
  touching the data; make `waveformPeaks` take a bucket count from the canvas width and use
  max over both channels (min/max pairs, so the drawing can show asymmetry).
* **Verification:** `wav.test.ts` asserts `parseWav(buf).pcm.buffer === buf`; heap snapshot
  after opening a 380 s clip shows one PCM copy.
* **Touchpoints:** `src/lib/wav.ts` and every caller (view semantics must be checked at each
  mutation site — the Shape edits already allocate their own output).

### PQ-41: One shared `AudioContext`; build buffers from the PCM you already have

* **Type / Impact / Effort:** Perf / High / M
* **Problem:** `createPlayback` constructs a new `AudioContext` per clip and calls
  `decodeAudioData(buffer.slice(0))` (`src/lib/playback.ts:32-33`): one more copy of the WAV,
  then a full decode into float32 (134 MB for a 380 s clip) that duplicates the parse the app
  has already done. `GrimoireRail`, `CompareDialog`, `TakesGrid` and the goblin click sound
  (`goblinBand.ts:2645-2654`) each create their own contexts. Browsers cap concurrent contexts
  and each one owns an audio thread.
* **Proposed change:** A module-level `getAudioContext()`; `createBuffer` + `copyToChannel`
  from the `Int16Array` view (or the float working buffer after PQ-17) — synchronous and no
  WAV re-parse; per-clip `AudioBuffer` cache keyed on clip id with a small LRU.
* **Verification:** `performance.memory` after opening five long clips in a row; no
  "AudioContext limit" warnings after auditioning fifty library cards.
* **Touchpoints:** `src/lib/playback.ts`, `src/components/GrimoireRail.tsx`,
  `src/components/CompareDialog.tsx`, `src/components/TakesGrid.tsx`, `src/lib/goblinBand.ts`.

### PQ-42: Play and preview through the asset protocol, not through the IPC

* **Type / Impact / Effort:** Perf / High / M
* **Problem:** After a generation, `engine.ts:315` reads the whole WAV back through `read_file`
  so it can be shown and played; library previews do the same per card. The CSP already allows
  `asset:` and `http://asset.localhost` (`tauri.conf.json`), yet `convertFileSrc` is not used
  anywhere in `src/`. For preview and A/B, an `<audio src>` or a `fetch` of the asset URL
  streams from disk and never materialises the file in the JS heap.
* **Proposed change:** Library card preview and CompareDialog play from `convertFileSrc(path)`;
  the editor keeps the in-memory path only for the clip being edited; peaks for cards come from
  a cached sidecar or from the Rust scan (PQ-55) rather than from a full read.
* **Verification:** Auditioning twenty cards no longer allocates twenty WAV buffers; preview
  starts faster for long beds.
* **Touchpoints:** `src/lib/engine.ts`, `src/lib/playback.ts`, `src/components/GrimoireRail.tsx`,
  `src/components/CompareDialog.tsx`, `src-tauri/tauri.conf.json` (asset scope).

### PQ-43: An undo stack of operations, not of whole WAV files

* **Type / Impact / Effort:** Perf / Medium / M
* **Problem:** `editStack: ArrayBuffer[]` (`Studio.tsx:199`) pushes the full previous WAV on
  every Shape edit and is uncapped. Ten edits on a 60 s clip hold ~110 MB of history; on a
  380 s bed, ~670 MB.
* **Proposed change:** Store the source buffer once plus a list of edit operations
  (`{ kind: 'fade', ... }`); undo re-applies the list from the source. With PQ-17 the replay
  runs in float and is fast; with PQ-44 it runs off the main thread. Cap history at 50
  operations.
* **Verification:** Heap growth across twenty edits is flat.
* **Touchpoints:** `src/components/Studio.tsx`, `src/lib/audioEdit.ts`.

### PQ-44: Move DSP off the main thread

* **Type / Impact / Effort:** Perf / Medium / L
* **Problem:** Resampling, pitch shift, layering, peak computation and export preparation all
  run on the UI thread. A pitch variant set on a 60 s clip, or a browser-side 44.1→48 kHz
  export, freezes the window for seconds with no progress indication.
* **Proposed change:** A `dsp.worker.ts` with a small RPC (`resample`, `pitchShift`, `layer`,
  `peaks`, `quantise`) taking and returning transferable `Float32Array`s; a cancellable
  progress callback for long jobs; the Shape panel shows a spinner rather than hanging.
* **Verification:** Long-task entries (`PerformanceObserver`, > 50 ms) during a variant export
  drop to zero on the main thread.
* **Touchpoints:** `src/lib/audioEdit.ts`, `src/lib/audioExport.ts`, `src/lib/wav.ts`,
  `vite.config.ts` (worker bundling).

### PQ-45: Precompute the Kaiser window in the browser resampler

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `resampleChannel` evaluates `besselI0(beta * sqrt(1 - t²))` — a 24-term series —
  inside the inner tap loop, per tap, per output sample (`src/lib/audioExport.ts:167`). For
  44.1→48 kHz on a 380 s stereo clip that is roughly 18 M × 2 × 32 window evaluations, each
  with its own series loop. The desktop hands resampling to torchaudio, so this bites the
  browser build and anything that later reuses the kernel (PQ-18).
* **Proposed change:** Precompute the window (and the sinc) into a table at a fixed fractional
  resolution (e.g. 1,024 phases × 32 taps) once per ratio; interpolate between phases.
* **Verification:** 10 s stereo resample under 100 ms in the browser; output within −100 dB
  of the current implementation.
* **Touchpoints:** `src/lib/audioExport.ts`.

### PQ-46: Export from the file on disk, not from bytes pushed back out of the webview

* **Type / Impact / Effort:** Perf / Medium / M
* **Problem:** `exportClipFile` and `writeEncodedFile` (`src/lib/engine.ts:403-452`, `:515-553`)
  prepare a WAV in JS, `write_file` it into `%TEMP%`, ask the worker to encode it, then delete
  it. The clip is already a file in the library; the export only needs the path, the trim
  window and the edits.
* **Proposed change:** `engine_encode_audio` accepts `{ sourcePath, trimStart, trimEnd,
  edits? }`; the worker reads, trims, applies edits (it already has the DSP for gain, fades
  and resampling), masters and encodes. Unedited clips never leave the disk. The browser
  build keeps the JS path.
* **Verification:** Exporting a 380 s bed to Opus moves 0 bytes through the IPC.
* **Touchpoints:** `src/lib/engine.ts`, `engine/worker.py` (`cmd_encode_audio`),
  `src-tauri/src/lib.rs`.

### PQ-47: `write_file` and `toArrayBuffer` without the extra copy

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `write_file` does `let bytes = bytes.clone();` before `spawn_blocking`
  (`src-tauri/src/lib.rs:904`), doubling the peak for every write (134 MB for a long clip).
  On the TS side `toArrayBuffer` slices the response into a fresh buffer
  (`src/lib/tauriFs.ts:37-44`).
* **Proposed change:** Take the body by value and move it into the closure; return the
  `Uint8Array`'s own buffer when it is not shared (check `byteOffset === 0 && byteLength ===
  buffer.byteLength`).
* **Verification:** Rust allocation peak during a 67 MB write halves (measure with
  `GetProcessMemoryInfo` in a test or with the Task Manager peak working set).
* **Touchpoints:** `src-tauri/src/lib.rs`, `src/lib/tauriFs.ts`.

### PQ-48: Trim and tag in Rust so long clips never enter JavaScript

* **Type / Impact / Effort:** Perf / Medium / M
* **Problem:** Trim on save is `parseWav` (copy) → slice (copy) → `writeWav` (copy) in JS
  (`src/lib/wav.ts:243-256`), then `write_file`. The Rust side has `hound` and already reads WAV
  headers for the scan.
* **Proposed change:** `trim_wav(path, start_sec, end_sec, dest)` and `tag_wav(path, info)` as
  commands, streaming through `hound` so memory is bounded by a block, not the file.
* **Verification:** Saving a trimmed 380 s bed does not spike the webview's heap.
* **Touchpoints:** `src-tauri/src/lib.rs`, `src/lib/engine.ts`, `src/lib/wav.ts`.

### PQ-49: Stream pack exports instead of holding every clip in memory

* **Type / Impact / Effort:** Perf / Medium / M
* **Problem:** `exportLibraryPack` (`Studio.tsx:1380-1434`) reads every selected clip into
  `files: { buffer }[]` before anything is written; twenty long beds is more than a gigabyte
  of `ArrayBuffer`s in the webview. `zip_files` then `fs::read`s each entry in full again
  (`lib.rs:1006`).
* **Proposed change:** For unedited clips pass paths straight to `zip_files` (the
  `encodedFiles` path in `engine.ts:483-488` already does this for encoded output — make it the
  only path); process edited clips one at a time; show per-file progress; stream entries in
  Rust (PQ-62).
* **Verification:** Pack of twenty 3-minute beds completes with the webview heap flat.
* **Touchpoints:** `src/components/Studio.tsx`, `src/lib/engine.ts`, `src-tauri/src/lib.rs`.

---

## E. Startup and bundle

The production build is one 7.3 MB JavaScript file that the webview must download from the
custom protocol, parse and evaluate before anything paints. Most of that is not code.

### PQ-50: Take 6.6 MB of prompt markdown out of the main bundle

* **Type / Impact / Effort:** Perf / High / M
* **Problem:** `import.meta.glob('../../prompts/**/*.md', { query: '?raw', import: 'default',
  eager: true })` (`src/lib/promptCatalog.ts:168-172`) inlines all 235 markdown files (6.6 MB)
  as string literals into the entry chunk; `dist/index-*.js` is **7,480 KB**. Every launch
  parses 6.6 MB of string literals before the first render, and the strings live in the heap
  for the session whether or not the user ever opens Browse prompts. `loadPromptCatalog()` then
  parses the markdown into objects on first use.
* **Proposed change:** A build step (`scripts/build-catalog.mjs`) that parses the markdown once
  into per-library JSON (`fx.json`, `ambience.json`, `music.json`) under `public/catalog/`;
  `loadPromptCatalog(library)` fetches and caches on demand. The category/subcategory inference
  needs only the titles, so ship a small `catalog-index.json` for that. Keep
  `scripts/rewrite_prompts.py --check` as the source-of-truth guard.
* **Verification:** Entry chunk under 800 KB; time from window show to first paint; catalog
  dialog opens within 300 ms on first use.
* **Touchpoints:** `src/lib/promptCatalog.ts`, `src/components/PromptCatalogDialog.tsx`,
  `vite.config.ts`, `package.json` (build script), `.github/workflows/ci.yml`.

### PQ-51: Lazy-load dialogs, onboarding, Settings and the goblin renderer

* **Type / Impact / Effort:** Perf / High / M
* **Problem:** No `React.lazy` or dynamic component import exists in `src/`. `FirstWatch`
  (onboarding, shown once), `PromptCatalogDialog` (814 lines), `CompareDialog`,
  `HfTokenGuideDialog`, `TrashDialog`, `ClipDetailsDialog`, `SettingsPanel` and the 98 KB
  `goblinBand.ts` canvas renderer (imported unconditionally by `ScrollCanvas`) all ship in the
  entry chunk and are evaluated at startup.
* **Proposed change:** `React.lazy` with `Suspense` for every dialog and for `FirstWatch` and
  `SettingsPanel`; `import('@/lib/goblinBand')` inside `ScrollCanvas` when `targetVisualState`
  first leaves `'hidden'`, with a one-frame fallback.
* **Verification:** Chunk map from PQ-52 shows each as its own file; entry chunk shrinks by
  the sum of their sizes.
* **Touchpoints:** `src/App.tsx`, `src/components/Studio.tsx`, `src/components/ScrollCanvas.tsx`.

### PQ-52: A build configuration that knows about chunks, targets and budgets

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `vite.config.ts` sets no `build.target` (Vite's default is a wide browser range;
  the only target here is WebView2 = current Chromium), no `sourcemap` policy, no
  `manualChunks`, and there is no bundle analyzer, so the 7.3 MB chunk went unnoticed.
  `__BUILD_ID__` defaults to `Date.now()`, so two builds of the same commit differ.
* **Proposed change:** `build.target: 'chrome120'` (or the shipped WebView2 floor),
  `manualChunks` for `react`/`radix`/`lucide`, `rollup-plugin-visualizer` behind
  `ANALYZE=1`, and `BUILD_ID` from the git SHA when available.
* **Verification:** A `stats.html` in `dist/` on demand; PQ-93's budget passes.
* **Touchpoints:** `vite.config.ts`, `package.json`.

### PQ-53: A Rust release profile

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `src-tauri/Cargo.toml` has no `[profile.release]`, so the shipped exe is built
  with Cargo's defaults: no LTO, 16 codegen units, symbols kept, unwinding panics.
* **Proposed change:**

  ```toml
  [profile.release]
  lto = "thin"
  codegen-units = 1
  opt-level = 3
  strip = true
  panic = "abort"
  ```

  Check the rebuild script's `CARGO_TARGET_DIR` cache still warms.
* **Verification:** `thunder-fx.exe` size before/after; cold start to window show.
* **Touchpoints:** `src-tauri/Cargo.toml`, `.cursor/skills/update-desktop-exe/scripts/rebuild-desktop-exe.ps1`.

### PQ-54: Unmount closed dialogs

* **Type / Impact / Effort:** Perf / Low / S
* **Problem:** `<PromptCatalogDialog open={catalogOpen} ... />` and the other dialogs stay
  mounted while closed (`Studio.tsx:1707-1722`), so their hooks run and their state updates on
  every Studio render.
* **Proposed change:** `{catalogOpen && <PromptCatalogDialog .../>}` (Radix animates exit
  through `forceMount` only where wanted); pairs with PQ-51.
* **Verification:** Profiler: closed dialogs do not appear in commits.
* **Touchpoints:** `src/components/Studio.tsx`.

---

## F. Library, metadata and filesystem

### PQ-55: A single-pass library scan with a cache

* **Type / Impact / Effort:** Perf / High / M
* **Problem:** `scan_library_dir` walks the whole tree and opens every WAV on every call
  (`lib.rs:1832-1862`) — once through `hound::WavReader::open` for the duration
  (`:1316`) and again with `File::open` to walk the `LIST` chunk (`:1324-1403`).
  `scan_library_categories` calls `count_wav_files_recursive` per subcategory
  (`:1686`, `:1754`), another full walk each. Entering the Library tab triggers a scan.
* **Proposed change:** One `walkdir` pass that reads the RIFF chunk table once per file
  (`fmt`, `data` size, `LIST`) and aggregates counts per folder as it goes; an in-memory cache
  keyed on `(path, mtime, len)` so an unchanged file costs a `stat`; return the cached list
  immediately and stream changes (PQ-58).
* **Verification:** Scan of a 1,000-clip library: time and `open()` count (Process Monitor)
  before and after; second scan is near-instant.
* **Touchpoints:** `src-tauri/src/lib.rs` (`scan_*`, `clip_from_wav`).

### PQ-56: Atomic, debounced writes for the meta, trash and scope files

* **Type / Impact / Effort:** Reliability / High / S
* **Problem:** `createDiskMetaStore.save` rewrites the whole `thunder-fx-meta.json` on every
  star, rating or tag (`src/lib/clipMetaStore.ts:65-69`) with a plain overwrite; the trash index
  and `allowed-paths.json` (`lib.rs:210-230`, `fs::write`) do the same. A crash or power loss
  mid-write leaves a truncated file. `load()` then swallows the parse error and returns `{}`
  (`clipMetaStore.ts:60-63`), and the *next* rating change overwrites the damaged-but-recoverable
  file with an index containing one clip — every favourite, rating and tag in the library is
  gone with no message.
* **Proposed change:** Write to `<name>.tmp`, `fsync`, rename over the original (a Rust
  `write_file_atomic` command, since rename-over is not available through `write_file`); keep
  one `.bak`; if `load()` fails to parse, keep the raw text aside as `.corrupt-<ts>` and refuse
  to save until the user acknowledges; debounce saves by ~300 ms so a burst of tag edits is
  one write.
* **Verification:** Kill the process during a save loop (test harness) and confirm the file is
  always either the old or the new version; a corrupt file produces a toast and no overwrite.
* **Touchpoints:** `src/lib/clipMetaStore.ts`, `src/lib/trash.ts`, `src-tauri/src/lib.rs`
  (`PathScope::persist`, new command), `src/lib/tauriFs.ts`.

### PQ-57: Trash sweep in the background, on the same volume

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** The 30-day retention sweep runs inside `list()` on the frontend
  (`src/lib/trash.ts:131-142`) — deleting expired entries serially whenever the trash view is
  opened, on the UI thread's await chain. `move_file` falls back to copy+delete across volumes
  (`lib.rs:952-957`), so a library on `D:` with the app on `C:` copies every deleted clip.
* **Proposed change:** A Rust `sweep_trash` task spawned after the window shows; `.trash` is
  always inside the library root (it already is — make the fallback a hard error with a clear
  message instead of a silent copy).
* **Verification:** Opening the trash view with 200 expired entries is instant.
* **Touchpoints:** `src/lib/trash.ts`, `src-tauri/src/lib.rs`.

### PQ-58: Watch the library folder instead of rescanning it

* **Type / Impact / Effort:** Perf / Medium / M
* **Problem:** The only way the app learns about a file that appeared, disappeared or was
  renamed on disk is a full rescan on tab entry. A clip dropped in by Explorer is invisible
  until then; an external delete leaves a card that fails to play.
* **Proposed change:** `notify` watcher on the library root emitting `library-changed` events
  with the affected paths; the frontend splices the list the way the queue already does after
  a generation.
* **Verification:** Drop a WAV into the library folder; a card appears within a second.
* **Touchpoints:** `src-tauri/src/lib.rs`, `src/components/Studio.tsx`.

### PQ-59: A typed clip record filled from the RIFF tags on scan

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** The scan returns `Vec<serde_json::Value>` built with `json!` (`lib.rs:1606-1617`)
  and TS casts it to `Clip[]`. `Clip` requires `seed` and `cfg`; the JSON has neither, so
  scanned clips carry `undefined` where the type says `number`, and `negative`, `preset`,
  `sampler` and `steps` are lost even though the worker embeds them in `ICMT`/`ISFT`.
* **Proposed change:** A `#[derive(Serialize)] struct ClipRecord` with `Option` fields that
  mirror `Clip`; parse the INFO tags the worker writes; PQ-71 generates the TS type from it.
* **Verification:** `scan_library_dir` output validates against the `Clip` schema in a test;
  a scanned clip shows its seed on the waveform clock.
* **Touchpoints:** `src-tauri/src/lib.rs`, `src/lib/types.ts`, `engine/worker.py`
  (`embed_wav_info` field list).

### PQ-60: Prune metadata rows whose audio is gone

* **Type / Impact / Effort:** Health / Low / S
* **Problem:** `forgetMeta` runs on in-app delete, but an external delete or a manual folder
  clean-up leaves orphan rows in `thunder-fx-meta.json` forever.
* **Proposed change:** On each full scan, drop rows whose id is not on disk and not in the
  trash index; log the count.
* **Verification:** Delete a WAV in Explorer, rescan, inspect the meta file.
* **Touchpoints:** `src/lib/clipMeta.ts`, `src/components/Studio.tsx`.

### PQ-61: Cache the IndexedDB connection in the browser build

* **Type / Impact / Effort:** Perf / Low / S
* **Problem:** `createIdbLibrary` calls `openDb()` on every `list`, `getWav`, `save`, `delete`
  (`src/lib/library.ts:120-175`).
* **Proposed change:** One memoised `dbPromise`.
* **Verification:** `npm run dev` library list with 200 mock clips.
* **Touchpoints:** `src/lib/library.ts`.

### PQ-62: Stream zip entries; store compressed audio uncompressed

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `zip_files` reads each entry fully (`std::fs::read`, `lib.rs:1006`) and writes
  it with default Deflate. WAV compresses poorly and slowly; Opus/MP3/FLAC do not compress at
  all, so Deflate is pure CPU for nothing.
* **Proposed change:** `std::io::copy` from a `File` into `start_file`;
  `CompressionMethod::Stored` for audio extensions, Deflate only for `manifest.json`.
* **Verification:** Pack of ten Opus files: time and peak RSS before and after.
* **Touchpoints:** `src-tauri/src/lib.rs` (`write_zip`).

---

## G. Rust shell: process, IPC, permissions

The shell is one 2,247-line `lib.rs`: a hand-rolled process manager for the Python worker,
scoped filesystem commands, WAV scanning, zip, trash and logging. Its structure is sound —
raw-byte IPC, `spawn_blocking` around dialogs and zips, unit tests for the scope logic. The
items here are the gaps around it.

### PQ-63: Allow-list the three commands the UI calls but the ACL omits

* **Type / Impact / Effort:** Reliability / High / S
* **Problem:** `src-tauri/permissions/engine.toml` is the only permission that names app
  commands, and it lists 24 of the 27 registered in `generate_handler!`
  (`lib.rs:1881-1907`). Missing: **`move_file`** (trash and restore, `tauriFs.ts:77`),
  **`reveal_path`** (Reveal in Explorer, `tauriFs.ts:129`), **`set_library_dir`** (custom
  library folder, `engine.ts:148`). `build.rs` is a bare `tauri_build::build()`, so nothing
  generates per-command permissions. Tauri 2 denies any command no capability allows, and
  `trash.ts` never logs its failures, so the error log cannot show whether this is biting.
* **Proposed change:** Add the three identifiers; add a unit test that parses
  `permissions/engine.toml` and diffs it against the `generate_handler!` list so the next new
  command cannot ship un-allowed; route trash failures through `reportError`.
* **Verification:** In the built exe: delete a clip, restore it, Reveal in Explorer, set a
  custom library folder; the new test fails when an identifier is removed.
* **Touchpoints:** `src-tauri/permissions/engine.toml`, `src-tauri/src/lib.rs` (tests),
  `src/lib/trash.ts`.

### PQ-64: Scope-check the scan commands

* **Type / Impact / Effort:** Reliability / High / S
* **Problem:** `read_file`, `write_file`, `copy_file`, `move_file`, `delete_file`, `zip_files`,
  `reveal_path` and `engine_encode_audio` all go through `ensure_allowed`; `scan_library_dir`,
  `scan_library_categories` and `scan_folder_tracks` (`lib.rs:1621-1862`) do not. Any string is
  a walkable directory. `scan_folder_tracks` also infers categories relative to `library_dir()`
  even when scanning an unrelated folder.
* **Proposed change:** `ensure_allowed` on the root before walking, with the same
  picked-folder grant path the other commands use.
* **Verification:** Scope tests gain three cases; scanning `C:\` from devtools is refused.
* **Touchpoints:** `src-tauri/src/lib.rs`.

### PQ-65: A Job Object so an orphaned Python process dies with the app

* **Type / Impact / Effort:** Reliability / High / M
* **Problem:** The child is killed in `Drop` (`lib.rs:38-45`). If the shell is terminated by
  the OS, Task Manager, a crash, or the rebuild script's `Stop-Process`, the Python worker
  survives holding several GB of VRAM until the user finds it. The next launch then spawns a
  second worker beside it.
* **Proposed change:** Create a Win32 Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and
  assign the child at spawn (`windows-sys`); on start-up, also look for a stale
  `thunder-fx` worker by command line and terminate it.
* **Verification:** `taskkill /f` the shell; `nvidia-smi` shows the VRAM released within a
  second.
* **Touchpoints:** `src-tauri/src/lib.rs` (`spawn_engine`).

### PQ-66: Spawn the engine off the IPC thread, and add a ping that never spawns

* **Type / Impact / Effort:** Perf / Medium / S
* **Problem:** `ensure_engine` (venv resolution, process spawn, waiting for the worker's
  import of torch) runs synchronously inside async commands before `run_blocking`
  (e.g. `lib.rs:705-707`), stalling the Tauri runtime for the multi-second cold start. Every
  command including `engine_status` and `engine_cancel` can spawn (`:806-812`), so a status
  poll on an idle app starts Python.
* **Proposed change:** `spawn_blocking(ensure_engine)`; an `engine_ping` command that reports
  `alive` from the atomic without spawning; `engine_cancel` returns immediately when the
  worker is not alive.
* **Verification:** No Python process appears until Load model or Generate is clicked.
* **Touchpoints:** `src-tauri/src/lib.rs`, `src/lib/engine.ts`.

### PQ-67: One progress event, not two

* **Type / Impact / Effort:** Perf / Low / S
* **Problem:** Every progress line is emitted as both `weave-progress` and `scribe-progress`
  (`lib.rs:571-572`), with a clone, and the frontend listens to one of them at a time. The
  progress payload is also hand-parsed field by field (`:549-570`) rather than deserialised.
* **Proposed change:** One `engine-progress` event carrying `phase`; `#[derive(Deserialize)]`
  on the payload.
* **Verification:** Event count per generation halves.
* **Touchpoints:** `src-tauri/src/lib.rs`, `src/lib/engine.ts`.

### PQ-68: A timed-out command cancels the worker and marks it unhealthy

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** On `RecvTimeoutError::Timeout` (`lib.rs:675-681`) the pending id is dropped and
  an error returned, but the worker keeps running the job; its eventual reply has no waiter
  and is discarded, and the next command queues behind the ghost job. The user sees a
  failure, then a mysteriously busy engine (`A generation or model load is already in
  progress` appears 9 times in the log).
* **Proposed change:** On timeout send `cancel`, wait briefly for the ack, and if none comes
  mark the process dead so `ensure_engine` respawns cleanly.
* **Verification:** Simulate a hung worker (mock sleeps) and confirm the next command
  succeeds within one timeout budget.
* **Touchpoints:** `src-tauri/src/lib.rs`.

### PQ-69: Capture the worker's stderr into the error log

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** stderr is `Stdio::inherit()` (`lib.rs:465`) — correct for avoiding a full-pipe
  deadlock, but in the packaged GUI there is no console, so Python tracebacks that do not go
  through the worker's own `_log_error` vanish. The `Pipe write failed: [Errno 22]` entry in
  the log is the worker noticing its stdout is gone, with no context.
* **Proposed change:** Pipe stderr and drain it on its own thread into a ring buffer; flush
  the buffer into the error log when the process exits non-zero or a command fails.
* **Verification:** Kill the worker mid-load; the log shows the last 50 stderr lines.
* **Touchpoints:** `src-tauri/src/lib.rs`.

### PQ-70: Cache the resolved scope roots

* **Type / Impact / Effort:** Perf / Low / S
* **Problem:** `PathScope::roots` rebuilds and normalises the root list on every
  `ensure_allowed` (`lib.rs:233-245`, `:304-328`), which runs per file operation — dozens of
  times during a pack export.
* **Proposed change:** Cache `Arc<[PathBuf]>`, invalidate on grant and `set_library_dir`.
* **Verification:** Micro-benchmark in the existing scope tests.
* **Touchpoints:** `src-tauri/src/lib.rs`.

### PQ-71: One source of truth for the IPC contract

* **Type / Impact / Effort:** Health / High / L
* **Problem:** The request and response shapes exist three times by hand: TS (`EngineMsg`,
  invoke argument objects in `engine.ts`), Rust (`json!` key literals in `engine_generate`,
  `lib.rs:746-804`) and Python (`cmd_*` dict access in `worker.py`). PQ-59 is one symptom of
  the drift; the `encode_ogg`/`encode_audio` alias in the worker is another. Nothing versions
  the JSON-lines protocol.
* **Proposed change:** Rust structs as the source: `tauri-specta` (or `ts-rs`) generates
  `src/lib/ipc.gen.ts`; the same structs serialise to JSON Schema that a small pydantic model
  in the worker validates against; a `v` field on every JSON line, checked on both sides. CI
  fails when the generated file is stale.
* **Verification:** Renaming a field in Rust breaks the TS build and the Python test.
* **Touchpoints:** `src-tauri/src/lib.rs`, `src/lib/engine.ts`, `src/lib/types.ts`,
  `engine/worker.py`, `.github/workflows/ci.yml`.

### PQ-72: Typed errors across the IPC boundary

* **Type / Impact / Effort:** Health / Medium / M
* **Problem:** Every command fails with a `String` via `fail()`, and the frontend
  pattern-matches on message text (`/dispelled|cancelled/i` in `engine.ts:90`) to tell a
  cancellation from a failure.
* **Proposed change:** An `EngineError { code, message, detail? }` enum serialised with a
  stable `code` (`cancelled`, `oom`, `preset-unavailable`, `scope-denied`, `timeout`, …); the
  UI branches on the code and shows the message.
* **Verification:** `reportError` no longer contains a regex.
* **Touchpoints:** `src-tauri/src/lib.rs`, `src/lib/engine.ts`, `engine/worker.py`.

---

## H. Reliability and observability

### PQ-73: Log the reason, one timestamp format, and a level

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** In the user's log every `ERROR Generation failed` is followed by an empty detail
  line — the reason is not recorded. Rust writes `[1788028278]` (unix seconds) and Python
  writes `[2026-08-29T21:31:27]` into the same file, so entries cannot be sorted or correlated
  with the UI clock. Everything is `ERROR`; there is no `WARN`/`INFO`, so progress-level
  context for a failure (preset, checkpoint, seconds, steps, VRAM) is never there when needed.
* **Proposed change:** One `log_line(level, source, message, context)` helper on each side
  producing `ISO-8601 LEVEL [source] message {json-context}`; generation failures carry the
  request summary and the worker's exception text; `format_utc_iso` already exists in
  `lib.rs`.
* **Verification:** Force a failure and read the log: reason and request on one line.
* **Touchpoints:** `src-tauri/src/lib.rs` (`append_error_log`), `engine/worker.py`
  (`_log_error`), `src/lib/engine.ts` (`logClientError`).

### PQ-74: Tests must not write to the user's real error log

* **Type / Impact / Effort:** DX / Medium / S
* **Problem:** `fail()` appends to `%LOCALAPPDATA%\thunder-fx\logs\error.log`, and the Rust
  scope tests exercise failure paths, so every `cargo test` run adds entries such as
  `Path is outside the folders Thunder FX may use: …\Temp\thunder-fx-scope-21564\..\..\secrets.txt`
  to the production log. Thirteen of them are there now.
* **Proposed change:** Resolve the logs directory through one function that honours a
  `THUNDER_FX_LOGS_DIR` override; tests set it to a temp dir (or inject a sink).
* **Verification:** `cargo test` leaves the real log untouched.
* **Touchpoints:** `src-tauri/src/lib.rs`.

### PQ-75: Rotate the error log and buffer its writes

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** Each `fail`/`log_error` opens, appends and closes the file (`lib.rs:342-351`);
  the read side truncates to 400 KB but the file itself grows without bound.
* **Proposed change:** A `Mutex<BufWriter<File>>` flushed on each error but opened once;
  rotate at 2 MB keeping two generations.
* **Verification:** Log a thousand errors in a test; file handle count stays at one.
* **Touchpoints:** `src-tauri/src/lib.rs`.

### PQ-76: A watchdog on the TypeScript side, and scan failures that say so

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** `invoke('engine_generate')` has no client-side timeout; if the Rust budget
  (600–7,200 s) is exceeded, or the event stream stalls, the UI sits in "Generating" with a
  live countdown from `runTiming` that can only report the stall implicitly.
  `scanDiskLibrary` returns `[]` on any error (`engine.ts:169-171`), so a permission problem
  or a missing drive looks exactly like an empty library.
* **Proposed change:** A progress watchdog: no progress event for N × the expected step time
  (from `runTiming.liveStepMs`) surfaces a "stalled" state with Cancel; scan errors bubble to a
  toast with the path.
* **Verification:** Pause the worker (debugger) mid-run; the UI reports a stall within a
  minute.
* **Touchpoints:** `src/lib/engine.ts`, `src/components/Studio.tsx`, `src/lib/runTiming.ts`.

### PQ-77: Nested error boundaries, and no silent catch blocks

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** One `ErrorBoundary` wraps the whole Studio (`src/App.tsx:15-26`), so a render
  error inside a dialog takes down the shell. Failed preview playback
  (`Studio.tsx:607-609`, `GrimoireRail.tsx:442`, `:515`), pointer capture and compare
  playback are swallowed with empty catches.
* **Proposed change:** Boundaries around `PromptCatalogDialog`, `CompareDialog`, `ScrollCanvas`
  and `GrimoireRail`; every `catch` either rethrows, logs via `reportError`, or carries a
  comment saying why silence is right (as `logClientError` already does).
* **Verification:** oxlint `no-empty` on catch blocks turned to `error` passes.
* **Touchpoints:** `src/App.tsx`, `src/components/*.tsx`, `.oxlintrc.json`.

### PQ-78: Aggregate warning toasts during a queue run

* **Type / Impact / Effort:** Reliability / Low / S
* **Problem:** `for (const warning of result.warnings) toast(...)` (`Studio.tsx:947-949`) fires
  per warning per item; a catalog category of long prompts produces a wall of identical
  "over 45 words" toasts.
* **Proposed change:** Collect warnings per run, toast once with a count, list them in the
  run report (BF-16 wants that report anyway).
* **Verification:** Queue ten over-length prompts; one toast.
* **Touchpoints:** `src/components/Studio.tsx`.

### PQ-79: Peak-VRAM telemetry per generation

* **Type / Impact / Effort:** Perf / Low / S
* **Problem:** The VRAM badge reports the current allocation between polls; the number that
  decides whether a preset fits a card is the peak during sampling and decode, which nothing
  records. PQ-04, PQ-05, PQ-08 and PQ-12 all need it to make decisions.
* **Proposed change:** `torch.cuda.reset_peak_memory_stats()` before generate and
  `max_memory_allocated()` after; include `peakVramGb` in the `done` message and in the
  persisted timing sample.
* **Verification:** The README's VRAM column gets measured values.
* **Touchpoints:** `engine/worker.py`, `src/lib/timing.ts`.

### PQ-80: Keep third-party `print` off the JSON-lines channel

* **Type / Impact / Effort:** Reliability / Low / S
* **Problem:** The protocol is stdout. `stable_audio_3/loading_utils.py:22-24` prints on a
  state-dict key mismatch, and any library that prints will corrupt a frame; the Rust reader
  then either drops the line or fails to parse it.
* **Proposed change:** Redirect `sys.stdout` to stderr for the process and write protocol
  lines through a private handle to the real fd 1 (`os.fdopen(os.dup(1))`); the Rust reader
  logs and skips non-JSON lines rather than failing.
* **Verification:** A test that `print`s inside a mocked load still yields a clean `done`.
* **Touchpoints:** `engine/worker.py` (`_emit`), `src-tauri/src/lib.rs` (reader thread).

---

## I. Time estimation

The live, self-correcting estimate landed in `d9bc61d` (`perfBenchmarks.ts` phase model,
`timing.ts` measured model, `runTiming.ts` live tracker). The remaining items are about the
numbers it starts from and about having one of it.

### PQ-81: Reconcile the estimate baselines with the README measurements

* **Type / Impact / Effort:** Reliability / High / S
* **Problem:** `BASELINE_PERF_ESTIMATES.loadMs.fp16 = 12_000` (`src/lib/perfBenchmarks.ts:66`)
  while the README's "Hardware reference benchmarks" table says an FP16 cold load is ~3.5 s on
  NVMe. The README's "Fast Preview 1 s @ 4 steps" is 12.6 s while the phase model predicts
  about 4.8 s. Both cannot be right; a new install shows one number and the README another
  until local samples accumulate.
* **Proposed change:** Re-measure on the reference machine with the timing model's own
  `runMeasurements` output (lead/step/tail), fit the baseline constants from that, and have
  the README table cite the commit and the script that produced it (a `scripts/bench_estimates.py`
  that prints the constants).
* **Verification:** First-run estimate within ±30 % of measured on the reference machine for
  the four README rows.
* **Touchpoints:** `src/lib/perfBenchmarks.ts`, `README.md`, new script.

### PQ-82: Checkpoint and cold-load as features of the timing model

* **Type / Impact / Effort:** Reliability / Medium / S
* **Problem:** Generate samples carry precision, guidance, steps and seconds but not the
  checkpoint; Medium-Base is a heavier model with a different step cost, so Max quality runs
  are averaged into Balanced ones. A first-ever load (download + load) is trimmed as an outlier
  only when enough samples exist.
* **Proposed change:** `model` on every sample and a per-checkpoint measured model;
  `cold: true` on loads that followed a download, excluded from the load estimate.
* **Verification:** Estimates for a Max quality clip stop drifting after a Balanced session.
* **Touchpoints:** `src/lib/timing.ts`, `src/lib/perfBenchmarks.ts`, `src/components/Studio.tsx`.

### PQ-83: One estimator path

* **Type / Impact / Effort:** Health / Medium / S
* **Problem:** `weaveProgress.ts` still carries the pre-`runTiming` blend
  (`estimateRemainingMs` weighted by progress) and a synthetic fill
  `(1 - exp(-elapsed / 14000)) * 88` (`weaveProgress.ts:50`) that moves the bar with no
  evidence. Two estimators can disagree on screen.
* **Proposed change:** `runTiming.liveRemainingMs` is the only source once a run exists;
  before the first event, the historical total; when neither exists, an indeterminate bar,
  never a synthetic curve.
* **Verification:** Grep for `Math.exp` in `weaveProgress.ts` returns nothing.
* **Touchpoints:** `src/lib/weaveProgress.ts`, `src/components/ScrollCanvas.tsx`.

### PQ-84: Re-fit the take-set estimate when batching lands

* **Type / Impact / Effort:** Reliability / Low / S
* **Problem:** Take estimates are `takes × single`, which is right today and wrong the day
  PQ-04 ships.
* **Proposed change:** A `takes` dimension in the phase model; land it in the same change as
  PQ-04.
* **Touchpoints:** `src/lib/perfBenchmarks.ts`, `src/lib/timing.ts`.

---

## J. Code health

### PQ-85: Split the four monoliths

* **Type / Impact / Effort:** Health / Medium / L
* **Problem:** `src-tauri/src/lib.rs` (2,247 lines: engine, scope, scan, zip, trash, log,
  commands), `engine/worker.py` (2,196: load, presets, sampling, master, encode, IPC),
  `GrimoireRail.tsx` (1,142: cards, grouping, pack dialog, multi-play) and
  `PromptCatalogDialog.tsx` (814). Each is the unit of review and of merge conflict for
  anything in its area.
* **Proposed change:** `lib.rs` → `engine.rs`, `scope.rs`, `scan.rs`, `archive.rs`, `log.rs`,
  `commands/`. `worker.py` → `engine/thunder_fx/{ipc,presets,load,generate,master,encode}.py`
  with `worker.py` as the entry (the bundle resource list must follow). `GrimoireRail` →
  `ClipCard`, `LibraryGroups`, `PackExportDialog`, `useLibraryPlayback`.
  `PromptCatalogDialog` → `CatalogTree`, `CatalogSearch`, `useCatalogSelection`. Pure moves
  first, behaviour changes never in the same commit.
* **Verification:** No file over 600 lines; tests unchanged.
* **Touchpoints:** as listed; `tauri.conf.json` `bundle.resources`;
  `.cursor/skills/update-desktop-exe/scripts/rebuild-desktop-exe.ps1` (copies the worker).

### PQ-86: Argument structs instead of `too_many_arguments`

* **Type / Impact / Effort:** Health / Low / S
* **Problem:** `engine_generate` and `engine_encode_audio` carry
  `#[allow(clippy::too_many_arguments)]` (`lib.rs:747`, `:815`) over flat positional argument
  lists mirrored by hand in `engine.ts`.
* **Proposed change:** `#[derive(Deserialize)] struct GenerateArgs` etc.; Tauri deserialises
  the invoke object into it directly. A step on the way to PQ-71.
* **Touchpoints:** `src-tauri/src/lib.rs`, `src/lib/engine.ts`.

### PQ-87: Narrow the broad `except Exception` sites

* **Type / Impact / Effort:** Health / Low / S
* **Problem:** The conditioner move, the high-pass filter (`worker.py:868-869`), the VRAM probe
  and the OOM handler all catch `Exception`. The high-pass one silently ships an un-filtered
  master if torchaudio import fails; the OOM one matches on message text (PQ-07).
* **Proposed change:** Catch the specific types; where a fallback is deliberate, log once at
  `WARN` with the reason (PQ-73).
* **Touchpoints:** `engine/worker.py`.

### PQ-88: Parse 24-bit and float WAV, or refuse them consistently

* **Type / Impact / Effort:** Reliability / Medium / M
* **Problem:** `parseWav` throws on anything but 16-bit (`src/lib/wav.ts:176`) and ignores the
  `fmt` audio-format tag, so a `WAVE_FORMAT_EXTENSIBLE` or float file from a DAW dropped into
  the library either fails late or mis-parses; the Rust scan reads it fine, so it gets a card
  that cannot open. The app's own 24-bit exports cannot be re-opened.
* **Proposed change:** Read the format tag; accept PCM 16/24/32 and IEEE float 32 into a
  float working buffer (PQ-17); reject others at scan time with a visible reason (PQ-59).
* **Verification:** Fixtures for each format in `wav.test.ts`; PQ-92's fuzz cases.
* **Touchpoints:** `src/lib/wav.ts`, `src-tauri/src/lib.rs`.

---

## K. Tooling, tests and CI

### PQ-89: Cut the test suite's wall time

* **Type / Impact / Effort:** DX / Medium / M
* **Problem:** 549 tests take **91.7 s** wall; Vitest's breakdown is environment **261 s**,
  import 48 s, transform 22 s against 147 s of actual tests (aggregated across workers) — the
  suite spends more time standing up jsdom than testing. `Studio.test.tsx` uses real timers
  with `findByRole(..., { timeout: 15000 })` and one 20 s timeout; `playback.test.ts` sleeps on
  real `setTimeout`.
* **Proposed change:** Fake timers and an immediately-resolving mock engine in the Studio
  tests; move any remaining pure-logic specs off jsdom (the `node` default is already in
  place); `pool: 'threads'` with `isolate: false` for the lib project via Vitest workspaces;
  `--reporter=dot` in CI.
* **Verification:** Under 40 s wall locally; environment time under test time.
* **Touchpoints:** `vite.config.ts`, `src/components/Studio.test.tsx`, `src/lib/playback.test.ts`,
  `src/lib/mockEngine.ts`.

### PQ-90: Stop type-checking twice, and cache the native job

* **Type / Impact / Effort:** DX / Low / S
* **Problem:** `build` is `tsc -b && vite build` and CI runs `npm run typecheck` (`tsc -b`) and
  then `npm run build` (`tsc -b` again). The `native` job in `ci.yml` has no `swatinem/rust-cache`
  while `release.yml` does; the Python job installs ruff with pip and no cache.
* **Proposed change:** `build: vite build` in CI after the explicit typecheck (keep the
  combined script for local use under another name); `rust-cache` on `native`; `uv` with
  `setup-uv`'s cache for the Python job.
* **Verification:** CI wall time per job before and after.
* **Touchpoints:** `package.json`, `.github/workflows/ci.yml`.

### PQ-91: Stricter TypeScript, formatted Python, typed Python

* **Type / Impact / Effort:** DX / Medium / M
* **Problem:** `tsconfig.app.json` is `strict` but lacks `noUncheckedIndexedAccess` (the
  codebase compensates with `?? 0` on typed-array reads that can never be undefined —
  which hides real index bugs), `exactOptionalPropertyTypes` and `noImplicitOverride`.
  `ci.yml` notes that `ruff format --check` is not enforced because it would rewrite most of
  `worker.py`. No `mypy`/`pyright` runs over the engine, so the dict-shaped IPC has no type
  checking at all on the Python side.
* **Proposed change:** Turn the three TS flags on one at a time, fixing as they land; a single
  `ruff format` commit followed by `--check` in CI; `pyright --level warning` on `engine/` with
  a `pyproject` config, tightened as PQ-85 splits the file.
* **Verification:** CI green with the new gates.
* **Touchpoints:** `tsconfig.app.json`, `ruff.toml`, `engine/pyproject.toml`,
  `.github/workflows/ci.yml`.

### PQ-92: Close the test gaps, and fuzz the WAV codec

* **Type / Impact / Effort:** DX / Medium / M
* **Problem:** Components with no test file: `ClipDetailsDialog`, `ClipMetaControls`,
  `CompareDialog`, `ErrorBoundary`, `HfTokenGuideDialog`, `LibraryFilterBar`, `TrashDialog`.
  Lib modules without one: `clipMetaStore.ts`, `tauriFs.ts`, `mockEngine.ts`, `utils.ts`.
  `wav.test.ts` is happy-path; nothing feeds `parseWav` a truncated chunk, an odd-sized chunk
  without padding, a declared size past the end of the buffer, or a `LIST` chunk before `fmt`.
  The engine has no test for conditioning reuse, batching, padding, seed parity across
  processes, or export bitrates (all of which PQ-01…PQ-20 need).
* **Proposed change:** One test per listed file at the behaviour level; a `fast-check`
  property suite for `parseWav`/`writeWav` round-trips and malformed input (must throw, never
  hang or read out of bounds); engine unit tests alongside each PQ item in section A.
* **Verification:** Coverage report (PQ-91) shows no untested shipped module.
* **Touchpoints:** `src/**/*.test.ts(x)`, `engine/test_worker.py`.

### PQ-93: A bundle-size budget and a perf regression gate in CI

* **Type / Impact / Effort:** DX / Medium / S
* **Problem:** Nothing in CI would have flagged the 7.3 MB chunk, a 60 fps state update, or a
  10× slower resampler. `perfBenchmarks.test.ts` tests the estimator, not the app.
* **Proposed change:** `size-limit` (or a ten-line script over `dist/`) with a budget per chunk
  after PQ-50/51 land; `vitest bench` cases for `parseWav`, `waveformPeaks`, `resamplePcm`,
  `pitchShiftWav`, `integrated_lufs` (Python side via `pytest-benchmark`) with a stored
  baseline and a 20 % regression threshold; a `--profile` flag on the worker that prints
  lead/step/tail for one fixed seed so engine changes carry a number.
* **Verification:** A deliberate regression fails the PR.
* **Touchpoints:** `package.json`, `.github/workflows/ci.yml`, `src/lib/*.bench.ts`,
  `engine/`.

### PQ-94: A GPU job for the generation-quality tests

* **Type / Impact / Effort:** DX / Low / M
* **Problem:** `engine/test_generation_quality.py` and `scripts/bench_sampler.py` are the only
  guards on what the model actually produces, and they run only when someone remembers to run
  them on a CUDA machine. CI's Python job installs no torch at all.
* **Proposed change:** A `workflow_dispatch` + nightly workflow on a self-hosted Windows
  runner with the GPU (the build machine already has the venv), running the quality ladder
  and PQ-93's engine benchmark, posting metrics as a job summary.
* **Verification:** A green nightly badge; a failing one when PQ-02 is landed without
  re-tuning.
* **Touchpoints:** `.github/workflows/quality-nightly.yml`.

---

## Sequencing

Four waves, each leaving the app shippable. Items inside a wave are independent unless
noted.

1. **Wave 1 — quick wins and stop-the-bleeding** (all S): PQ-01, PQ-02, PQ-07, PQ-19 (label),
   PQ-20, PQ-29, PQ-30, PQ-32, PQ-40, PQ-53, PQ-56, PQ-63, PQ-64, PQ-73, PQ-74, PQ-81.
   Expect: shorter clips 30–60 % faster, no more status timeouts, no data-loss path in the
   meta file, an exe built with a release profile.
2. **Wave 2 — the render loop and the bundle**: PQ-28, PQ-31 (start with `usePlayback` and
   `useWeave`), PQ-34, PQ-38, PQ-41, PQ-50, PQ-51, PQ-52, PQ-54, PQ-67. Expect: an idle app at
   ~0 % CPU, playback with no full-tree renders, an entry chunk under 1 MB.
3. **Wave 3 — fidelity and the data path**: PQ-16, PQ-17 (unblocks PQ-24, PQ-43), PQ-18,
   PQ-19 (real), PQ-21, PQ-23, PQ-42, PQ-45, PQ-46, PQ-47, PQ-48, PQ-55, PQ-59, PQ-62, PQ-88.
   Expect: edits that do not degrade the master, exports that survive a codec, long clips
   that never enter the JS heap twice.
4. **Wave 4 — engine throughput and structure**: PQ-03, PQ-04 (+PQ-84), PQ-05, PQ-06, PQ-08,
   PQ-09, PQ-10, PQ-12, PQ-15, PQ-65, PQ-68, PQ-69, PQ-71, PQ-72, PQ-85, PQ-89…PQ-94, with
   PQ-11 and PQ-14 as spikes whose answers go into `learnings.md`.

Anything in this file that changes how the audio sounds (PQ-01, PQ-02, PQ-16, PQ-17, PQ-18,
PQ-25) lands with an A/B against the previous build recorded in `learnings.md`, the way the
preset work was done.

---

## Done

Delivered items, kept for the record.

| ID | Item | Released |
| :--- | :--- | :--- |
| **PQ-01** | Stop denoising 6 s of padding on every clip | Unreleased (this change) |
| **PQ-02** | Re-enable TF32 and cuDNN autotune after the model constructs | Unreleased (this change) |
| **PQ-19** | Label 24-bit as a 24-bit container (16-bit content) until a float master ships | Unreleased (this change) |
| **PQ-20** | Bitrate and quality controls for Opus, Vorbis and MP3 | Unreleased (this change) |
| **PQ-29** | One progress state object per engine event | Unreleased (this change) |
| **PQ-30** | Stop re-parsing the whole WAV on every Studio render | Unreleased (this change) |
| **PQ-32** | Engine status poll: stop colliding with a busy engine | Unreleased (this change) |
| **PQ-40** | `parseWav` must not copy the PCM | Unreleased (this change) |
| **PQ-56** | Atomic, debounced writes for the meta, trash and scope files | Unreleased (this change) |
| **PQ-63** | Allow-list the three commands the UI calls but the ACL omits | Unreleased (this change) |
| **PQ-64** | Scope-check the scan commands | Unreleased (this change) |
| **PQ-81** | Reconcile the estimate baselines with the README measurements | Unreleased (this change) |
| **PQ-06** | Warm the kernels after load | Unreleased (engine S-wave) |
| **PQ-07** | Make the OOM retry change something, and set the allocator config | Unreleased (engine S-wave) |
| **PQ-08** | Choose chunked decode by free VRAM, not by precision | Unreleased (engine S-wave) |
| **PQ-09** | Vectorise the loudness block loop | Unreleased (engine S-wave) |
| **PQ-10** | Master on the GPU with one device-to-host copy | Unreleased (engine S-wave) |
| **PQ-13** | Progress emit budget, and report the real output length | Unreleased (engine S-wave) |
| **PQ-15** | Seeds: CUDA generator and derived per-take seeds | Unreleased (engine S-wave) |
| **PQ-36** | Debounced search over a precomputed index | Unreleased (frontend/startup S-wave) |
| **PQ-37** | Infer category, subcategory and intensity once, at ingest | Unreleased (JS ingest; RIFF write is PQ-59) |
| **PQ-38** | Pure renders: no `Date.now()` in JSX, no playhead in effect deps | Unreleased (frontend/startup S-wave) |
| **PQ-39** | A memoised `ClipCard` with selection out of the card props | Unreleased (frontend/startup S-wave) |
| **PQ-45** | Precompute the Kaiser window in the browser resampler | Unreleased (frontend/startup S-wave) |
| **PQ-47** | `write_file` and `toArrayBuffer` without the extra copy | Unreleased (TS `toArrayBuffer`; Rust body still clones) |
| **PQ-52** | A build configuration that knows about chunks, targets and budgets | Unreleased (frontend/startup S-wave) |
| **PQ-53** | A Rust release profile | Unreleased (frontend/startup S-wave) |
| **PQ-54** | Unmount closed dialogs | Unreleased (frontend/startup S-wave) |
| **PQ-61** | Cache the IndexedDB connection in the browser build | Unreleased (frontend/startup S-wave) |
| **PQ-62** | Stream zip entries; store compressed audio uncompressed | Unreleased (frontend/startup S-wave) |
| **PQ-21** | Micro-fades at trim points; stereo-aware silence detection | Unreleased (fidelity S-wave) |
| **PQ-22** | Real zero-crossing search; 50 ms loop-crossfade floor | Unreleased (fidelity S-wave) |
| **PQ-23** | Symmetric PCM ↔ float mapping (32768 both ways) | Unreleased (fidelity S-wave) |
| **PQ-24** | TPDF dither on every TypeScript int16 quantisation | Unreleased (fidelity S-wave) |
| **PQ-26** | Pin `soxr`; delete the linear resample fallback | Unreleased (fidelity S-wave) |
| **PQ-57** | Trash sweep in the background, on the same volume | Unreleased (library S-wave) |
| **PQ-59** | A typed clip record filled from the RIFF tags on scan | Unreleased (library S-wave) |
| **PQ-60** | Prune metadata rows whose audio is gone | Unreleased (library S-wave) |
| — | Audio over the IPC as raw bytes instead of base64 | Unreleased (`7f2c8ca`) |
| — | Queues splice new clips instead of rescanning the library | Unreleased (`7f2c8ca`) |
| — | Export resampling through a windowed sinc instead of linear interpolation | Unreleased (`1372510`) |
| — | Live, self-correcting generation estimates from per-step progress | Unreleased (`d9bc61d`) |
