#!/usr/bin/env python3
"""Raising the quality preset must not make the audio worse.

This is the regression guard for a real failure: "Max quality" once switched the
distilled checkpoint onto a deterministic sampler, which collapsed output toward
a dull, flat, uniform bed -- audibly underwater, with no dynamics and the same
texture from end to end.

It generates the same prompt and seed at each preset and asserts the higher
preset never loses dynamics, brightness or variety beyond the tolerances in
engine/audio_metrics.py.

Needs a real CUDA model, so it skips under THUNDER_FX_MOCK_ENGINE and on a
machine without the weights. Run it directly:

    engine\\.venv\\Scripts\\python.exe -m unittest engine.test_generation_quality -v
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

# Short clips: this has to be runnable, not just theoretically runnable.
CASES = [
    ("sfx", 3.0, "heavy oak door slamming shut in a stone hall, close mic, short decay"),
    ("ambience", 8.0, "heavy rain on a metal roof, distant thunder, steady bed, looping-friendly"),
    ("music", 8.0, "dark orchestral tension, low brass swells, quiet string ostinato, 60 BPM"),
]
SEED = 4242
# Escalating order: each is compared against the one before it.
LADDER = ["speed", "balanced", "quality"]


def _model_or_skip(case: unittest.TestCase):
    if os.environ.get("THUNDER_FX_MOCK_ENGINE", "").strip() in {"1", "true", "TRUE", "yes"}:
        case.skipTest("mock engine: no real audio to measure")
    try:
        import torch
    except ImportError:
        case.skipTest("torch is not installed")
    if not torch.cuda.is_available():
        case.skipTest("no CUDA device")

    import worker as w

    model = w._try_load_model("fp16")
    if model is None:
        case.skipTest("model unavailable")
    return model


class QualityLadderTests(unittest.TestCase):
    """Each step up the preset ladder must hold its ground on every measure."""

    model = None

    @classmethod
    def setUpClass(cls) -> None:
        cls.model = None

    def _generate(self, model, mode: str, seconds: float, text: str, preset: str) -> dict:
        import audio_metrics
        import worker as w

        plan = w.resolve_preset(preset, mode=mode, strict=False)
        if plan["model"] != w._model_name:
            w._try_load_model(w._model_precision, plan["model"])
        # Always read the module global rather than the argument. The caller's
        # reference keeps the previous checkpoint alive after a swap, so reusing
        # it silently generated on the wrong model whenever this call did not
        # itself trigger the load -- which read exactly like a quality collapse.
        model = w._model
        audio = model.generate(
            prompt=w.normalize_prompt(text, mode=mode, seconds=seconds),
            duration=seconds,
            steps=plan["steps"],
            seed=SEED,
            cfg_scale=plan["cfg"],
            sample_size=int(model.model_config["sample_size"]),
            sampler_type=plan["sampler"],
            chunked_decode=True,
        )
        wav = w._master_audio_cpu(w._to_stereo_cpu(audio), mode)
        return audio_metrics.describe(wav)

    def test_raising_the_preset_never_degrades_the_audio(self) -> None:
        import audio_metrics
        import worker as w

        model = _model_or_skip(self)

        # A preset whose checkpoint is not installed refuses to generate, so
        # there is nothing to measure -- compare the ones that can run.
        # Max quality is per-mode now, so a preset is comparable only when every
        # mode it covers can actually run.
        runnable = [
            name for name in LADDER
            if not any(
                w.resolve_preset(name, mode=m, strict=False)["unavailable"]
                for m, _s, _t in CASES
            )
        ]
        skipped = [name for name in LADDER if name not in runnable]
        if skipped:
            print(f"\n  not installed, so not compared: {', '.join(skipped)}", flush=True)

        # Preset-major, not mode-major: presets can straddle the medium /
        # medium-base boundary, and swapping checkpoints is an unload plus a
        # multi-gigabyte load. Grouping by preset keeps that to one swap each.
        measured: dict[tuple[str, str], dict] = {}
        for preset in runnable:
            print(f"\n  {preset}", flush=True)
            print(
                f"    {'mode':10s} {'crest':>7} {'spread':>7} {'centroid':>9} "
                f"{'hi>8k':>7} {'flux':>7}",
                flush=True,
            )
            for mode, seconds, text in CASES:
                with self.subTest(preset=preset, mode=mode):
                    plan = w.resolve_preset(preset, mode=mode, strict=False)
                    m = self._generate(model, mode, seconds, text, preset)
                    measured[(mode, preset)] = m
                    print(
                        f"    {mode:10s} {m['crest_db']:7.2f} {m['level_spread_db']:7.2f} "
                        f"{m['centroid_hz']:9.0f} {m['high_ratio']:7.4f} {m['flux']:7.4f}  "
                        f"({plan['model']}, {plan['sampler']}, {plan['steps']}st, cfg {plan['cfg']})",
                        flush=True,
                    )

        for mode, _seconds, _text in CASES:
            for lower, higher in zip(runnable, runnable[1:]):
                with self.subTest(mode=mode, step=f"{lower} -> {higher}"):
                    problems = audio_metrics.verdict(
                        measured[(mode, lower)], measured[(mode, higher)]
                    )
                    low = w.resolve_preset(lower, mode=mode, strict=False)
                    high = w.resolve_preset(higher, mode=mode, strict=False)
                    self.assertEqual(
                        problems,
                        [],
                        f"{mode}: moving from {lower} to {higher} made the audio worse "
                        f"({low['sampler']}@{low['steps']} on {low['model']} -> "
                        f"{high['sampler']}@{high['steps']} on {high['model']}): "
                        + "; ".join(problems),
                    )

    def test_no_preset_puts_a_deterministic_sampler_on_the_distilled_model(self) -> None:
        """The exact configuration that caused the collapse.

        `medium` is ARC-distilled and trained to be sampled with pingpong, whose
        per-step re-noising is what keeps the texture alive. Running a
        deterministic solver over it averages that away. Deterministic samplers
        belong on `medium-base`, which was never distilled.
        """
        import worker as w

        for name in (*w.PRESETS, w.CUSTOM_PRESET):
            for available in (True, False):
                for mode in (None, "sfx", "ambience", "music"):
                    plan = w.resolve_preset(
                        name, mode=mode, base_available=available, strict=False
                    )
                    if plan["model"] == w.DEFAULT_MODEL:
                        with self.subTest(preset=name, base=available, mode=mode):
                            self.assertEqual(
                                plan["sampler"],
                                "pingpong",
                                f"preset {name!r} runs {plan['sampler']} on the distilled "
                                f"{plan['model']} checkpoint",
                            )


if __name__ == "__main__":
    unittest.main()
