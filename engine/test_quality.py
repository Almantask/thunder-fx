#!/usr/bin/env python3
"""Audio-quality tests: prompt shape, quality presets, loudness, looping."""

from __future__ import annotations

import math
import sys
import tempfile
import unittest
import wave
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))


def _require_torch(case: unittest.TestCase):
    try:
        import torch
        import torchaudio  # noqa: F401
    except ImportError:
        case.skipTest("torch/torchaudio are not installed")
    return torch


def _sine(peak_dbfs: float, seconds: float = 5.0, freq: float = 1000.0):
    import torch

    from worker import SAMPLE_RATE

    amp = 10 ** (peak_dbfs / 20.0)
    t = torch.arange(int(SAMPLE_RATE * seconds), dtype=torch.float32) / SAMPLE_RATE
    row = amp * torch.sin(2 * math.pi * freq * t)
    return torch.stack([row, row])


class NormalizePromptTests(unittest.TestCase):
    """The shape Stability's own rewriter emits (interface/reprompt.py)."""

    def test_appends_canonical_length(self) -> None:
        from worker import normalize_prompt

        out = normalize_prompt("oak door opening, close mic", mode="sfx", seconds=2)
        self.assertEqual(
            out, "TrackType: SFX, oak door opening, close mic. Length: 2 seconds"
        )

    def test_sub_second_rounds_up_to_a_singular_second(self) -> None:
        from worker import normalize_prompt

        out = normalize_prompt("UI click", mode="sfx", seconds=0.5)
        self.assertTrue(out.endswith("Length: 1 second"), out)

    def test_music_gains_vocaltype_and_lifts_an_inline_bpm(self) -> None:
        from worker import normalize_prompt

        out = normalize_prompt(
            "TrackType: Music, instrumental, dark orchestral tension, 60 BPM, looping-friendly",
            mode="music",
            seconds=90,
        )
        self.assertTrue(out.startswith("TrackType: Music, VocalType: Instrumental, "), out)
        self.assertNotIn("60 BPM,", out)
        self.assertIn(". BPM: 60.", out)
        self.assertTrue(out.endswith("Length: 90 seconds"), out)

    def test_does_not_invent_a_bpm(self) -> None:
        from worker import normalize_prompt

        out = normalize_prompt(
            "TrackType: Music, canopy rain, no perceivable tempo",
            mode="music",
            seconds=120,
        )
        self.assertNotIn("BPM:", out)
        self.assertIn("no perceivable tempo", out)

    def test_idempotent_and_retargets_the_length(self) -> None:
        from worker import normalize_prompt

        once = normalize_prompt("forest birdsong, steady bed", mode="ambience", seconds=90)
        self.assertEqual(normalize_prompt(once, mode="ambience", seconds=90), once)
        # Moving the duration slider must rewrite the tag, not stack a second.
        retimed = normalize_prompt(once, mode="ambience", seconds=30)
        self.assertEqual(retimed.count("Length:"), 1)
        self.assertTrue(retimed.endswith("Length: 30 seconds"), retimed)

    def test_rewrites_a_mismatched_track_type(self) -> None:
        from worker import normalize_prompt

        out = normalize_prompt("TrackType: Music, a door slam", mode="sfx", seconds=2)
        self.assertTrue(out.startswith("TrackType: SFX, "), out)
        self.assertNotIn("Music", out)

    def test_word_limit_matches_stability_own_threshold(self) -> None:
        from worker import PROMPT_WORD_LIMIT, prompt_word_count

        self.assertEqual(PROMPT_WORD_LIMIT, 45)
        self.assertEqual(prompt_word_count("one two three"), 3)


