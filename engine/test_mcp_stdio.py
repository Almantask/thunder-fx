#!/usr/bin/env python3
"""End-to-end test: a real MCP client driving the real server over stdio.

Runs the whole stack -- MCP protocol, server, worker subprocess -- with the
engine in mock mode, so it needs no GPU and no weights. This is what catches a
server that imports fine but cannot actually answer a tool call.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

import anyio
from mcp import ClientSession, StdioServerParameters, stdio_client

ENGINE_DIR = Path(__file__).resolve().parent
SERVER = ENGINE_DIR / "mcp_server.py"


def server_params(library_dir: str) -> StdioServerParameters:
    env = {
        "THUNDER_FX_MOCK_ENGINE": "1",
        "THUNDER_FX_MOCK_STEP_MS": "1",
        "THUNDER_FX_LIBRARY_DIR": library_dir,
        # So the test never collides with a server the developer has registered.
        "THUNDER_FX_MCP_ALLOW_MULTIPLE": "1",
        "THUNDER_FX_MCP_IDLE_UNLOAD_S": "0",
        "PATH": os.environ.get("PATH", ""),
        "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),
        "TEMP": os.environ.get("TEMP", tempfile.gettempdir()),
        "LOCALAPPDATA": os.environ.get("LOCALAPPDATA", ""),
    }
    return StdioServerParameters(
        command=sys.executable,
        args=["-u", str(SERVER)],
        env={k: v for k, v in env.items() if v},
    )


def text_of(result) -> str:
    return "\n".join(block.text for block in result.content if getattr(block, "text", None))


def audio_blocks(result) -> list:
    return [b for b in result.content if getattr(b, "type", "") == "audio"]


class StdioEndToEnd(unittest.TestCase):
    # Generous: each case spawns a server and a worker, and the whole suite
    # measured 149s idle but 594s while two release builds were running --
    # where a 180s cap failed three cases on timing alone.
    def run_session(self, body, timeout: float = 600.0):
        """Drive one client session against a fresh server."""
        outcome: dict = {}

        async def main():
            with tempfile.TemporaryDirectory() as tmp, anyio.fail_after(timeout):
                async with (
                    stdio_client(server_params(tmp)) as (read, write),
                    ClientSession(read, write) as session,
                ):
                    await session.initialize()
                    outcome["value"] = await body(session, Path(tmp))

        anyio.run(main)
        return outcome["value"]

    def test_lists_every_tool(self):
        async def body(session, _tmp):
            return [t.name for t in (await session.list_tools()).tools]

        names = self.run_session(body)
        self.assertEqual(len(names), 9)
        self.assertIn("generate_sound_effect", names)
        self.assertIn("search_prompt_catalog", names)

    def test_server_reports_instructions(self):
        async def body(session, _tmp):
            return session
        # initialize() succeeding at all is the assertion here; a server whose
        # import fails never gets this far.
        self.run_session(body)

    def test_catalog_search_over_the_wire(self):
        async def body(session, _tmp):
            return await session.call_tool("search_prompt_catalog", {"query": "sword"})

        result = self.run_session(body)
        self.assertFalse(result.is_error)
        body_text = text_of(result)
        self.assertIn("TrackType:", body_text)

    def test_engine_status_before_any_generation(self):
        async def body(session, _tmp):
            return await session.call_tool("engine_status", {})

        result = self.run_session(body)
        self.assertFalse(result.is_error)
        text = text_of(result)
        self.assertIn("balanced", text)
        self.assertIn("fp16", text)

    def test_generate_writes_a_clip_and_inlines_audio(self):
        async def body(session, tmp):
            result = await session.call_tool(
                "generate_sound_effect",
                {"description": "a heavy oak door slamming, close mic, dry studio", "seconds": 2},
            )
            return result, sorted(p.name for p in tmp.rglob("*.wav"))

        result, wavs = self.run_session(body)
        self.assertFalse(result.is_error, msg=text_of(result))
        self.assertEqual(len(wavs), 1, msg=f"expected one WAV, got {wavs}")
        text = text_of(result)
        self.assertIn('"preset": "balanced"', text)
        self.assertIn("TrackType: SFX", text)
        blocks = audio_blocks(result)
        self.assertEqual(len(blocks), 1, msg="expected one inline audio block")
        self.assertEqual(blocks[0].mime_type, "audio/ogg")

    def test_long_clip_comes_back_without_audio(self):
        async def body(session, _tmp):
            return await session.call_tool(
                "generate_ambience",
                {"description": "steady rain on a canvas tent", "seconds": 40},
            )

        result = self.run_session(body)
        self.assertFalse(result.is_error, msg=text_of(result))
        self.assertEqual(audio_blocks(result), [])
        self.assertIn("audio_omitted", text_of(result))

    def test_generated_clip_is_findable_in_the_library(self):
        async def body(session, _tmp):
            await session.call_tool(
                "generate_sound_effect", {"description": "a small brass bell", "seconds": 1}
            )
            return await session.call_tool("search_library", {"query": "bell"})

        result = self.run_session(body)
        self.assertFalse(result.is_error, msg=text_of(result))
        self.assertIn("brass bell", text_of(result))

    def test_progress_notifications_reach_the_client(self):
        async def body(session, _tmp):
            seen: list = []

            async def on_progress(progress, total, message):
                seen.append((progress, total, message))

            await session.call_tool(
                "generate_sound_effect",
                {"description": "a dry wooden knock", "seconds": 1},
                progress_callback=on_progress,
            )
            return seen

        seen = self.run_session(body)
        self.assertTrue(seen, "expected progress notifications during generation")

    def test_bad_arguments_come_back_as_an_error(self):
        async def body(session, _tmp):
            return await session.call_tool("search_prompt_catalog", {"query": "x", "library": "no"})

        result = self.run_session(body)
        self.assertTrue(result.is_error)
        self.assertIn("unknown library", text_of(result))

    def test_unknown_clip_errors_rather_than_crashing_the_server(self):
        async def body(session, _tmp):
            bad = await session.call_tool("get_clip", {"clip": "no-such-clip"})
            # The server must still be answering afterwards.
            good = await session.call_tool("engine_status", {})
            return bad, good

        bad, good = self.run_session(body)
        self.assertTrue(bad.is_error)
        self.assertFalse(good.is_error)


if __name__ == "__main__":
    unittest.main()
