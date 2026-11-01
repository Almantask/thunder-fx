#!/usr/bin/env python3
"""Tests for the MCP server's tool surface.

These drive the tool functions directly against a fake engine client, so the
contract under test is what the tools send and return -- not whether CUDA works.
`test_mcp_stdio.py` covers the protocol end to end.
"""

from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import threading
import time
import unittest
import wave
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

import library_index as li  # noqa: E402
import mcp_server as m  # noqa: E402
from engine_client import EngineError  # noqa: E402
from mcp.server.mcpserver import Audio  # noqa: E402
from mcp.server.mcpserver.exceptions import ToolError  # noqa: E402


class FakeContext:
    """Just enough Context for the progress bridge."""

    def __init__(self) -> None:
        self.reports: list[tuple] = []

    async def report_progress(self, progress, total=None, message=None):
        self.reports.append((progress, total, message))


class FakeClient:
    def __init__(self, **done) -> None:
        self.work_lock = threading.Lock()
        self.model_loaded = False
        self.model_name = None
        self.alive = True
        self.generate_calls: list[dict] = []
        self.encode_calls: list[dict] = []
        self.warmups: list[dict] = []
        self.cancelled = False
        self.raise_on_generate: Exception | None = None
        self._done = {
            "event": "done",
            "path": r"C:\lib\sfx\MCP\General\door-2s-abcd.wav",
            "seed": 42,
            "duration": 2.0,
            "steps": 20,
            "prompt": "a door slam",
            "modelPrompt": "TrackType: SFX, a door slam. Length: 2 seconds",
            "mode": "sfx",
            "category": "MCP",
            "subcategory": "General",
            "preset": "balanced",
            "model": "medium",
            "seamlessLoop": False,
            "warnings": [],
        }
        self._done.update(done)

    def ensure_model(self, **kwargs):
        self.warmups.append(kwargs)
        self.model_loaded = True
        self.model_name = "medium"
        return {"event": "done", "model": "medium"}

    def generate(self, *, on_progress=None, **fields):
        self.generate_calls.append(fields)
        if on_progress:
            on_progress({"event": "progress", "step": 5, "total": 20, "phase": "weaving"})
        if self.raise_on_generate:
            raise self.raise_on_generate
        return dict(self._done)

    def encode_audio(self, **fields):
        self.encode_calls.append(fields)
        dest = Path(fields["dest_path"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"OggS-fake-opus-payload")
        return {"event": "done", "path": str(dest), "format": fields.get("format")}

    def status(self, timeout=30.0):
        return {
            "event": "status",
            "mock": True,
            "loaded": self.model_loaded,
            "device": "mock",
            "gpuName": "mock",
            "vramUsedGb": 0.4,
            "vramTotalGb": 8.0,
        }

    def cancel(self):
        self.cancelled = True

    def stop(self):
        self.alive = False


def write_wav(path: Path, seconds: float = 1.0, rate: int = 44100) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"\x00\x00\x00\x00" * int(seconds * rate))


class ClientPatch(unittest.TestCase):
    def setUp(self):
        self.fake = FakeClient()
        self._real = m.client
        m.client = self.fake

    def tearDown(self):
        m.client = self._real


class ToolSurface(unittest.TestCase):
    def setUp(self):
        self.tools = {t.name: t for t in asyncio.run(m.server.list_tools())}

    def test_expected_tools_registered(self):
        self.assertEqual(
            set(self.tools),
            {
                "generate_sound_effect",
                "generate_ambience",
                "generate_instrumental",
                "search_prompt_catalog",
                "list_prompt_categories",
                "search_library",
                "get_clip",
                "export_clip",
                "engine_status",
            },
        )

    def test_context_not_in_any_schema(self):
        for name, tool in self.tools.items():
            with self.subTest(tool=name):
                self.assertNotIn("ctx", tool.input_schema.get("properties", {}))

    def test_no_quality_knobs_anywhere(self):
        """The pinned preset must not be reachable through any parameter."""
        banned = {"preset", "steps", "sampler", "cfg", "cfg_scale", "model", "precision"}
        for name, tool in self.tools.items():
            with self.subTest(tool=name):
                self.assertEqual(banned & set(tool.input_schema.get("properties", {})), set())

    def test_no_negative_prompt_anywhere(self):
        """At CFG 1 it would do nothing, so it must not be offered."""
        for name, tool in self.tools.items():
            with self.subTest(tool=name):
                props = set(tool.input_schema.get("properties", {}))
                self.assertEqual({"negative", "negative_prompt"} & props, set())

    def test_every_tool_has_a_description(self):
        for name, tool in self.tools.items():
            with self.subTest(tool=name):
                self.assertTrue((tool.description or "").strip())

    def test_description_is_required_on_generators(self):
        for name in ("generate_sound_effect", "generate_ambience", "generate_instrumental"):
            with self.subTest(tool=name):
                self.assertIn("description", self.tools[name].input_schema.get("required", []))