class PresetTests(unittest.TestCase):
    def test_speed_and_balanced_stay_on_medium(self) -> None:
        from worker import resolve_preset

        speed = resolve_preset("speed", base_available=False)
        self.assertEqual(
            (speed["model"], speed["sampler"], speed["steps"]), ("medium", "pingpong", 8)
        )
        balanced = resolve_preset("balanced", base_available=False)
        self.assertEqual(balanced["steps"], 20)
        self.assertEqual(balanced["cfg"], 1.0)

    def test_quality_uses_the_base_checkpoint_with_real_cfg(self) -> None:
        from worker import resolve_preset

        plan = resolve_preset("quality", mode="sfx", base_available=True)
        self.assertEqual(plan["model"], "medium-base")
        self.assertEqual(plan["sampler"], "euler")
        self.assertGreater(plan["cfg"], 1.0)
        self.assertFalse(plan["unavailable"])

    def test_guidance_strength_is_chosen_per_content_type(self) -> None:
        from worker import QUALITY_BY_MODE, resolve_preset

        # Measured: more guidance sharpens a one-shot and dulls a bed, so a rain
        # bed wants materially less of it than a door slam.
        sfx = resolve_preset("quality", mode="sfx", base_available=True)
        ambience = resolve_preset("quality", mode="ambience", base_available=True)
        self.assertGreater(sfx["cfg"], ambience["cfg"])
        self.assertGreater(ambience["cfg"], 1.0, "guidance off would disable negatives too")
        for mode, spec in QUALITY_BY_MODE.items():
            with self.subTest(mode=mode):
                self.assertEqual(resolve_preset("quality", mode=mode)["cfg"], spec["cfg"])

    def test_instrumental_stays_on_the_checkpoint_that_measured_better(self) -> None:
        from worker import DEFAULT_MODEL, PRESETS, resolve_preset

        # No CFG tested beat Balanced for music -- medium-base came out darker
        # and less varied at every setting -- so Max quality does not pretend.
        for available in (True, False):
            with self.subTest(base_available=available):
                plan = resolve_preset("quality", mode="music", base_available=available)
                self.assertEqual(plan["model"], DEFAULT_MODEL)
                self.assertEqual(plan["sampler"], PRESETS["balanced"]["sampler"])
                self.assertEqual(plan["steps"], PRESETS["balanced"]["steps"])
                # And because it needs no extra checkpoint, it never refuses.
                self.assertFalse(plan["unavailable"])

    def test_quality_without_its_checkpoint_refuses_instead_of_substituting(self) -> None:
        from worker import PresetUnavailable, resolve_preset

        # Substituting is what hid the problem: the take just came out worse and
        # nothing said why. It now fails before any GPU work happens.
        with self.assertRaises(PresetUnavailable) as caught:
            resolve_preset("quality", mode="sfx", base_available=False)
        advice = str(caught.exception)
        self.assertIn("Max quality", advice)
        self.assertIn("medium-base", advice)
        self.assertIn("Settings", advice)
        self.assertIn("Balanced", advice)

    def test_an_unavailable_preset_can_still_be_inspected(self) -> None:
        from worker import BASE_MODEL, resolve_preset

        # Non-strict resolution is for callers that only want to describe the
        # preset -- warmup, the UI. It reports the real plan plus the flag, and
        # still never turns into a different preset.
        plan = resolve_preset("quality", mode="sfx", base_available=False, strict=False)
        self.assertTrue(plan["unavailable"])
        self.assertEqual(plan["model"], BASE_MODEL)
        self.assertEqual(plan["sampler"], "euler")
        self.assertEqual(plan["steps"], 50)

    def test_presets_that_run_on_medium_are_never_unavailable(self) -> None:
        from worker import CUSTOM_PRESET, resolve_preset

        for name in ("speed", "balanced", CUSTOM_PRESET):
            with self.subTest(preset=name):
                self.assertFalse(resolve_preset(name, base_available=False)["unavailable"])

    def test_no_deterministic_sampler_ever_reaches_the_distilled_model(self) -> None:
        """The regression that made "Max quality" sound underwater.

        `medium` is ARC-distilled and its texture depends on pingpong re-noising
        at every step. Running a deterministic solver over it averages that away:
        dull, flat, and the same all the way through. Deterministic samplers are
        only ever valid on the un-distilled `medium-base`.
        """
        from worker import CUSTOM_PRESET, DEFAULT_MODEL, DETERMINISTIC_SAMPLERS, PRESETS, resolve_preset

        for name in (*PRESETS, CUSTOM_PRESET, "nonsense"):
            for available in (True, False):
                for requested in (None, *DETERMINISTIC_SAMPLERS):
                    plan = resolve_preset(
                        name,
                        sampler_override=requested,
                        base_available=available,
                        strict=False,
                    )
                    if plan["model"] == DEFAULT_MODEL:
                        with self.subTest(preset=name, base=available, asked=requested):
                            self.assertNotIn(
                                plan["sampler"],
                                DETERMINISTIC_SAMPLERS,
                                f"{name!r} put {plan['sampler']} on the distilled checkpoint",
                            )

    def test_deterministic_sampling_is_allowed_on_the_base_checkpoint(self) -> None:
        from worker import BASE_MODEL, resolve_preset

        plan = resolve_preset("quality", base_available=True)
        self.assertEqual(plan["model"], BASE_MODEL)
        # medium-base was never distilled, so a deterministic solver is correct
        # there and its extra steps genuinely converge.
        self.assertEqual(plan["sampler"], "euler")

    def test_cfg_is_pinned_on_the_distilled_checkpoint(self) -> None:
        from worker import clamp_cfg

        self.assertEqual(clamp_cfg(7.0, "medium"), 1.0)
        self.assertEqual(clamp_cfg(7.0, "medium-base"), 7.0)

    def test_custom_preset_honours_steps(self) -> None:
        from worker import resolve_preset

        plan = resolve_preset("custom", steps_override=42)
        self.assertEqual(plan["steps"], 42)
        self.assertEqual(plan["preset"], "custom")

    def test_custom_cannot_opt_into_a_degraded_sampler(self) -> None:
        from worker import resolve_preset

        # Custom runs on the distilled checkpoint, so a deterministic sampler is
        # coerced back to pingpong rather than quietly ruining the take.
        plan = resolve_preset("custom", steps_override=42, sampler_override="euler")
        self.assertEqual(plan["sampler"], "pingpong")
        self.assertEqual(plan["steps"], 42)

    def test_custom_rejects_an_unknown_sampler(self) -> None:
        from worker import resolve_preset

        plan = resolve_preset("custom", sampler_override="nope")
        self.assertEqual(plan["sampler"], "pingpong")

    def test_unknown_preset_falls_back_to_the_default(self) -> None:
        from worker import DEFAULT_PRESET, resolve_preset

        self.assertEqual(
            resolve_preset("nonsense", base_available=False)["preset"], DEFAULT_PRESET
        )


