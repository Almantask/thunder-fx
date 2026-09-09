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
- **General rules for instrumental prompts, and the three sources they come from.** In order of
  authority: (1) **Stability's own rewriter, shipped in the venv** —
  `stable_audio_3/interface/reprompt.py`. Its `SYSTEM_PROMPTS["Music"]` is the template the
  rewriter was instructed to emit, and its `_has_artifacts()` is a literal reject list, so this
  is spec rather than folklore. (2) The **official prompt guide**
  (`Stability-AI/stable-audio-3/docs/guides/prompting.md`, mirrored at
  stability.ai/guides/stable-audio-3-prompt-guide) — AudioSparx tags, "prompt adherence and audio
  quality are closely linked with the dataset the model was trained on", and the note that
  durations should fit what you describe. (3) The **`medium-base` model card** plus the community
  ComfyUI workflow (`adamdived/stable-audio-3-workflow`) for the settings split: base = euler,
  50+ steps, CFG 7; distilled = pingpong, 8-20 steps, CFG 1.
- **The trained shape, in full.** `TrackType: Music, VocalType: Instrumental, <genre/style> with
  <main instruments>, <supporting layers>, and <rhythm/percussion> creating <mood/energy>.
  BPM: N. Length: N seconds` — steps 1-8 of the `Music` system prompt. One fluid sentence, no
  semicolons ("Avoid semicolons" is in the instruction text).
- **Lead with a genre or style word, never a scene label.** "boss", "combat", "puzzle" are not
  musical styles and the text encoder has nothing to map them to; "dark ambient orchestral" and
  "epic hybrid orchestral" do. Step 1 of the template is Genre and the guide's ordering is
  Genre -> instruments -> mood -> production.
- **Always emit a BPM, including for beds with no pulse.** Prose like "no perceivable tempo" is
  not a trained control; BPM is. Stability's own ambient examples carry one anyway —
  `Dreamy ambient soundscape ... BPM: 40` and `Ambient drone motif loop. BPM: 60`. Use 40-60 for
  a still bed rather than dropping the tag.
- **Four hard rejects, straight from `_has_artifacts()`:** more than **45 words**; any of
  `[ ] * #`; a missing `. Length: N seconds` suffix; and the vocal regex
  `vocals?|singing|singer|female|male|voice|voices|chorus|rap|rapper|chant(ing)?|lyrics?`.
  Note what survives it: `wordless choir pad` is fine, `chanting choir` and `singing solo violin`
  are not — and on `medium-base` at CFG 7 those fight `VocalType: Instrumental` much harder than
  they do at CFG 1.
- **Name instruments and include a rhythm or percussion element.** Steps 2-4 of the template are
  main instruments, supporting layers, *and* rhythm/percussion. A prompt of pure mood adjectives
  gives guidance nothing concrete to amplify.
- **Every word should have an acoustic referent.** Scene and roleplay prose ("the biggest lock in
  the kingdom meets the best picks") spends the 45-word budget on tokens the encoder cannot
  render, and CFG amplifies whatever is in the conditioning — so on `medium-base` junk gets
  amplified too. Same for pseudo-instructions the model has no control for: `looping-friendly`,
  `steady texture with no ending`. Say it acoustically instead — sustained drone, no build, no
  cadence — or via a low BPM.
- **Fit the duration to the description.** The `Music` system prompt's own bands are
  energetic/dance 120-180 s, pop/rock 180-210 s, cinematic/ambient 240-300 s, and the guide adds
  that results are better when the duration matches what is being described. Reaching for the
  380 s ceiling is not free.
- **Write the negative per cue, or not at all.** It is dead weight on `medium` (CFG 1) and the
  *only* field that gains power on `medium-base`, so a shared boilerplate block wastes exactly
  the checkpoint it was written for. List only failure modes this prompt could actually produce,
  and never list something the positive asks for — `light frame drum` against a `drums` negative,
  or `deep choirs of brass` against `choir`, just makes the two halves fight.
- **Prompt text is the unit of uniqueness.** Generation is deterministic here, so two cues whose
  text differs only by a swapped scene noun are the same audio at the same seed. Vary the
  instrumentation, not the label.
- **Watch the descriptor balance before blaming the checkpoint.** A library that runs heavily
  toward `soft / hushed / muted / low / drone` will measure dark on `medium-base` because CFG
  amplifies that conditioning — which is a plausible confound for the "instrumental measured
  -38% to -51% centroid" result above. Re-test with genre-forward prompts before concluding a
  checkpoint is worse for a whole content type.