class Generation(ClientPatch):
    def test_pins_balanced_preset(self):
        asyncio.run(m.generate_sound_effect(FakeContext(), "a door slam"))
        self.assertEqual(self.fake.generate_calls[0]["preset"], "balanced")
        self.assertEqual(self.fake.warmups[0]["preset"], "balanced")
        self.assertEqual(self.fake.warmups[0]["precision"], "fp16")

    def test_never_requests_medium_base(self):
        """Max quality's checkpoint must never be loaded by this surface."""
        for coro in (
            m.generate_sound_effect(FakeContext(), "a door slam"),
            m.generate_ambience(FakeContext(), "rain on canvas"),
            m.generate_instrumental(FakeContext(), "a slow lute bed"),
        ):
            asyncio.run(coro)
        sent = repr(self.fake.generate_calls) + repr(
            [{k: v for k, v in w.items() if k != "on_progress"} for w in self.fake.warmups]
        )
        self.assertNotIn("medium-base", sent)
        self.assertNotIn("quality", sent)

    def test_modes_routed(self):
        asyncio.run(m.generate_sound_effect(FakeContext(), "x"))
        asyncio.run(m.generate_ambience(FakeContext(), "x"))
        asyncio.run(m.generate_instrumental(FakeContext(), "x"))
        self.assertEqual([c["mode"] for c in self.fake.generate_calls], ["sfx", "ambience", "music"])

    def test_duration_defaults_per_mode(self):
        asyncio.run(m.generate_sound_effect(FakeContext(), "x"))
        asyncio.run(m.generate_ambience(FakeContext(), "x"))
        asyncio.run(m.generate_instrumental(FakeContext(), "x"))
        self.assertEqual([c["seconds"] for c in self.fake.generate_calls], [2.0, 30.0, 20.0])

    def test_seconds_clamped_not_rejected(self):
        asyncio.run(m.generate_sound_effect(FakeContext(), "x", seconds=9000))
        self.assertEqual(self.fake.generate_calls[0]["seconds"], 380.0)
        asyncio.run(m.generate_sound_effect(FakeContext(), "x", seconds=0.01))
        self.assertEqual(self.fake.generate_calls[1]["seconds"], 0.5)

    def test_ambience_loops_by_default(self):
        asyncio.run(m.generate_ambience(FakeContext(), "rain"))
        self.assertTrue(self.fake.generate_calls[0]["seamlessLoop"])

    def test_sfx_does_not_loop(self):
        asyncio.run(m.generate_sound_effect(FakeContext(), "slam"))
        self.assertFalse(self.fake.generate_calls[0]["seamlessLoop"])

    def test_empty_description_refused(self):
        with self.assertRaises(ToolError):
            asyncio.run(m.generate_sound_effect(FakeContext(), "   "))

    def test_default_category_is_mcp(self):
        asyncio.run(m.generate_sound_effect(FakeContext(), "x"))
        self.assertEqual(self.fake.generate_calls[0]["category"], "MCP")

    def test_category_override(self):
        asyncio.run(m.generate_sound_effect(FakeContext(), "x", category="Combat"))
        self.assertEqual(self.fake.generate_calls[0]["category"], "Combat")

    def test_no_seed_means_engine_picks(self):
        asyncio.run(m.generate_sound_effect(FakeContext(), "x"))
        self.assertEqual(self.fake.generate_calls[0]["seed"], -1)

    def test_seed_passed_through(self):
        asyncio.run(m.generate_sound_effect(FakeContext(), "x", seed=1234))
        self.assertEqual(self.fake.generate_calls[0]["seed"], 1234)

    def test_bpm_goes_into_the_prompt(self):
        asyncio.run(m.generate_instrumental(FakeContext(), "a slow lute bed", bpm=90))
        self.assertIn("BPM: 90", self.fake.generate_calls[0]["prompt"])

    def test_progress_reported_to_client(self):
        ctx = FakeContext()
        asyncio.run(m.generate_sound_effect(ctx, "x"))
        self.assertTrue(ctx.reports, "expected at least one progress report")

    def test_result_reports_normalised_prompt_not_the_caller_text(self):
        """prompt_sent must be what the model got, tags and all."""
        blocks = asyncio.run(m.generate_sound_effect(FakeContext(), "a door slam"))
        self.assertEqual(blocks[0]["prompt_sent"], "TrackType: SFX, a door slam. Length: 2 seconds")

    def test_prompt_sent_falls_back_on_an_older_worker(self):
        del self.fake._done["modelPrompt"]
        blocks = asyncio.run(m.generate_sound_effect(FakeContext(), "a door slam"))
        self.assertEqual(blocks[0]["prompt_sent"], "a door slam")

    def test_engine_error_surfaces_verbatim(self):
        self.fake.raise_on_generate = EngineError("the forge is cold")
        with self.assertRaises(ToolError) as ctx:
            asyncio.run(m.generate_sound_effect(FakeContext(), "x"))
        self.assertIn("the forge is cold", str(ctx.exception))