class LoudnessTests(unittest.TestCase):
    def setUp(self) -> None:
        _require_torch(self)

    def test_matches_the_ebu_tech_3341_reference(self) -> None:
        from worker import integrated_lufs

        # EBU Tech 3341 case 1: a 1 kHz stereo sine at -23 dBFS reads -23.0 LUFS.
        self.assertAlmostEqual(integrated_lufs(_sine(-23.0)), -23.0, delta=0.1)

    def test_is_linear_in_gain(self) -> None:
        from worker import integrated_lufs

        quiet = integrated_lufs(_sine(-30.0))
        loud = integrated_lufs(_sine(-23.98))
        self.assertAlmostEqual(loud - quiet, 6.02, delta=0.05)

    def test_gate_ignores_trailing_silence(self) -> None:
        import torch

        from worker import SAMPLE_RATE, integrated_lufs

        tone = _sine(-20.0)
        padded = torch.cat([tone, torch.zeros(2, SAMPLE_RATE * 10)], dim=-1)
        self.assertAlmostEqual(integrated_lufs(tone), integrated_lufs(padded), delta=0.5)

    def test_beds_hit_their_loudness_target(self) -> None:
        from worker import LOUDNESS_TARGETS, _master_audio_cpu, integrated_lufs

        for mode, target in LOUDNESS_TARGETS.items():
            with self.subTest(mode=mode):
                out = _master_audio_cpu(_sine(-35.0), mode)
                self.assertAlmostEqual(integrated_lufs(out), target, delta=0.5)

    def test_one_shots_normalise_the_peak_in_both_directions(self) -> None:
        from worker import TARGET_PEAK, _master_audio_cpu

        for level in (-35.0, -0.1):
            with self.subTest(level=level):
                out = _master_audio_cpu(_sine(level), "sfx")
                self.assertAlmostEqual(float(out.abs().max()), TARGET_PEAK, delta=0.01)
        self.assertAlmostEqual(20 * math.log10(TARGET_PEAK), -1.0, delta=0.01)

    def test_near_silence_is_left_alone(self) -> None:
        from worker import _master_audio_cpu

        # Amplifying pure decode noise to the ceiling is worse than staying quiet.
        out = _master_audio_cpu(_sine(-80.0), "sfx")
        self.assertLess(float(out.abs().max()), 1e-3)

    def test_peak_ceiling_wins_over_the_loudness_target(self) -> None:
        from worker import TARGET_PEAK, _master_audio_cpu

        out = _master_audio_cpu(_sine(-1.0), "music")
        self.assertLessEqual(float(out.abs().max()), TARGET_PEAK + 1e-6)

    def test_dither_leaves_digital_silence_alone(self) -> None:
        import torch

        from worker import _quantize_pcm16

        wav = torch.zeros(2, 4096)
        self.assertEqual(int(_quantize_pcm16(wav).abs().max()), 0)

    def test_dither_is_applied_to_signal(self) -> None:
        import torch

        from worker import _quantize_pcm16

        # A constant half-LSB would quantize identically every sample without
        # dither; with it the error decorrelates and both neighbours appear.
        wav = torch.full((2, 8192), 0.5 / 32767.0)
        values = set(_quantize_pcm16(wav).flatten().tolist())
        self.assertTrue(len(values) > 1, values)


