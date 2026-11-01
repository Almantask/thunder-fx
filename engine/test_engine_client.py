#!/usr/bin/env python3
"""Tests for the worker subprocess client.

Most of these run against a stub worker rather than the real one: the protocol
is what is under test, and a stub makes error, crash and out-of-order paths
reachable without a GPU. A couple of tests at the end drive the real worker in
mock mode to confirm the stub is not lying about the protocol.
"""

from __future__ import annotations

import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

from engine_client import (  # noqa: E402
    EngineClient,
    EngineDied,
    EngineError,
    IdleUnloader,
)

STUB = '''
import json, os, sys, threading, time

def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\\n")
    sys.stdout.flush()

def handle(msg):
    cmd = msg.get("cmd")
    mid = msg.get("id")
    if cmd == "boom":
        emit({"id": mid, "event": "error", "message": "the forge is cold"})
    elif cmd == "slow":
        time.sleep(float(msg.get("delay", 1)))
        emit({"id": mid, "event": "done", "tag": msg.get("tag")})
    elif cmd == "prog":
        for step in (1, 2, 3):
            emit({"id": mid, "event": "progress", "step": step, "total": 3, "phase": "weaving"})
        emit({"id": mid, "event": "done", "steps": 3})
    elif cmd == "die":
        sys.stderr.write("fatal: the anvil cracked\\n")
        sys.stderr.flush()
        os._exit(1)
    elif cmd == "noise":
        sys.stdout.write("this line is not json\\n")
        sys.stdout.flush()
        emit({"id": mid, "event": "done"})
    elif cmd == "warmup":
        emit({"id": mid, "event": "done", "model": msg.get("model") or "medium"})
    elif cmd == "unload":
        emit({"id": mid, "event": "done", "message": "unloaded"})
    elif cmd == "cancel":
        emit({"id": "cancel-seen", "event": "status", "message": "cancel requested"})
    else:
        emit({"id": mid, "event": "done", "cmd": cmd, "echo": msg.get("echo")})

for raw in sys.stdin:
    line = raw.strip()
    if not line:
        continue
    msg = json.loads(line)
    threading.Thread(target=handle, args=(msg,), daemon=True).start()
'''


class StubClientCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.stub = Path(self._tmp.name) / "stub_worker.py"
        self.stub.write_text(STUB, encoding="utf-8")
        self.client = EngineClient(worker_path=self.stub)

    def tearDown(self):
        self.client.stop()
        self._tmp.cleanup()


class Requests(StubClientCase):
    def test_lazy_start(self):
        """Nothing is spawned until the first request."""
        self.assertFalse(self.client.alive)
        self.client.request("echo", echo="hi", timeout=10)
        self.assertTrue(self.client.alive)

    def test_done_event_returned(self):
        result = self.client.request("echo", echo="hello", timeout=10)
        self.assertEqual(result["event"], "done")
        self.assertEqual(result["echo"], "hello")

    def test_error_event_raises_verbatim(self):
        """The worker's wording must survive: no generic wrapper message."""
        with self.assertRaises(EngineError) as ctx:
            self.client.request("boom", timeout=10)
        self.assertEqual(str(ctx.exception), "the forge is cold")

    def test_progress_callback_fires(self):
        seen = []
        result = self.client.request("prog", timeout=10, on_progress=seen.append)
        self.assertEqual(result["steps"], 3)
        self.assertEqual([p["step"] for p in seen], [1, 2, 3])

    def test_failing_progress_sink_does_not_break_the_call(self):
        def explode(_payload):
            raise RuntimeError("sink is broken")

        result = self.client.request("prog", timeout=10, on_progress=explode)
        self.assertEqual(result["event"], "done")

    def test_non_json_line_ignored(self):
        result = self.client.request("noise", timeout=10)
        self.assertEqual(result["event"], "done")

    def test_timeout_raises(self):
        with self.assertRaises(EngineError) as ctx:
            self.client.request("slow", delay=5, timeout=0.4)
        self.assertIn("timed out", str(ctx.exception))

    def test_requests_routed_by_id(self):
        """A slow request must not swallow a fast one's answer."""
        results = {}

        def run(tag, delay):
            results[tag] = self.client.request("slow", delay=delay, tag=tag, timeout=10)

        slow = threading.Thread(target=run, args=("slow", 1.0))
        fast = threading.Thread(target=run, args=("fast", 0.1))
        slow.start()
        time.sleep(0.05)
        fast.start()
        fast.join(10)
        slow.join(10)
        self.assertEqual(results["fast"]["tag"], "fast")
        self.assertEqual(results["slow"]["tag"], "slow")

    def test_unknown_id_event_ignored(self):
        """A cancel ack carries a different id and must not resolve anything."""
        self.client.start()
        self.client.cancel()
        result = self.client.request("echo", echo="still here", timeout=10)
        self.assertEqual(result["echo"], "still here")