class ProgressReporting(unittest.TestCase):
    """The worker heartbeats a stalled position, so a slow load repeats itself."""

    # Each emit must land in its own poll cycle to exercise the dedup rather
    # than the drain-to-latest that collapses a single burst.
    GAP = 0.3

    def test_unchanged_progress_reported_once(self):
        ctx = FakeContext()

        def work(on_progress):
            for _ in range(4):
                on_progress({"event": "progress", "step": 5, "total": 20, "phase": "weaving"})
                time.sleep(self.GAP)
            return {"event": "done"}

        asyncio.run(m._run_engine(ctx, work))
        self.assertEqual(len(ctx.reports), 1, msg=f"reports: {ctx.reports}")

    def test_moving_progress_reported_each_step(self):
        ctx = FakeContext()

        def work(on_progress):
            for step in (1, 2, 3):
                on_progress({"event": "progress", "step": step, "total": 20, "phase": "weaving"})
                time.sleep(self.GAP)
            return {"event": "done"}

        asyncio.run(m._run_engine(ctx, work))
        self.assertEqual([r[0] for r in ctx.reports], [1.0, 2.0, 3.0])

    def test_phase_change_is_reported_even_at_the_same_position(self):
        ctx = FakeContext()

        def work(on_progress):
            for phase in ("loading", "weaving"):
                on_progress({"event": "progress", "step": 0, "total": 20, "phase": phase})
                time.sleep(self.GAP)
            return {"event": "done"}

        asyncio.run(m._run_engine(ctx, work))
        self.assertEqual([r[2] for r in ctx.reports], ["Loading model", "Generating"])

    def test_result_passes_through(self):
        ctx = FakeContext()
        out = asyncio.run(m._run_engine(ctx, lambda _p: {"event": "done", "tag": "x"}))
        self.assertEqual(out["tag"], "x")


class Instruments(unittest.TestCase):
    def test_appends_missing_instruments(self):
        out = m._with_instruments("a slow bed", ["lute", "hand drum"])
        self.assertEqual(out, "a slow bed, lute, hand drum")

    def test_skips_instruments_already_mentioned(self):
        out = m._with_instruments("a slow lute bed", ["lute"])
        self.assertEqual(out, "a slow lute bed")

    def test_no_instruments_is_unchanged(self):
        self.assertEqual(m._with_instruments("a bed", None), "a bed")

    def test_passed_as_metadata_too(self):
        fake = FakeClient()
        real, m.client = m.client, fake
        try:
            asyncio.run(m.generate_instrumental(FakeContext(), "a bed", instruments=["lute"]))
        finally:
            m.client = real
        self.assertEqual(fake.generate_calls[0]["instruments"], ["lute"])


