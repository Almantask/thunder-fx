#!/usr/bin/env python3
"""Subprocess client for `engine/worker.py`.

Speaks the same JSON-lines protocol the Tauri shell speaks, so the MCP server
reuses the engine wholesale rather than reimplementing any of it: prompt
normalisation, loudness mastering, seamless-loop construction, WAV INFO tags and
the library folder layout all stay on the worker's side of the pipe.

One worker process per client. Requests are routed by their `id`, so a long
generation and a cheap `status` can be in flight at once -- the worker already
dispatches each command to its own thread.
"""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from collections.abc import Callable
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
WORKER_PATH = ENGINE_DIR / "worker.py"

# Terminal events by default. `status` and `probe` answer with their own event
# name rather than "done", so those callers pass `expect` explicitly -- waiting
# for "done" on a status request simply hangs until the timeout.
_TERMINAL = ("done", "error")
_STATUS_TERMINAL = ("status", "error")
_PROBE_TERMINAL = ("probe", "error")

ProgressFn = Callable[[dict], None]


class EngineError(RuntimeError):
    """An `error` event from the worker, or the worker failing to answer."""


class EngineDied(EngineError):
    """The worker process exited. Carries whatever it wrote to stderr."""


class _Pending:
    __slots__ = ("done", "result", "on_progress", "expect")

    def __init__(self, on_progress: ProgressFn | None, expect: tuple[str, ...]) -> None:
        self.done = threading.Event()
        self.result: dict | None = None
        self.on_progress = on_progress
        self.expect = expect