class SeamlessLoopTensorTests(unittest.TestCase):
    def setUp(self) -> None:
        _require_torch(self)

    def test_keeps_length_and_closes_the_wrap_gap(self) -> None:
        import torch

        from worker import SAMPLE_RATE, _make_seamless_loop_tensor

        # A tone whose period does not divide the clip length, so the raw wrap
        # from last sample back to first is an audible discontinuity.
        n = int(SAMPLE_RATE * 5.0)
        t = torch.arange(n, dtype=torch.float32) / SAMPLE_RATE
        row = 0.5 * torch.sin(2 * math.pi * 317.0 * t)
        wav = torch.stack([row, row])

        fade_sec = 1.0
        looped = _make_seamless_loop_tensor(wav, fade_sec)
        fade = int(round(fade_sec * SAMPLE_RATE))
        self.assertEqual(int(looped.shape[-1]), n - fade)

        def wrap_gap(x) -> float:
            return abs(float(x[0, 0]) - float(x[0, -1]))

        self.assertLess(wrap_gap(looped), wrap_gap(wav))

    def test_join_lands_near_a_zero_crossing(self) -> None:
        import torch

        from worker import SAMPLE_RATE, _make_seamless_loop_tensor

        n = int(SAMPLE_RATE * 4.0)
        t = torch.arange(n, dtype=torch.float32) / SAMPLE_RATE
        row = 0.8 * torch.sin(2 * math.pi * 220.0 * t + 1.1)
        wav = torch.stack([row, row])
        looped = _make_seamless_loop_tensor(wav, 1.0)
        # The head of the crossfade is picked at minimum amplitude, so the first
        # sample starts near zero rather than mid-swing.
        self.assertLess(abs(float(looped[0, 0])), abs(float(wav[0, 0])))

    def test_clip_too_short_to_crossfade_passes_through(self) -> None:
        import torch

        from worker import _make_seamless_loop_tensor

        # Below fade * 2 + 1 samples there is nothing left to fade between, so
        # the clip comes back untouched rather than shrinking to nothing.
        wav = torch.zeros(2, 4)
        self.assertEqual(int(_make_seamless_loop_tensor(wav, 1.0).shape[-1]), 4)

    def test_output_length_is_input_minus_the_fade(self) -> None:
        import torch

        from worker import _make_seamless_loop_tensor

        # The caller generates `duration + overlap` and relies on the crossfade
        # consuming exactly the overlap, so the file matches what was asked for.
        wav = torch.zeros(2, 300)
        self.assertEqual(int(_make_seamless_loop_tensor(wav, 1.0).shape[-1]), 300 - 100)