class InlineAudio(ClientPatch):
    def setUp(self):
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        self.wav = Path(self._tmp.name) / "clip.wav"
        write_wav(self.wav, seconds=1.0)

    def tearDown(self):
        super().tearDown()
        self._tmp.cleanup()

    def test_short_clip_inlined_as_opus(self):
        audio = m._inline_audio(self.wav, 2.0)
        self.assertIsInstance(audio, Audio)
        self.assertEqual(audio._mime_type, "audio/ogg")
        self.assertEqual(self.fake.encode_calls[0]["format"], "opus")
        self.assertTrue(self.fake.encode_calls[0]["mono"])

    def test_long_clip_not_inlined(self):
        self.assertIsNone(m._inline_audio(self.wav, m.INLINE_MAX_SECONDS + 1))
        self.assertEqual(self.fake.encode_calls, [])

    def test_unknown_duration_not_inlined(self):
        self.assertIsNone(m._inline_audio(self.wav, None))

    def test_encode_failure_loses_audio_not_the_clip(self):
        def boom(**_fields):
            raise EngineError("ffmpeg missing")

        self.fake.encode_audio = boom
        self.assertIsNone(m._inline_audio(self.wav, 1.0))

    def test_generation_marks_omitted_audio(self):
        self.fake._done["duration"] = 120.0
        self.fake._done["path"] = str(self.wav)
        blocks = asyncio.run(m.generate_ambience(FakeContext(), "rain", seconds=120))
        self.assertEqual(len(blocks), 1)
        self.assertIn("audio_omitted", blocks[0])

    def test_generation_attaches_audio_for_a_short_clip(self):
        self.fake._done["duration"] = 2.0
        self.fake._done["path"] = str(self.wav)
        blocks = asyncio.run(m.generate_sound_effect(FakeContext(), "slam", seconds=2))
        self.assertEqual(len(blocks), 2)
        self.assertIsInstance(blocks[1], Audio)


class CatalogTools(unittest.TestCase):
    def test_search_returns_prompts(self):
        out = m.search_prompt_catalog("sword", limit=5)
        self.assertGreater(out["count"], 0)
        self.assertRegex(out["results"][0]["prompt"], r"(?i)^TrackType:")

    def test_search_respects_limit(self):
        self.assertLessEqual(m.search_prompt_catalog("a", limit=3)["count"], 3)

    def test_search_rejects_unknown_library(self):
        with self.assertRaises(ToolError) as ctx:
            m.search_prompt_catalog("x", library="sfx")
        self.assertIn("unknown library", str(ctx.exception))

    def test_search_accepts_each_real_library(self):
        for lib in m.pc.LIBRARIES:
            with self.subTest(library=lib):
                m.search_prompt_catalog("a", library=lib, limit=1)

    def test_categories_listed(self):
        out = m.list_prompt_categories()
        self.assertEqual(out["libraries"], list(m.pc.LIBRARIES))
        self.assertGreater(len(out["categories"]), 0)
        self.assertGreater(out["categories"][0]["prompt_count"], 0)

    def test_categories_filtered(self):
        out = m.list_prompt_categories(library="music")
        self.assertTrue(all(c["library"] == "music" for c in out["categories"]))

    def test_categories_rejects_unknown_library(self):
        with self.assertRaises(ToolError):
            m.list_prompt_categories(library="nope")

    def test_catalog_prompt_carries_no_negative(self):
        """The negative is reported as unused, never as something applied."""
        out = m.search_prompt_catalog("sword", limit=5)
        for entry in out["results"]:
            self.assertNotIn("negative", entry)


