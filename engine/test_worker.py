#!/usr/bin/env python3
"""Subprocess tests for the JSON-lines worker (mock mode)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import wave
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

WORKER = ENGINE_DIR / "worker.py"


class WorkerClient:
    def __init__(self, env: dict[str, str]) -> None:
        self.proc = subprocess.Popen(
            [sys.executable, "-u", str(WORKER)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            env=env,
            bufsize=1,
        )
        assert self.proc.stdin is not None
        assert self.proc.stdout is not None

    def send(self, payload: dict) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()

    def read(self, timeout_s: float = 8.0) -> dict:
        assert self.proc.stdout is not None
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError("worker stdout closed")
            line = line.strip()
            if line:
                return json.loads(line)
        raise TimeoutError("worker produced no JSON line")

    def close(self) -> None:
        if self.proc.stdin is not None:
            self.proc.stdin.close()
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=3)
        if self.proc.stdout is not None:
            self.proc.stdout.close()


def _env(library: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["THUNDER_FX_MOCK_ENGINE"] = "1"
    env["THUNDER_FX_LIBRARY_DIR"] = str(library)
    env["THUNDER_FX_LOG_DIR"] = str(library)
    env["THUNDER_FX_MOCK_STEP_MS"] = "80"
    env["PYTHONUNBUFFERED"] = "1"
    return env


class WorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.library = Path(self._tmp.name)
        self.client = WorkerClient(_env(self.library))

    def tearDown(self) -> None:
        self.client.close()
        self._tmp.cleanup()

    def test_status_is_mock(self) -> None:
        self.client.send({"id": "s", "cmd": "status"})
        msg = self.client.read()
        self.assertEqual(msg["event"], "status")
        self.assertTrue(msg["mock"])
        self.assertTrue(msg["ready"])
        self.assertTrue(msg["loaded"])
        self.assertEqual(msg.get("gpuName"), "mock")
        self.assertGreater(msg.get("vramTotalGb") or 0, 0)
        self.assertEqual(msg.get("precision"), "fp16")

    def test_generate_writes_wav(self) -> None:
        self.client.send(
            {
                "id": "g",
                "cmd": "generate",
                "prompt": "sword clang",
                "seconds": 0.4,
                "seed": 7,
                "cfg": 1,
                "negative": "",
            }
        )
        done = None
        while True:
            msg = self.client.read()
            if msg.get("id") != "g":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "done":
                done = msg
                break
        self.assertTrue(Path(done["path"]).is_file())
        self.assertGreater(Path(done["path"]).stat().st_size, 44)
        self.assertEqual(done["seed"], 7)
        self.assertTrue(Path(done["path"]).name.startswith("sword-clang-"))
        from worker import read_wav_info

        info = read_wav_info(Path(done["path"]))
        self.assertEqual(info.get("INAM"), "sword clang")
        self.assertEqual(info.get("ISFT"), "Thunder FX")
        self.assertEqual(info.get("IGNR"), "Sound Effects")

    def test_generate_seamless_loop_keeps_duration(self) -> None:
        self.client.send(
            {
                "id": "g-loop",
                "cmd": "generate",
                "prompt": "TrackType: Music, lute bed",
                "seconds": 2,
                "seed": 7,
                "cfg": 1,
                "negative": "",
                "mode": "music",
                "seamless_loop": True,
            }
        )
        done = None
        while True:
            msg = self.client.read(timeout_s=15.0)
            if msg.get("id") != "g-loop":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "done":
                done = msg
                break
        self.assertTrue(done.get("seamlessLoop") or done.get("seamless_loop"))
        path = Path(done["path"])
        self.assertTrue(path.is_file())
        with wave.open(str(path), "rb") as wav:
            n = wav.getnframes()
            sr = wav.getframerate()
            ch = wav.getnchannels()
            frames = wav.readframes(n)
        self.assertAlmostEqual(n / sr, 2.0, delta=0.08)
        samples = memoryview(frames).cast("h")
        first = samples[0]
        last = samples[(n - 1) * ch]
        self.assertLess(abs(int(first) - int(last)), 12000)

    def test_generate_music_mock_differs_from_sfx(self) -> None:
        def run(msg_id: str, mode: str, prompt: str) -> Path:
            self.client.send(
                {
                    "id": msg_id,
                    "cmd": "generate",
                    "prompt": prompt,
                    "seconds": 0.4,
                    "seed": 7,
                    "cfg": 1,
                    "negative": "",
                    "mode": mode,
                }
            )
            while True:
                msg = self.client.read()
                if msg.get("id") != msg_id:
                    continue
                if msg.get("event") == "error":
                    self.fail(msg.get("message"))
                if msg.get("event") == "done":
                    return Path(msg["path"])

        sfx = run("gs", "sfx", "sword clang")
        music = run("gm", "music", "TrackType: Music, lute")
        self.assertNotEqual(sfx.read_bytes(), music.read_bytes())
        with wave.open(str(music), "rb") as wav:
            frames = wav.readframes(wav.getnframes())
        tail = memoryview(frames).cast("h")[-882:]
        self.assertGreater(max(abs(s) for s in tail), 2000)

    def test_generate_ambience_writes_ambience_folder(self) -> None:
        self.client.send(
            {
                "id": "ga",
                "cmd": "generate",
                "prompt": "TrackType: SFX, heavy rain on cobblestone, steady bed",
                "seconds": 0.4,
                "seed": 7,
                "cfg": 1,
                "negative": "",
                "mode": "ambience",
                "seamless_loop": True,
                "category": "Weather",
            }
        )
        done = None
        while True:
            msg = self.client.read()
            if msg.get("id") != "ga":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "done":
                done = msg
                break
        path = Path(done["path"])
        self.assertEqual(done.get("mode"), "ambience")
        self.assertEqual(done.get("instruments"), [])
        self.assertTrue(any(part.lower() == "ambience" for part in path.parts))
        from worker import read_wav_info

        info = read_wav_info(path)
        self.assertEqual(info.get("IGNR"), "Ambience")
        self.assertNotIn("IKEY", info)

    def test_generate_music_embeds_instrument_info(self) -> None:
        self.client.send(
            {
                "id": "gi",
                "cmd": "generate",
                "prompt": "TrackType: Music, lute and cello, no vocals",
                "seconds": 0.4,
                "seed": 7,
                "cfg": 1,
                "negative": "",
                "mode": "music",
                "instruments": ["lute", "cello"],
            }
        )
        done = None
        while True:
            msg = self.client.read()
            if msg.get("id") != "gi":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "done":
                done = msg
                break
        self.assertEqual(done.get("instruments"), ["lute", "cello"])
        from worker import read_wav_info

        info = read_wav_info(Path(done["path"]))
        self.assertEqual(info.get("IKEY"), "lute;cello")
        self.assertIn("lute", info.get("ICMT", ""))
        self.assertEqual(info.get("ISFT"), "Thunder FX")

    def test_generate_embeds_expanded_instruments(self) -> None:
        self.client.send(
            {
                "id": "g-exp",
                "cmd": "generate",
                "prompt": "TrackType: Music, wordless choir, celesta glints, waterphone drone",
                "seconds": 0.3,
                "seed": 8,
                "cfg": 1,
                "negative": "",
                "mode": "music",
                "instruments": ["choir", "celesta", "waterphone", "drone"],
            }
        )
        done = None
        while True:
            msg = self.client.read()
            if msg.get("id") != "g-exp":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "done":
                done = msg
                break
        self.assertEqual(done.get("instruments"), ["choir", "celesta", "waterphone", "drone"])
        from worker import read_wav_info

        info = read_wav_info(Path(done["path"]))
        self.assertEqual(info.get("IKEY"), "choir;celesta;waterphone;drone")
        self.assertIn("Instruments: choir, celesta, waterphone, drone", info.get("ICMT", ""))

    def test_generate_embeds_category_intensity_and_instruments(self) -> None:
        self.client.send(
            {
                "id": "g-cat-int",
                "cmd": "generate",
                "prompt": "TrackType: Music, misty forest with duduk and harp",
                "seconds": 0.3,
                "seed": 12,
                "cfg": 1,
                "negative": "",
                "mode": "music",
                "instruments": ["duduk", "harp"],
                "category": "Ancient Discovery",
                "intensity": "Level I — Quiet looping bed",
            }
        )
        done = None
        while True:
            msg = self.client.read()
            if msg.get("id") != "g-cat-int":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "done":
                done = msg
                break
        self.assertEqual(done.get("instruments"), ["duduk", "harp"])
        from worker import read_wav_info

        info = read_wav_info(Path(done["path"]))
        self.assertEqual(info.get("ISBJ"), "Ancient Discovery")
        self.assertEqual(info.get("IART"), "Level I — Quiet looping bed")
        self.assertEqual(info.get("IKEY"), "duduk;harp")
        self.assertIn("Category: Ancient Discovery", info.get("ICMT", ""))
        self.assertIn("Intensity: Level I — Quiet looping bed", info.get("ICMT", ""))
        self.assertIn("Instruments: duduk, harp", info.get("ICMT", ""))

    def test_generate_progress_includes_weaving_phase(self) -> None:
        self.client.send(
            {
                "id": "gp",
                "cmd": "generate",
                "prompt": "loading bar",
                "seconds": 0.3,
                "seed": 2,
                "cfg": 1,
                "negative": "",
            }
        )
        phases = []
        while True:
            msg = self.client.read()
            if msg.get("id") != "gp":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "progress":
                phases.append(msg.get("phase"))
                self.assertIn("ratio", msg)
            if msg.get("event") == "done":
                break
        self.assertIn("weaving", phases)
        self.assertNotIn("loading", phases)

    def test_generate_honors_steps_in_progress_and_done(self) -> None:
        self.client.send(
            {
                "id": "g-steps",
                "cmd": "generate",
                "prompt": "sparkle chime",
                "seconds": 0.2,
                "seed": 4,
                "cfg": 3.5,
                "steps": 12,
                "negative": "",
            }
        )
        totals = []
        done = None
        while True:
            msg = self.client.read()
            if msg.get("id") != "g-steps":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "progress":
                totals.append(msg.get("total"))
            if msg.get("event") == "done":
                done = msg
                break
        self.assertIn(12, totals)
        self.assertEqual(done.get("steps"), 12)


    def test_generate_honors_library_dir_in_message(self) -> None:
        other = Path(self._tmp.name) / "custom-library"
        self.client.send(
            {
                "id": "g2",
                "cmd": "generate",
                "prompt": "tavern latch",
                "seconds": 0.3,
                "seed": 3,
                "cfg": 1,
                "negative": "",
                "library_dir": str(other),
            }
        )
        done = None
        while True:
            msg = self.client.read()
            if msg.get("id") != "g2":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "done":
                done = msg
                break
        wav = Path(done["path"])
        self.assertTrue(wav.is_file())
        self.assertTrue(str(wav.resolve()).startswith(str(other.resolve())))
        self.assertEqual(wav.parent.parent.parent.parent.resolve(), other.resolve())

    def test_generate_organizes_files_in_category_folders(self) -> None:
        self.client.send(
            {
                "id": "g-folders",
                "cmd": "generate",
                "prompt": "heavy broadsword slash",
                "seconds": 0.3,
                "seed": 5,
                "cfg": 1,
                "negative": "",
                "mode": "sfx",
                "category": "Combat",
                "subcategory": "Sword",
            }
        )
        done = None
        while True:
            msg = self.client.read()
            if msg.get("id") != "g-folders":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "done":
                done = msg
                break
        wav = Path(done["path"])
        self.assertTrue(wav.is_file())
        self.assertEqual(wav.parent.name, "Sword")
        self.assertEqual(wav.parent.parent.name, "Combat")
        self.assertEqual(wav.parent.parent.parent.name, "sfx")
        self.assertEqual(done.get("category"), "Combat")
        self.assertEqual(done.get("subcategory"), "Sword")
        self.assertEqual(done.get("mode"), "sfx")

    def test_cancel_interrupts_generate(self) -> None:
        self.client.send(
            {
                "id": "c",
                "cmd": "generate",
                "prompt": "long weave",
                "seconds": 2,
                "seed": 1,
                "cfg": 1,
                "negative": "",
            }
        )
        progress = self.client.read()
        self.assertEqual(progress.get("event"), "progress")
        self.client.send({"id": "cancel", "cmd": "cancel"})
        terminal = None
        while True:
            msg = self.client.read()
            if msg.get("event") == "status" and msg.get("id") == "cancel":
                continue
            if msg.get("id") == "c" and msg.get("event") in {"error", "done"}:
                terminal = msg
                break
        self.assertEqual(terminal["event"], "error")
        self.assertIn("cancelled", terminal["message"].lower())
        log = self.library / "error.log"
        if log.is_file():
            self.assertNotIn("Generation cancelled", log.read_text(encoding="utf-8"))

    def test_warmup_skips_weights_in_mock(self) -> None:
        self.client.send({"id": "w", "cmd": "warmup"})
        msg = self.client.read()
        self.assertEqual(msg["event"], "done")
        self.assertIn("mock", msg["message"].lower())
        self.client.send({"id": "s2", "cmd": "status"})
        status = self.client.read()
        self.assertTrue(status["loaded"])

    def test_unload_and_warmup_in_mock(self) -> None:
        self.client.send({"id": "u", "cmd": "unload"})
        msg = self.client.read()
        self.assertEqual(msg["event"], "done")
        self.client.send({"id": "s_unloaded", "cmd": "status"})
        status = self.client.read()
        self.assertFalse(status["loaded"])
        # Trying to generate while unloaded gives error
        self.client.send({"id": "g_fail", "cmd": "generate", "prompt": "clang", "seconds": 0.4})
        gen_msg = self.client.read()
        self.assertEqual(gen_msg["event"], "error")
        self.assertIn("not loaded", gen_msg["message"].lower())
        # Reloading puts model back in loaded state
        self.client.send({"id": "w2", "cmd": "warmup"})
        self.client.read()
        self.client.send({"id": "s_reloaded", "cmd": "status"})
        status_reloaded = self.client.read()
        self.assertTrue(status_reloaded["loaded"])

    def test_unload_is_refused_while_a_generation_runs(self) -> None:
        # A long mock run holds the generation lock while we try to unload.
        self.client.send(
            {
                "id": "g_slow",
                "cmd": "generate",
                "prompt": "slow one",
                "seconds": 0.3,
                "seed": 5,
                "cfg": 1,
                "negative": "",
                "steps": 40,
            }
        )
        # Wait for the run to actually start before racing it.
        while True:
            msg = self.client.read()
            if msg.get("id") == "g_slow" and msg.get("event") == "progress":
                break

        self.client.send({"id": "u_busy", "cmd": "unload"})
        unload = None
        done = None
        while unload is None or done is None:
            msg = self.client.read(timeout_s=20.0)
            if msg.get("id") == "u_busy":
                unload = msg
            elif msg.get("id") == "g_slow" and msg.get("event") == "done":
                done = msg

        self.assertEqual(unload["event"], "error")
        self.assertIn("in progress", unload["message"].lower())

        # The model is still loaded, and unloading works once the run is over.
        self.client.send({"id": "s_busy", "cmd": "status"})
        while True:
            status = self.client.read()
            if status.get("id") == "s_busy":
                break
        self.assertTrue(status["loaded"])
        self.client.send({"id": "u_free", "cmd": "unload"})
        self.assertEqual(self.client.read()["event"], "done")

    def test_encode_ogg(self) -> None:
        try:
            import soundfile  # noqa: F401
        except ImportError:
            self.skipTest("soundfile is not installed")
        self.client.send(
            {
                "id": "g",
                "cmd": "generate",
                "prompt": "ogg source",
                "seconds": 0.3,
                "seed": 3,
                "cfg": 1,
                "negative": "",
            }
        )
        while True:
            msg = self.client.read()
            if msg.get("id") == "g" and msg.get("event") == "done":
                wav_path = msg["path"]
                break
            if msg.get("id") == "g" and msg.get("event") == "error":
                self.fail(msg.get("message"))
        ogg_path = str(self.library / "clip.ogg")
        self.client.send(
            {
                "id": "o",
                "cmd": "encode_ogg",
                "wav_path": wav_path,
                "ogg_path": ogg_path,
            }
        )
        while True:
            msg = self.client.read()
            if msg.get("id") != "o":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "done":
                self.assertTrue(Path(msg["path"]).is_file())
                self.assertGreater(Path(msg["path"]).stat().st_size, 0)
                break

    def test_encode_flac_48k(self) -> None:
        try:
            import soundfile  # noqa: F401
        except ImportError:
            self.skipTest("soundfile is not installed")
        self.client.send(
            {
                "id": "g2",
                "cmd": "generate",
                "prompt": "flac source",
                "seconds": 0.3,
                "seed": 4,
                "cfg": 1,
                "negative": "",
            }
        )
        while True:
            msg = self.client.read()
            if msg.get("id") == "g2" and msg.get("event") == "done":
                wav_path = msg["path"]
                break
            if msg.get("id") == "g2" and msg.get("event") == "error":
                self.fail(msg.get("message"))
        flac_path = str(self.library / "clip.flac")
        self.client.send(
            {
                "id": "f",
                "cmd": "encode_audio",
                "wav_path": wav_path,
                "dest_path": flac_path,
                "format": "flac",
                "sample_rate": 48000,
                "bit_depth": 24,
                "mono": True,
            }
        )
        while True:
            msg = self.client.read()
            if msg.get("id") != "f":
                continue
            if msg.get("event") == "error":
                self.fail(msg.get("message"))
            if msg.get("event") == "done":
                self.assertTrue(Path(msg["path"]).is_file())
                self.assertGreater(Path(msg["path"]).stat().st_size, 0)
                import soundfile as sf

                data, sr = sf.read(msg["path"])
                self.assertEqual(sr, 48000)
                self.assertEqual(getattr(data, "ndim", 1), 1)
                break

    def test_warmup_records_fp16_precision(self) -> None:
        self.client.send({"id": "w16", "cmd": "warmup", "precision": "fp16"})
        msg = self.client.read()
        self.assertEqual(msg["event"], "done")
        self.client.send({"id": "s16", "cmd": "status"})
        status = self.client.read()
        self.assertEqual(status.get("precision"), "fp16")


class SaveGeneratedWavTests(unittest.TestCase):
    def test_batched_stereo_tensor_writes_wav(self) -> None:
        try:
            import torch
        except ImportError:
            self.skipTest("torch is not installed")
        from worker import SAMPLE_RATE, _save_generated_wav, _to_stereo_cpu

        batched = torch.zeros(1, 2, 441)
        batched[0, 0, 10] = 0.5
        stereo = _to_stereo_cpu(batched)
        self.assertEqual(tuple(stereo.shape), (2, 441))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "out.wav"
            _save_generated_wav(path, batched)
            self.assertTrue(path.is_file())
            with wave.open(str(path), "rb") as wav:
                self.assertEqual(wav.getnchannels(), 2)
                self.assertEqual(wav.getsampwidth(), 2)
                self.assertEqual(wav.getframerate(), SAMPLE_RATE)
                self.assertEqual(wav.getnframes(), 441)
                pcm = memoryview(wav.readframes(wav.getnframes())).cast("h")
            self.assertIn(pcm[20], (16383, 16384))
            self.assertEqual(pcm[21], 0)

    def test_python_float_unwraps_size_one_array(self) -> None:
        from worker import _python_float

        try:
            import numpy as np
        except ImportError:
            self.skipTest("numpy is not installed")
        self.assertEqual(_python_float(np.array([8.0]), 0.0), 8.0)
        self.assertEqual(_python_float(np.array(8.0), 0.0), 8.0)
        with self.assertRaises(TypeError):
            _python_float(np.array([8.0, 9.0]), 0.0)


class ErrorLogTests(unittest.TestCase):
    def test_unknown_cmd_is_appended_to_error_log(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        library = Path(tmp.name)
        client = WorkerClient(_env(library))
        self.addCleanup(client.close)
        client.send({"id": "bad", "cmd": "nope"})
        msg = client.read()
        self.assertEqual(msg["event"], "error")
        log = library / "error.log"
        self.assertTrue(log.is_file())
        text = log.read_text(encoding="utf-8")
        self.assertIn("unknown cmd nope", text)
        self.assertIn("ERROR", text)

    def test_log_error_includes_traceback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            old = os.environ.get("THUNDER_FX_LOG_DIR")
            os.environ["THUNDER_FX_LOG_DIR"] = tmp
            try:
                from worker import _log_error

                try:
                    raise RuntimeError("omen")
                except RuntimeError as exc:
                    _log_error("cast failed", exc, context={"cmd": "generate"})
                text = (Path(tmp) / "error.log").read_text(encoding="utf-8")
            finally:
                if old is None:
                    os.environ.pop("THUNDER_FX_LOG_DIR", None)
                else:
                    os.environ["THUNDER_FX_LOG_DIR"] = old
        self.assertIn("cast failed", text)
        self.assertIn("RuntimeError: omen", text)
        self.assertIn("Traceback", text)
        self.assertIn('"cmd": "generate"', text)


class ClampStepsTests(unittest.TestCase):
    def test_clamps_to_bounds(self) -> None:
        from worker import clamp_steps

        self.assertEqual(clamp_steps(20), 20)
        self.assertEqual(clamp_steps(2), 4)
        self.assertEqual(clamp_steps(150), 100)
        self.assertEqual(clamp_steps(float("nan")), 20)


class ClampSecondsTests(unittest.TestCase):
    def test_clamps_to_stable_audio_3_medium_max(self) -> None:
        from worker import clamp_seconds

        self.assertEqual(clamp_seconds(380), 380)
        self.assertEqual(clamp_seconds(381), 380)
        self.assertEqual(clamp_seconds(0.1), 0.5)
        self.assertEqual(clamp_seconds(float("nan")), 8.0)


class ClampCfgTests(unittest.TestCase):
    def test_locks_medium_at_cfg_1(self) -> None:
        from worker import clamp_cfg

        self.assertEqual(clamp_cfg(1.0), 1.0)
        self.assertEqual(clamp_cfg(1.4), 1.0)
        self.assertEqual(clamp_cfg(7.0), 1.0)
        self.assertEqual(clamp_cfg(0.0), 1.0)
        self.assertEqual(clamp_cfg(float("nan")), 1.0)


class SeamlessLoopTests(unittest.TestCase):
    def test_overlap_scales_with_duration(self) -> None:
        from worker import loop_overlap_seconds

        self.assertEqual(loop_overlap_seconds(20), 1.0)
        self.assertEqual(loop_overlap_seconds(90), 3.0)
        self.assertEqual(loop_overlap_seconds(8), 0.5)

    def test_prompt_asks_for_matching_ends(self) -> None:
        from worker import LOOP_PROMPT_CUE, ensure_loop_prompt

        once = ensure_loop_prompt("TrackType: Music, lute theme")
        self.assertIn("starts and ends the same", once)
        self.assertTrue(once.endswith(LOOP_PROMPT_CUE) or LOOP_PROMPT_CUE in once)
        self.assertEqual(ensure_loop_prompt(once), once)

    def test_wrap_is_smoother_than_raw_music(self) -> None:
        from worker import _make_seamless_loop_frames

        fade = 0.5
        n = int(4.5 * 44100)
        raw = [(int(i / (n - 1) * 30000), 0) for i in range(n)]
        looped = _make_seamless_loop_frames(raw, fade)

        def jump(frames: list[tuple[int, int]]) -> int:
            return abs(frames[0][0] - frames[-1][0])

        self.assertLess(jump(looped), jump(raw) / 4)
        self.assertAlmostEqual(len(looped) / 44100, 4.0, delta=0.05)


if __name__ == "__main__":
    unittest.main()