class EngineClient:
    """Owns one worker subprocess.

    `start()` is lazy -- nothing is spawned and no model is loaded until the
    first request, so an MCP client that only browses the catalog never touches
    the GPU.
    """

    def __init__(
        self,
        *,
        worker_path: Path | None = None,
        python: str | None = None,
        env: dict[str, str] | None = None,
        stderr_lines: int = 50,
    ) -> None:
        self.worker_path = Path(worker_path) if worker_path else WORKER_PATH
        # sys.executable, so the worker runs in the same venv that imported this
        # module. The Rust shell has to go hunting for an interpreter; we do not.
        self.python = python or sys.executable
        self.env = dict(env) if env is not None else dict(os.environ)
        self._proc: subprocess.Popen | None = None
        self._pending: dict[str, _Pending] = {}
        self._pending_lock = threading.Lock()
        self._proc_lock = threading.Lock()
        self._stderr: deque[str] = deque(maxlen=stderr_lines)
        self._write_lock = threading.Lock()
        self._in_flight: str | None = None
        # Serialises GPU work. The worker rejects overlapping generations with
        # "already in progress"; holding this makes a second caller wait instead.
        self.work_lock = threading.Lock()
        self.model_loaded = False
        self.model_name: str | None = None
        self.last_activity = time.time()

    # --- process lifecycle ------------------------------------------------

    @property
    def alive(self) -> bool:
        proc = self._proc
        return proc is not None and proc.poll() is None

    def start(self) -> None:
        with self._proc_lock:
            if self.alive:
                return
            self._stderr.clear()
            self._proc = subprocess.Popen(
                [self.python, "-u", str(self.worker_path)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.env,
                bufsize=1,
                cwd=str(self.worker_path.parent.parent),
            )
            # A respawn starts with no model in VRAM, whatever we believed before.
            self.model_loaded = False
            self.model_name = None
            threading.Thread(target=self._read_stdout, daemon=True, name="engine-stdout").start()
            threading.Thread(target=self._read_stderr, daemon=True, name="engine-stderr").start()

    def stop(self) -> None:
        with self._proc_lock:
            proc, self._proc = self._proc, None
        if proc is None:
            return
        try:
            if proc.stdin:
                proc.stdin.close()
        except OSError:
            pass
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        # The reader threads are parked on these; closing them here is what stops
        # a long-lived server leaking two file descriptors per respawn.
        for stream in (proc.stdout, proc.stderr):
            try:
                if stream:
                    stream.close()
            except OSError:
                pass
        self._fail_all("engine stopped")

    def stderr_tail(self) -> str:
        return "".join(self._stderr).strip()

    # --- plumbing ---------------------------------------------------------

    def _read_stdout(self) -> None:
        proc = self._proc
        if proc is None or proc.stdout is None:
            return
        for raw in proc.stdout:
            line = raw.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                # The worker only ever emits JSON lines; anything else is a
                # stray print from a library and is not worth failing over.
                continue
            self._route(msg)
        # stdout closed: the process is going away, so nothing will ever answer.
        self._fail_all("engine exited")

    def _read_stderr(self) -> None:
        proc = self._proc
        if proc is None or proc.stderr is None:
            return
        for raw in proc.stderr:
            self._stderr.append(raw)

    def _route(self, msg: dict) -> None:
        msg_id = msg.get("id")
        key = str(msg_id) if msg_id is not None else ""
        with self._pending_lock:
            pending = self._pending.get(key)
        if pending is None:
            return
        event = msg.get("event")
        if event in pending.expect:
            pending.result = msg
            pending.done.set()
        elif event == "progress" and pending.on_progress is not None:
            # A failing progress sink must never abort the generation it is only
            # reporting on.
            with contextlib.suppress(Exception):
                pending.on_progress(msg)

    def _fail_all(self, reason: str) -> None:
        with self._pending_lock:
            pending = list(self._pending.values())
        for item in pending:
            if not item.done.is_set():
                item.result = {"event": "error", "message": reason, "_died": True}
                item.done.set()

    def _write(self, payload: dict) -> None:
        proc = self._proc
        if proc is None or proc.stdin is None:
            raise EngineDied("engine is not running")
        line = json.dumps(payload) + "\n"
        with self._write_lock:
            try:
                proc.stdin.write(line)
                proc.stdin.flush()
            except (OSError, ValueError) as exc:
                raise EngineDied(f"engine pipe closed: {exc}") from exc

    # --- requests ---------------------------------------------------------

    def request(
        self,
        cmd: str,
        *,
        timeout: float | None = None,
        on_progress: ProgressFn | None = None,
        expect: tuple[str, ...] = _TERMINAL,
        **fields,
    ) -> dict:
        """Send one command and block for its terminal event.

        Respawns a dead worker once and retries, so a crash earlier in the
        session costs the next call a restart rather than an error.
        """
        kwargs = {"timeout": timeout, "on_progress": on_progress, "expect": expect}
        try:
            return self._request_once(cmd, **kwargs, **fields)
        except EngineDied as exc:
            tail = self.stderr_tail()
            self.stop()
            self.start()
            try:
                return self._request_once(cmd, **kwargs, **fields)
            except EngineDied as retry_exc:
                detail = self.stderr_tail() or tail
                message = f"{retry_exc}"
                if detail:
                    message = f"{message}\nengine stderr:\n{detail}"
                raise EngineDied(message) from exc

    def _request_once(
        self,
        cmd: str,
        *,
        timeout: float | None,
        on_progress: ProgressFn | None,
        expect: tuple[str, ...] = _TERMINAL,
        **fields,
    ) -> dict:
        self.start()
        msg_id = uuid.uuid4().hex[:12]
        pending = _Pending(on_progress, expect)
        with self._pending_lock:
            self._pending[msg_id] = pending
        self._in_flight = msg_id
        self.last_activity = time.time()
        try:
            self._write({"id": msg_id, "cmd": cmd, **fields})
            deadline = None if timeout is None else time.time() + timeout
            while True:
                # Short waits so a worker that dies without closing stdout still
                # fails the call rather than hanging it forever.
                if pending.done.wait(0.25):
                    break
                if not self.alive:
                    raise EngineDied("engine exited while the request was in flight")
                if deadline is not None and time.time() > deadline:
                    raise EngineError(f"{cmd} timed out after {timeout:g}s")
            result = pending.result or {}
            if result.get("_died"):
                raise EngineDied(str(result.get("message") or "engine exited"))
            if result.get("event") == "error":
                raise EngineError(str(result.get("message") or "engine error"))
            return result
        finally:
            with self._pending_lock:
                self._pending.pop(msg_id, None)
            if self._in_flight == msg_id:
                self._in_flight = None
            self.last_activity = time.time()

    def cancel(self) -> None:
        """Ask the worker to abandon the work in flight. Best effort."""
        if not self.alive:
            return
        with contextlib.suppress(EngineError):
            self._write({"id": self._in_flight or "cancel", "cmd": "cancel"})

    # --- commands ---------------------------------------------------------

    def status(self, timeout: float = 30.0) -> dict:
        return self.request("status", timeout=timeout, expect=_STATUS_TERMINAL)

    def probe(self, timeout: float = 120.0) -> dict:
        return self.request("probe", timeout=timeout, expect=_PROBE_TERMINAL)

    def ensure_model(
        self,
        *,
        preset: str,
        precision: str = "fp16",
        model: str | None = None,
        on_progress: ProgressFn | None = None,
        timeout: float | None = None,
    ) -> dict | None:
        """Load the checkpoint if it is not already in VRAM.

        No timeout by default: a cold load off a mechanical disk is minutes of
        real work, and the measured worst case in this repo is ~3.7 min.
        """
        if self.model_loaded:
            return None
        fields: dict = {"preset": preset, "precision": precision}
        if model:
            fields["model"] = model
        result = self.request("warmup", on_progress=on_progress, timeout=timeout, **fields)
        self.model_loaded = True
        self.model_name = str(result.get("model") or model or "") or None
        return result

    def unload(self, timeout: float = 120.0) -> dict | None:
        if not self.alive or not self.model_loaded:
            return None
        try:
            result = self.request("unload", timeout=timeout)
        except EngineError:
            return None
        self.model_loaded = False
        self.model_name = None
        return result

    def generate(
        self,
        *,
        on_progress: ProgressFn | None = None,
        timeout: float | None = None,
        **fields,
    ) -> dict:
        return self.request("generate", on_progress=on_progress, timeout=timeout, **fields)

    def encode_audio(self, *, timeout: float = 600.0, **fields) -> dict:
        return self.request("encode_audio", timeout=timeout, **fields)


class IdleUnloader:
    """Drops the model out of VRAM after a stretch with no work.

    An MCP server can sit registered in a client for days. Holding ~6 GB the
    whole time is the wrong default for a machine someone is also playing games
    on, and the reload is a few seconds off an SSD.
    """

    def __init__(self, client: EngineClient, idle_seconds: float, interval: float = 30.0) -> None:
        self.client = client
        self.idle_seconds = idle_seconds
        self.interval = interval
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self.idle_seconds <= 0 or self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, daemon=True, name="engine-idle-unload")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def due(self, now: float | None = None) -> bool:
        if self.idle_seconds <= 0 or not self.client.model_loaded:
            return False
        moment = time.time() if now is None else now
        return (moment - self.client.last_activity) >= self.idle_seconds

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            if not self.due():
                continue
            # Never unload underneath a running generation.
            if not self.client.work_lock.acquire(blocking=False):
                continue
            try:
                if self.due():
                    self.client.unload()
            finally:
                self.client.work_lock.release()