class LibraryTools(ClientPatch):
    def setUp(self):
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.wav = self.root / "sfx" / "Combat" / "General" / "sword-1s-aaaa.wav"
        write_wav(self.wav)
        (self.root / li.META_FILENAME).write_text(
            json.dumps(
                {"version": 1, "clips": {"sword-1s-aaaa": {"favorite": True, "rating": 5}}}
            ),
            encoding="utf-8",
        )
        self._real_dir = m.li.library_dir
        m.li.library_dir = lambda override=None: self.root

    def tearDown(self):
        m.li.library_dir = self._real_dir
        super().tearDown()
        self._tmp.cleanup()

    def test_search_library_finds_clip(self):
        out = m.search_library()
        self.assertEqual(out["count"], 1)
        self.assertEqual(out["clips"][0]["id"], "sword-1s-aaaa")
        self.assertTrue(out["clips"][0]["favorite"])

    def test_search_library_reports_root(self):
        self.assertEqual(m.search_library()["library_dir"], str(self.root))

    def test_search_library_filters(self):
        self.assertEqual(m.search_library(mode="music")["count"], 0)
        self.assertEqual(m.search_library(query="combat")["count"], 1)

    def test_get_clip_by_id(self):
        blocks = m.get_clip("sword-1s-aaaa")
        self.assertEqual(blocks[0]["id"], "sword-1s-aaaa")
        self.assertEqual(len(blocks), 1)

    def test_get_clip_with_inline_audio(self):
        blocks = m.get_clip("sword-1s-aaaa", inline_audio=True)
        self.assertEqual(len(blocks), 2)
        self.assertIsInstance(blocks[1], Audio)

    def test_get_clip_unknown_raises(self):
        with self.assertRaises(ToolError):
            m.get_clip("no-such-clip")

    def test_export_clip(self):
        dest = self.root / "out" / "sword.opus"
        out = m.export_clip("sword-1s-aaaa", str(dest))
        self.assertEqual(out["source_clip"], "sword-1s-aaaa")
        self.assertEqual(self.fake.encode_calls[0]["format"], "opus")

    def test_export_rejects_relative_dest(self):
        with self.assertRaises(ToolError) as ctx:
            m.export_clip("sword-1s-aaaa", "out/sword.opus")
        self.assertIn("absolute", str(ctx.exception))

    def test_export_rejects_unknown_format(self):
        with self.assertRaises(ToolError) as ctx:
            m.export_clip("sword-1s-aaaa", str(self.root / "x.zip"), format="zip")
        self.assertIn("unknown format", str(ctx.exception))

    def test_export_rejects_unknown_clip(self):
        with self.assertRaises(ToolError):
            m.export_clip("nope", str(self.root / "x.opus"))

    def test_no_write_tools_exist(self):
        """The library is read-only here apart from export."""
        names = {t.name for t in asyncio.run(m.server.list_tools())}
        for banned in ("rate_clip", "tag_clip", "rename_clip", "delete_clip", "set_favorite"):
            self.assertNotIn(banned, names)


class Status(ClientPatch):
    def test_reports_pinned_preset(self):
        out = m.engine_status()
        self.assertEqual(out["preset"], "balanced")
        self.assertEqual(out["precision"], "fp16")

    def test_passes_through_vram(self):
        out = m.engine_status()
        self.assertEqual(out["vram_total_gb"], 8.0)
        self.assertEqual(out["gpu"], "mock")

    def test_does_not_start_the_engine(self):
        self.fake.alive = False
        out = m.engine_status()
        self.assertFalse(out["engine_running"])
        self.assertIn("note", out)

    def test_status_error_reported_not_raised(self):
        def boom(timeout=30.0):
            raise EngineError("driver not answering")

        self.fake.status = boom
        out = m.engine_status()
        self.assertIn("driver not answering", out["error"])


class InstanceLock(unittest.TestCase):
    def test_second_acquire_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "mcp.lock"
            first = m._InstanceLock(path)
            second = m._InstanceLock(path)
            self.assertTrue(first.acquire())
            try:
                self.assertFalse(second.acquire())
            finally:
                first.release()

    def test_released_lock_can_be_retaken(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "mcp.lock"
            first = m._InstanceLock(path)
            self.assertTrue(first.acquire())
            first.release()
            second = m._InstanceLock(path)
            self.assertTrue(second.acquire())
            second.release()

    def test_lock_path_is_under_app_data(self):
        self.assertEqual(m.lock_path().name, "mcp-server.lock")


class Failures(unittest.TestCase):
    def test_oom_without_app_running_is_unchanged(self):
        real, m._thunder_fx_app_running = m._thunder_fx_app_running, lambda: False
        try:
            err = m._engine_failure(EngineError("CUDA out of memory"))
        finally:
            m._thunder_fx_app_running = real
        self.assertEqual(str(err), "CUDA out of memory")

    def test_oom_with_app_running_adds_a_hint(self):
        real, m._thunder_fx_app_running = m._thunder_fx_app_running, lambda: True
        try:
            err = m._engine_failure(EngineError("CUDA out of memory"))
        finally:
            m._thunder_fx_app_running = real
        self.assertIn("desktop app is running", str(err))

    def test_non_oom_error_gets_no_hint(self):
        real, m._thunder_fx_app_running = m._thunder_fx_app_running, lambda: True
        try:
            err = m._engine_failure(EngineError("prompt is too long"))
        finally:
            m._thunder_fx_app_running = real
        self.assertEqual(str(err), "prompt is too long")


if __name__ == "__main__":
    unittest.main()