class SaveOrderTests(unittest.TestCase):
    def test_crossfade_cannot_push_the_file_over_the_ceiling(self) -> None:
        torch = _require_torch(self)

        from worker import SAMPLE_RATE, TARGET_PEAK, _save_generated_wav

        # Two correlated near-full-scale windows summed equal-power reach ~1.41x,
        # which clipped while mastering ran before the crossfade instead of after.
        n = int(SAMPLE_RATE * 5.0)
        wav = torch.full((2, n), 0.95)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "loop.wav"
            _save_generated_wav(
                path, wav, master=True, loop=True, fade_sec=1.0, mode="ambience"
            )
            with wave.open(str(path), "rb") as handle:
                pcm = memoryview(handle.readframes(handle.getnframes())).cast("h")
        peak = max(abs(v) for v in pcm) / 32767.0
        self.assertLessEqual(peak, TARGET_PEAK + 0.01)


class ResampleTests(unittest.TestCase):
    def test_44k_to_48k_does_not_alias(self) -> None:
        _require_torch(self)
        try:
            import numpy as np
        except ImportError:
            self.skipTest("numpy is not installed")

        from worker import _resample_audio

        sr = 44100
        t = np.arange(sr) / sr
        # 20 kHz sits close enough to Nyquist that linear interpolation folded
        # obvious images down into the audible band.
        x = (0.5 * np.sin(2 * np.pi * 20000 * t)).astype(np.float32)
        y, out_sr = _resample_audio(x, sr, 48000)
        self.assertEqual(out_sr, 48000)

        spectrum = np.abs(np.fft.rfft(y * np.hanning(len(y))))
        freqs = np.fft.rfftfreq(len(y), 1 / out_sr)
        self.assertAlmostEqual(freqs[int(np.argmax(spectrum))], 20000, delta=50)
        worst_alias = spectrum[freqs < 15000].max() / spectrum.max()
        self.assertLess(20 * math.log10(worst_alias + 1e-12), -60.0)


class DegradationDetectorTests(unittest.TestCase):
    """The logic behind "a higher preset must not sound worse"."""

    # Real numbers from a GPU run of a 3s door slam at 8 vs 20 pingpong steps.
    SFX_SPEED = {
        "crest_db": 20.45,
        "level_spread_db": 32.68,
        "centroid_hz": 3995.0,
        "high_ratio": 0.0609,
        "flux": 0.4255,
    }
    SFX_BALANCED = {
        "crest_db": 21.98,
        "level_spread_db": 28.62,
        "centroid_hz": 3956.0,
        "high_ratio": 0.0666,
        "flux": 0.4237,
    }

    def test_ordinary_variation_between_step_counts_is_not_a_regression(self) -> None:
        from audio_metrics import degradations

        self.assertEqual(degradations(self.SFX_SPEED, self.SFX_BALANCED), [])

    def test_a_dull_flat_uniform_result_is_caught_on_every_measure(self) -> None:
        from audio_metrics import DEGRADATION_TOLERANCE, degradations

        collapsed = {
            "crest_db": 14.0,
            "level_spread_db": 12.0,
            "centroid_hz": 1800.0,
            "high_ratio": 0.020,
            "flux": 0.200,
        }
        problems = degradations(self.SFX_SPEED, collapsed)
        self.assertEqual(len(problems), len(DEGRADATION_TOLERANCE), problems)
        for key in DEGRADATION_TOLERANCE:
            self.assertTrue(any(p.startswith(key) for p in problems), f"{key} not reported")

    def test_getting_better_is_never_a_regression(self) -> None:
        from audio_metrics import degradations

        brighter = {k: v * 1.5 for k, v in self.SFX_SPEED.items()}
        self.assertEqual(degradations(self.SFX_SPEED, brighter), [])

    def test_level_spread_is_judged_relatively(self) -> None:
        from audio_metrics import degradations

        # The same 4 dB drop is noise on a transient one-shot and a collapse on
        # a sustained bed, so the check has to scale with the material.
        loud_swing = dict(self.SFX_SPEED)
        self.assertEqual(
            degradations(loud_swing, {**loud_swing, "level_spread_db": 28.6}), []
        )
        flat_bed = {**self.SFX_SPEED, "level_spread_db": 6.0}
        self.assertTrue(
            degradations(flat_bed, {**flat_bed, "level_spread_db": 2.0}),
            "a bed losing two thirds of its level movement must be caught",
        )