class Crashes(StubClientCase):
    def test_death_surfaces_stderr_tail(self):
        with self.assertRaises(EngineDied) as ctx:
            self.client.request("die", timeout=10)
        self.assertIn("the anvil cracked", str(ctx.exception))

    def test_respawns_for_the_next_call(self):
        with self.assertRaises(EngineDied):
            self.client.request("die", timeout=10)
        result = self.client.request("echo", echo="reborn", timeout=10)
        self.assertEqual(result["echo"], "reborn")

    def test_respawn_clears_model_state(self):
        self.client.ensure_model(preset="balanced", timeout=10)
        self.assertTrue(self.client.model_loaded)
        with self.assertRaises(EngineDied):
            self.client.request("die", timeout=10)
        self.assertFalse(self.client.model_loaded)

    def test_stop_is_idempotent(self):
        self.client.start()
        self.client.stop()
        self.client.stop()
        self.assertFalse(self.client.alive)


class ModelState(StubClientCase):
    def test_ensure_model_loads_once(self):
        first = self.client.ensure_model(preset="balanced", timeout=10)
        self.assertIsNotNone(first)
        self.assertTrue(self.client.model_loaded)
        self.assertIsNone(self.client.ensure_model(preset="balanced", timeout=10))

    def test_ensure_model_records_checkpoint(self):
        self.client.ensure_model(preset="balanced", model="medium", timeout=10)
        self.assertEqual(self.client.model_name, "medium")

    def test_unload_clears_state(self):
        self.client.ensure_model(preset="balanced", timeout=10)
        self.client.unload(timeout=10)
        self.assertFalse(self.client.model_loaded)
        self.assertIsNone(self.client.model_name)

    def test_unload_without_model_is_a_noop(self):
        self.assertIsNone(self.client.unload(timeout=10))


class Idle(unittest.TestCase):
    def setUp(self):
        self.client = EngineClient(worker_path=Path("unused.py"))

    def test_not_due_when_no_model(self):
        unloader = IdleUnloader(self.client, idle_seconds=10)
        self.client.model_loaded = False
        self.assertFalse(unloader.due())

    def test_not_due_before_the_window(self):
        unloader = IdleUnloader(self.client, idle_seconds=600)
        self.client.model_loaded = True
        self.client.last_activity = time.time()
        self.assertFalse(unloader.due())

    def test_due_after_the_window(self):
        unloader = IdleUnloader(self.client, idle_seconds=600)
        self.client.model_loaded = True
        self.client.last_activity = time.time() - 601
        self.assertTrue(unloader.due())

    def test_zero_disables(self):
        unloader = IdleUnloader(self.client, idle_seconds=0)
        self.client.model_loaded = True
        self.client.last_activity = time.time() - 99999
        self.assertFalse(unloader.due())
        unloader.start()
        self.assertIsNone(unloader._thread)


class RealWorkerMock(unittest.TestCase):
    """Confirms the stub is not lying about the protocol."""

    def setUp(self):
        env = dict(os.environ)
        env["THUNDER_FX_MOCK_ENGINE"] = "1"
        env["THUNDER_FX_MOCK_STEP_MS"] = "1"
        self._tmp = tempfile.TemporaryDirectory()
        env["THUNDER_FX_LIBRARY_DIR"] = self._tmp.name
        self.client = EngineClient(env=env)

    def tearDown(self):
        self.client.stop()
        self._tmp.cleanup()

    def test_status_answers(self):
        """status replies with event 'status', not 'done'."""
        result = self.client.status(timeout=60)
        self.assertEqual(result["event"], "status")
        self.assertTrue(result["mock"])
        self.assertIn("loaded", result)

    def test_probe_answers(self):
        result = self.client.probe(timeout=60)
        self.assertEqual(result["event"], "probe")
        self.assertTrue(result["ok"])

    def test_generate_writes_a_wav_and_reports_progress(self):
        self.client.ensure_model(preset="balanced", timeout=120)
        seen = []
        result = self.client.generate(
            prompt="a test door slam",
            seconds=1.0,
            preset="balanced",
            mode="sfx",
            timeout=120,
            on_progress=seen.append,
        )
        self.assertEqual(result["event"], "done")
        self.assertTrue(Path(result["path"]).is_file())
        self.assertEqual(result["preset"], "balanced")
        self.assertTrue(seen, "expected progress events")

    def test_generate_after_unload_errors(self):
        """The worker refuses to generate with no model, and says why."""
        self.client.ensure_model(preset="balanced", timeout=120)
        self.client.unload(timeout=60)
        with self.assertRaises(EngineError) as ctx:
            self.client.generate(prompt="x", seconds=1.0, preset="balanced", timeout=120)
        self.assertIn("not loaded", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
