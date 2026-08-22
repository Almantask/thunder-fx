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

WORKER = Path(__file__).resolve().parent / "worker.py"


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
        self.assertEqual(wav.parent.resolve(), other.resolve())

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
        self.assertIn("dispelled", terminal["message"].lower())
        log = self.library / "error.log"
        if log.is_file():
            self.assertNotIn("Cast dispelled", log.read_text(encoding="utf-8"))

    def test_warmup_skips_weights_in_mock(self) -> None:
        self.client.send({"id": "w", "cmd": "warmup"})
        msg = self.client.read()
        self.assertEqual(msg["event"], "done")
        self.assertIn("mock", msg["message"].lower())

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


if __name__ == "__main__":
    unittest.main()