class RefusesUnavailablePresetTests(unittest.TestCase):
    """End to end over the worker protocol: refuse, do not substitute."""

    def _client(self, base_ready: str):
        import os
        import subprocess

        env = dict(os.environ)
        env["THUNDER_FX_MOCK_ENGINE"] = "1"
        env["THUNDER_FX_BASE_MODEL_READY"] = base_ready
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONUTF8"] = "1"
        return subprocess.Popen(
            [sys.executable, "-u", str(ENGINE_DIR / "worker.py")],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            env=env,
            bufsize=1,
        )

    def _exchange(self, proc, payload: dict, timeout_s: float = 20.0) -> dict:
        import json
        import time

        proc.stdin.write(json.dumps(payload) + "\n")
        proc.stdin.flush()
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError("worker stdout closed")
            line = line.strip()
            if not line:
                continue
            msg = json.loads(line)
            if msg.get("id") == payload["id"] and msg.get("event") != "progress":
                return msg
        raise TimeoutError("no reply")

    def _generate(self, base_ready: str, preset: str, library: str) -> dict:
        proc = self._client(base_ready)
        try:
            return self._exchange(
                proc,
                {
                    "id": "g1",
                    "cmd": "generate",
                    "prompt": "a short metallic click",
                    "seconds": 1.0,
                    "seed": 7,
                    "mode": "sfx",
                    "preset": preset,
                    "negative": "",
                    "library_dir": library,
                },
            )
        finally:
            try:
                proc.stdin.close()
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
            finally:
                proc.stdout.close()

    def test_generate_refuses_with_advice_when_the_checkpoint_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as lib:
            msg = self._generate("0", "quality", lib)
        self.assertEqual(msg.get("event"), "error", msg)
        advice = msg.get("message", "")
        # It has to say which preset, what is missing, and both ways out.
        self.assertIn("Max quality", advice)
        self.assertIn("medium-base", advice)
        self.assertIn("Settings", advice)
        self.assertIn("Balanced", advice)

    def test_it_refuses_rather_than_writing_a_substituted_clip(self) -> None:
        with tempfile.TemporaryDirectory() as lib:
            self._generate("0", "quality", lib)
            written = list(Path(lib).rglob("*.wav"))
        # The whole point: nothing else gets generated in its place.
        self.assertEqual(written, [])

    def test_the_same_request_succeeds_once_the_checkpoint_is_present(self) -> None:
        with tempfile.TemporaryDirectory() as lib:
            msg = self._generate("1", "quality", lib)
        self.assertEqual(msg.get("event"), "done", msg)
        self.assertEqual(msg.get("preset"), "quality")
        self.assertFalse(msg.get("presetUnavailable"))

    def test_the_fast_presets_are_unaffected(self) -> None:
        for preset in ("speed", "balanced"):
            with self.subTest(preset=preset), tempfile.TemporaryDirectory() as lib:
                msg = self._generate("0", preset, lib)
                self.assertEqual(msg.get("event"), "done", msg)
                self.assertEqual(msg.get("sampler"), "pingpong")


if __name__ == "__main__":
    unittest.main()
