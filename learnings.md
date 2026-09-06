# Learnings & Insights Journal

A continuous journal of learnings, prompt engineering breakthroughs, model behaviors, audio generation techniques, and sound design observations for Thunder FX.

---

## 2026-08-29

- For water dripping from a cave - what worked was specifying the intensity exactly and keeping it simple:
  `water dripping from a cave, 1 time in 10s`

## 2026-09-06

- **Raising steps makes Medium worse, and the architecture says why.** Medium is ARC
  post-trained (`diffusion_objective: "rf_denoiser"` in its `model_config.json`), so
  `sample_diffusion` defaults it to the `pingpong` sampler, which re-injects fresh noise on
  *every* step: `x = (1 - t_next) * denoised + t_next * randn_like(x)`
  (`stable_audio_3/inference/sampling.py:349`). Each extra step is another chance to invent
  detail, not refine it. Stability's own CLI and Gradio defaults for this checkpoint are
  **8 steps at CFG 1**. Steps only converge on a *deterministic* sampler — `euler`
  (`x = x + dt * v`) or `dpmpp`. So the quality dial has to change the **sampler**, never
  just the step count.
- **Negative prompts do nothing at CFG 1.** The DiT skips its whole guidance branch unless
  `cfg_scale != 1.0` (`stable_audio_3/models/dit.py:479`), and Medium is pinned to CFG 1.
  Every negative prompt in the app and the catalog was dead weight. The working substitute is
  the positive control tag `VocalType: Instrumental` — a trained AudioSparx tag, so it steers
  at CFG 1. Real negative prompts need the un-distilled `medium-base` checkpoint at CFG ~7.
- **The trained prompt shape** is visible in `stable_audio_3/interface/reprompt.py`:
  `TrackType: SFX, <desc>. Length: N seconds` and
  `TrackType: Music, VocalType: Instrumental, <desc>. BPM: N. Length: N seconds`.
  Its own `_has_artifacts()` rejects output that lacks the `Length:` suffix or **runs past 45
  words** — a useful hard ceiling, and it lines up with the cave-drip note above: shorter,
  more specific prompts win.
- **`sample_size` must be passed explicitly.** `model.generate()` defaults to 5292032 samples
  (120.0 s) and `_adapt_sample_size` clamps anything longer down to it, so every clip over
  ~114 s came back at 120 s while the model was still conditioned on the full `seconds_total`
  and paced an arrangement it never reached. Pass `model.model_config["sample_size"]`
  (16777216 ≈ 380 s), as Stability's own CLI does.
- **`callback` is the cancel hook.** `StableAudioModel.generate` declares no callback
  parameter — it forwards unknown kwargs into `sample_diffusion`, which passes `callback` to
  every sampler and calls it once per step. Probing the signature for a name finds nothing;
  just pass `callback=`.
- **Deterministic samplers ruin the distilled checkpoint — do not use them on `medium`.**
  Correcting the entry above: "steps only converge on a deterministic sampler" is true in
  general, but it does *not* mean you can swap `pingpong` for `euler`/`dpmpp` on `medium` and
  get a better result. Distillation trains the model **for** pingpong's per-step re-noising.
  Stepping through it with a deterministic solver averages the texture away, and the result is
  audibly muffled — no dynamics, the same sound end to end, "underwater". Confirmed by ear on a
  Max quality take that had fallen back to `dpmpp` at 32 steps.
  **The practical rule: on `medium`, pingpong is the only sampler, and ~8–20 steps is the whole
  usable range. There is no setting on `medium` that beats Balanced.** Real headroom needs
  `medium-base`, which was never distilled and where `euler` at 50 steps and CFG 7 is correct.
  `resolve_preset` now enforces this and `engine/test_quality.py` guards it.
- **`medium-base` facts, confirmed from its own `model_config.json`.** `diffusion_objective:
  rectified_flow` (not `rf_denoiser`), no `training.arc` block — so it genuinely is the
  un-distilled model, and `sample_diffusion` defaults it to `euler` rather than pingpong. Its
  demo config is **50 steps at CFG 2/4/7**, which is exactly what the Max quality preset uses.
  Same 380.4 s / 44.1 kHz / stereo as `medium`. Two practical notes: the repo is **not gated**
  (unlike `medium`, which is `gated=auto`), so no token is needed; but its config points the
  T5Gemma encoder at `stabilityai/stable-audio-3-medium`, so **`medium` must already be
  installed**. Checkpoint alone is 9.22 GB.
- **Guidance strength is per content type — this is the real "different types need different
  optimization" answer.** Sweeping CFG 1/2/4/7 on `medium-base` against a Balanced baseline:
  a door slam was brightest at CFG 4–7 (+3% to +17% spectral centroid), while a rain bed went
  the opposite way — +24% centroid and **+84% high-band energy at CFG 2**, down to −9% by CFG 7,
  where it also lost most of its level movement. **More guidance sharpens a one-shot and dulls
  a bed.** So Max quality runs CFG 4 for SFX and CFG 2 for ambience.
  Instrumental was the surprise: **no CFG beat Balanced.** `medium-base` measured −38% to −51%
  centroid and −29% to −44% high-band at *every* setting, so Max quality keeps music on
  `medium`. A "better" model is not better for every kind of material.
- **A stale model reference reads exactly like a quality regression.** Two runs of the
  identical ambience configuration disagreed wildly (centroid 4456 vs 2317) while a different
  case reproduced bit-identically — which is the tell: generation *is* deterministic here, so
  the difference had to be in the harness. `_try_load_model` swaps `_model` and drops the old
  reference, but a caller holding its own `model` variable keeps the previous checkpoint alive,
  so any call that did not itself trigger a swap silently generated on the wrong model. Euler on
  the distilled checkpoint produces precisely the muffled, flat signature being hunted, so the
  bug impersonated the bug. **After any possible checkpoint swap, re-read `w._model`; never
  reuse a model reference across one.** Bit-identical reproduction elsewhere in the same run is
  the fastest way to tell a harness fault from a real regression.
- **Judge a setting on combinations of measures, not one at a time.** Single-measure gates both
  cried wolf (a one-shot's level spread swings 30 dB into its own silence) and missed a real
  collapse (brightness lost against too loose an absolute gate). `audio_metrics.verdict()` now
  fails on brightness loss *or* variety loss on their own, but only fails a level measure when
  its partner falls with it — which reproduces every hand-checked call across 16 configurations.
- **Never silently substitute a configuration the user did not ask for.** The deterministic
  sampler above only reached anyone because "Max quality" *fell back* to it when the
  `medium-base` checkpoint was missing. The audio just came out worse, with nothing saying
  why — the substitution was the reason the regression was hard to trace, more than the
  sampler choice itself. `resolve_preset` now raises `PresetUnavailable` with advice
  (download it, or switch to Balanced) and the UI disables Generate with the reason shown.
  There is no fallback left anywhere in the preset system.
- **Measures that catch this kind of collapse** (in `engine/audio_metrics.py`): crest factor and
  block-level spread for "no dynamics", spectral centroid and >8 kHz share for "underwater",
  and normalised frame-to-frame spectral flux for "sounds the same all the way through".
  `engine/test_generation_quality.py` uses them to fail a preset that degrades the audio.
