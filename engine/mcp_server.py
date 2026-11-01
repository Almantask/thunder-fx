#!/usr/bin/env python3
"""MCP server for Thunder FX.

Exposes local audio generation, the shipped prompt catalog, and read access to
the library as MCP tools over stdio. Local runs only -- there is no network
transport here and no code path that opens a socket.

    claude mcp add thunder-fx -- <repo>\\engine\\.venv\\Scripts\\python.exe -u \\
        <repo>\\engine\\mcp_server.py

Quality is pinned: every generation runs the `balanced` preset on `medium` at
fp16, and nothing in the tool surface can change it. That is this engine's best
quality:speed:VRAM point, and the repo measured it -- see
`docs/designs/mcp-integration-design.md`. `medium-base` is never loaded.
"""

from __future__ import annotations

import contextlib
import os
import queue
import subprocess
import sys
import tempfile
import threading
import uuid
from functools import partial
from pathlib import Path

import anyio
from mcp.server.mcpserver import Audio, Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

import library_index as li  # noqa: E402
import prompt_catalog as pc  # noqa: E402
from engine_client import EngineClient, EngineError, IdleUnloader  # noqa: E402

# --- pinned generation settings -------------------------------------------
# Not parameters. See the module docstring.
PRESET = "balanced"
PRECISION = "fp16"

MODE_SFX = "sfx"
MODE_AMBIENCE = "ambience"
MODE_MUSIC = "music"

# Where MCP-generated clips land inside the library, so they are tellable from
# clips made in the app. Overridable per call.
DEFAULT_CATEGORY = "MCP"

EXPORT_FORMATS = ("opus", "ogg", "mp3", "flac", "wav", "aiff")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(float(os.environ.get(name, "").strip() or default))
    except ValueError:
        return default


def _env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes"}


# Opus at this bitrate is ~8 KB/s, so the cap is ~120 KB of audio and ~160 KB of
# base64 -- free in context terms, and long enough for every one-shot and short
# stinger. A two-minute bed comes back as a path only; inlining those is how a
# client's context gets destroyed.
INLINE_MAX_SECONDS = _env_float("THUNDER_FX_MCP_INLINE_MAX_SECONDS", 15.0)
INLINE_BITRATE_KBPS = _env_int("THUNDER_FX_MCP_INLINE_BITRATE_KBPS", 64)
IDLE_UNLOAD_S = _env_float("THUNDER_FX_MCP_IDLE_UNLOAD_S", 600.0)

INSTRUCTIONS = """\
Thunder FX generates sound effects, ambience beds and instrumental music locally
on this machine's GPU, using Stable Audio 3 Medium.

Prompts work best in the shape the model was trained on: a short concrete
description of the sound, its mic position and its space -- "steel blade cutting
air, fast whoosh, close mic, dry studio, fast decay". Keep it under 45 words.
Control tags, the length tag and loudness mastering are added for you.

Call `search_prompt_catalog` before writing a prompt from scratch: the shipped
catalog is stored in exactly that trained form, and reusing its wording gives
better takes than inventing prose.

Generation takes roughly 15-60 seconds and the first call also loads the model,
which can take minutes on a slow disk. Progress is reported as it goes.
"""

server = MCPServer(
    name="thunder-fx",
    title="Thunder FX",
    instructions=INSTRUCTIONS,
    version="0.1.0",
)

client = EngineClient()
idle_unloader = IdleUnloader(client, idle_seconds=IDLE_UNLOAD_S)


# --- single instance ------------------------------------------------------


class _InstanceLock:
    """Stops two servers both pulling ~6 GB of weights into VRAM.

    Held as an OS-level file lock rather than a pid file, so a crashed server
    releases it without leaving a stale lock behind.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self._handle = None

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = open(self.path, "a+")  # noqa: SIM115 — held for process lifetime
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            return False
        self._handle = handle
        return True

    def release(self) -> None:
        handle, self._handle = self._handle, None
        if handle is None:
            return
        with contextlib.suppress(OSError):
            handle.close()


def lock_path() -> Path:
    local = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_RUNTIME_DIR")
    base = Path(local) / "thunder-fx" if local else Path.home() / ".thunder-fx"
    return base / "mcp-server.lock"


# --- shared helpers -------------------------------------------------------


def _thunder_fx_app_running() -> bool:
    """Best-effort check for the desktop app holding the model.

    Only consulted after a CUDA OOM: the server cannot read the app's model
    state, so refusing up front would mean refusing runs that would have worked.
    """
    try:
        if os.name != "nt":
            return False
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq thunder-fx.exe", "/NH"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        return "thunder-fx.exe" in out.stdout.lower()
    except (OSError, subprocess.SubprocessError):
        return False


def _engine_failure(exc: Exception) -> ToolError:
    """Turn an engine error into a tool error, keeping the worker's wording."""
    message = str(exc)
    if "out of memory" in message.lower() and _thunder_fx_app_running():
        message += (
            "\n\nThe Thunder FX desktop app is running and may hold the model in VRAM. "
            "Close it, or use Settings to unload the model there, then try again."
        )
    return ToolError(message)


def _progress_text(event: dict) -> str:
    phase = str(event.get("phase") or "working")
    label = {
        "loading": "Loading model",
        "weaving": "Generating",
        "writing": "Writing WAV",
    }.get(phase, phase)
    message = str(event.get("message") or "").strip()
    return message or label


async def _run_engine(ctx: Context, work, *, poll: float = 0.25):
    """Run a blocking engine call, forwarding its progress to the MCP client.

    `work` takes one argument: the progress callback to hand the engine client.
    Progress events arrive on the client's reader thread, which cannot touch the
    event loop, so they cross over a thread-safe queue. Only the newest event in
    each poll is reported -- progress is a position, not a log, and a 100-step
    run would otherwise flood the client.
    """
    events: queue.Queue = queue.Queue(maxsize=512)
    finished = threading.Event()

    def on_progress(event: dict) -> None:
        # Dropping a progress event under backpressure is correct: the next one
        # carries a newer position anyway.
        with contextlib.suppress(queue.Full):
            events.put_nowait(event)

    async def pump() -> None:
        last_sent: tuple | None = None
        while True:
            latest = None
            while True:
                try:
                    latest = events.get_nowait()
                except queue.Empty:
                    break
            if latest is not None:
                total = latest.get("total") or 0
                step = latest.get("step") or 0
                ratio = latest.get("ratio")
                if ratio is not None:
                    progress, total_out = float(ratio) * 100.0, 100.0
                elif total:
                    progress, total_out = float(step), float(total)
                else:
                    progress, total_out = 0.0, None
                text = _progress_text(latest)
                # Only report movement. The worker heartbeats to keep a loading bar
                # alive, so a slow model load emits the same position several times
                # a second -- a 7-minute cold load measured 1668 identical reports
                # before this, all of them protocol traffic saying nothing.
                current = (progress, total_out, text)
                if current != last_sent:
                    last_sent = current
                    # A client that does not accept progress must not fail the run.
                    with contextlib.suppress(Exception):
                        await ctx.report_progress(progress, total_out, text)
            if finished.is_set() and events.empty():
                return
            await anyio.sleep(poll)

    # A task group wraps whatever escapes it in an ExceptionGroup, which would
    # hide the EngineError the callers match on -- so the engine's own failure is
    # carried out of the group by hand and re-raised with its type intact.
    # Cancellation is deliberately not caught here, so it still unwinds the group.
    outcome: dict = {}
    try:
        async with anyio.create_task_group() as tg:
            tg.start_soon(pump)
            try:
                outcome["value"] = await anyio.to_thread.run_sync(partial(work, on_progress))
            except Exception as exc:  # noqa: BLE001
                outcome["error"] = exc
            finally:
                finished.set()
    except anyio.get_cancelled_exc_class():
        # The MCP client cancelled: stop the GPU work rather than leaving it to
        # run to completion with nobody waiting for it.
        client.cancel()
        raise
    if "error" in outcome:
        raise outcome["error"]
    return outcome["value"]


def _inline_audio(path: Path, seconds: float | None) -> Audio | None:
    """Opus-encode a short clip for inline playback. None when too long."""
    if seconds is None or seconds > INLINE_MAX_SECONDS:
        return None
    tmp_dir = Path(tempfile.gettempdir()) / "thunder-fx-mcp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp = tmp_dir / f"{uuid.uuid4().hex}.opus"
    try:
        client.encode_audio(
            wav_path=str(path),
            dest_path=str(tmp),
            format="opus",
            bitrate=INLINE_BITRATE_KBPS,
            mono=True,
        )
        data = tmp.read_bytes()
    except (EngineError, OSError):
        # Playback is a convenience; losing it must not lose the clip.
        return None
    finally:
        with contextlib.suppress(OSError):
            tmp.unlink(missing_ok=True)
    # Opus is written into an OGG container by both encoder paths.
    return Audio(data=data, format="ogg")


def _with_instruments(description: str, instruments: list[str] | None) -> str:
    """Append instrument names the description does not already mention.

    They are metadata on the clip, but the model only hears the prompt -- so an
    instrument named only in the parameter would otherwise be silently ignored.
    The response reports `prompt_sent`, so the result of this is visible.
    """
    if not instruments:
        return description
    lower = description.lower()
    missing = [name for name in instruments if name.strip() and name.lower() not in lower]
    if not missing:
        return description
    joined = ", ".join(missing)
    body = description.rstrip().rstrip(".,;")
    return f"{body}, {joined}" if body else joined


def _generation_result(result: dict, *, inline: bool) -> list:
    path = Path(str(result.get("path") or ""))
    seconds = result.get("duration")
    payload = {
        "path": str(path),
        "seconds": seconds,
        "seed": result.get("seed"),
        "mode": result.get("mode"),
        "category": result.get("category"),
        "subcategory": result.get("subcategory"),
        "preset": result.get("preset"),
        "model": result.get("model"),
        "steps": result.get("steps"),
        "seamless_loop": bool(result.get("seamlessLoop")),
        # What the model actually received, tags and all -- not the description
        # as given. Falls back to the caller's text on an older worker.
        "prompt_sent": result.get("modelPrompt") or result.get("prompt"),
    }
    warnings = result.get("warnings") or []
    if warnings:
        payload["warnings"] = warnings
    blocks: list = [payload]
    if inline and path.is_file():
        audio = _inline_audio(path, seconds if isinstance(seconds, (int, float)) else None)
        if audio is not None:
            blocks.append(audio)
        else:
            payload["audio_omitted"] = (
                f"clip is longer than {INLINE_MAX_SECONDS:g}s; open the path to listen"
            )
    return blocks


async def _generate(
    ctx: Context,
    *,
    mode: str,
    description: str,
    seconds: float,
    seed: int | None,
    category: str | None,
    seamless_loop: bool = False,
    instruments: list[str] | None = None,
) -> list:
    text = (description or "").strip()
    if not text:
        raise ToolError("description is required")
    fields = {
        "prompt": _with_instruments(text, instruments),
        "seconds": pc.clamp_seconds(seconds),
        "mode": mode,
        "preset": PRESET,
        "category": (category or DEFAULT_CATEGORY).strip() or DEFAULT_CATEGORY,
        "seamlessLoop": bool(seamless_loop),
        "seed": int(seed) if seed else -1,
    }
    if instruments:
        fields["instruments"] = [str(i).strip() for i in instruments if str(i).strip()]

    def work(on_progress):
        # Serialised so a second concurrent call waits rather than being told by
        # the worker that a generation is already in progress.
        with client.work_lock:
            client.ensure_model(
                preset=PRESET, precision=PRECISION, on_progress=on_progress
            )
            return client.generate(on_progress=on_progress, **fields)

    try:
        result = await _run_engine(ctx, work)
    except EngineError as exc:
        raise _engine_failure(exc) from exc
    return _generation_result(result, inline=True)


# --- generation tools -----------------------------------------------------


@server.tool(
    name="generate_sound_effect",
    description=(
        "Generate a one-shot sound effect (impact, footstep, door, UI click, creature "
        "noise) on the local GPU and save it to the Thunder FX library. Returns the WAV "
        "path, and plays the clip inline when it is short. Describe the sound, its mic "
        "position and its space: 'steel blade cutting air, fast whoosh, close mic, dry "
        "studio, fast decay'. Peak-normalised to -1 dBFS, which is what a game engine "
        "triggering one-shots at unity wants."
    ),
    structured_output=False,
)
async def generate_sound_effect(
    ctx: Context,
    description: str,
    seconds: float = 2.0,
    seed: int | None = None,
    category: str | None = None,
) -> list:
    return await _generate(
        ctx,
        mode=MODE_SFX,
        description=description,
        seconds=seconds,
        seed=seed,
        category=category,
    )


@server.tool(
    name="generate_ambience",
    description=(
        "Generate a looping background ambience bed (rain, forest, tavern room tone, "
        "dungeon air) on the local GPU and save it to the Thunder FX library. Loops "
        "seamlessly by default. Mastered to -20 LUFS so beds sit under dialogue "
        "consistently. Longer clips come back as a path without inline playback."
    ),
    structured_output=False,
)
async def generate_ambience(
    ctx: Context,
    description: str,
    seconds: float = 30.0,
    seamless_loop: bool = True,
    seed: int | None = None,
    category: str | None = None,
) -> list:
    return await _generate(
        ctx,
        mode=MODE_AMBIENCE,
        description=description,
        seconds=seconds,
        seed=seed,
        category=category,
        seamless_loop=seamless_loop,
    )


@server.tool(
    name="generate_instrumental",
    description=(
        "Generate a short instrumental music bed or stinger on the local GPU and save it "
        "to the Thunder FX library. Always instrumental -- no vocals. Mastered to -18 "
        "LUFS, matching game-music delivery. Pass `bpm` for tempo and `instruments` to "
        "name the instrumentation; instruments not already in the description are "
        "appended to it, and the response reports the exact prompt sent."
    ),
    structured_output=False,
)
async def generate_instrumental(
    ctx: Context,
    description: str,
    seconds: float = 20.0,
    bpm: int | None = None,
    instruments: list[str] | None = None,
    seamless_loop: bool = False,
    seed: int | None = None,
    category: str | None = None,
) -> list:
    text = (description or "").strip()
    if bpm:
        # normalize_prompt lifts a BPM tag out of the text into the trailing
        # slot the model was trained on, so putting it inline here is enough.
        text = f"{text.rstrip().rstrip('.,;')}. BPM: {int(bpm)}"
    return await _generate(
        ctx,
        mode=MODE_MUSIC,
        description=text,
        seconds=seconds,
        seed=seed,
        category=category,
        seamless_loop=seamless_loop,
        instruments=instruments,
    )


# --- catalog tools --------------------------------------------------------


@server.tool(
    name="search_prompt_catalog",
    description=(
        "Search Thunder FX's shipped prompt catalog. Every entry is stored in the exact "
        "form Stable Audio 3 was trained on, so reusing its wording gives better results "
        "than writing a prompt from scratch. Pass the returned `prompt` straight to a "
        "generate tool as the description. Libraries: 'fx' (one-shots), 'ambience' "
        "(background beds), 'music' (instrumental)."
    ),
)
def search_prompt_catalog(
    query: str,
    library: str | None = None,
    limit: int = 20,
) -> dict:
    lib = (library or "").strip().lower() or None
    if lib and lib not in pc.LIBRARIES:
        raise ToolError(f"unknown library {library!r}; expected one of {', '.join(pc.LIBRARIES)}")
    hits = pc.search(query or "", library=lib, limit=max(1, min(100, limit)))
    return {"count": len(hits), "results": [entry.as_dict() for entry in hits]}


@server.tool(
    name="list_prompt_categories",
    description=(
        "List the categories in Thunder FX's shipped prompt catalog, with how many "
        "prompts each holds. Use it to see what material exists before searching."
    ),
)
def list_prompt_categories(library: str | None = None) -> dict:
    lib = (library or "").strip().lower() or None
    if lib and lib not in pc.LIBRARIES:
        raise ToolError(f"unknown library {library!r}; expected one of {', '.join(pc.LIBRARIES)}")
    cats = [c for c in pc.cached_catalog() if lib is None or c.library == lib]
    return {
        "libraries": list(pc.LIBRARIES),
        "categories": [
            {
                "id": c.id,
                "library": c.library,
                "name": c.name,
                "prompt_count": len(c.entries),
            }
            for c in cats
        ],
    }


# --- library tools --------------------------------------------------------


@server.tool(
    name="search_library",
    description=(
        "Search clips already in the Thunder FX library, newest first. Filter by text "
        "(matched against name, prompt and category), mode ('sfx', 'ambience', 'music'), "
        "favourites, a minimum star rating, or tags (a clip must carry every tag given). "
        "Rejected clips are hidden unless asked for. Read-only."
    ),
)
def search_library(
    query: str | None = None,
    mode: str | None = None,
    favorites_only: bool = False,
    show_rejected: bool = False,
    min_rating: int = 0,
    tags: list[str] | None = None,
    limit: int = 20,
) -> dict:
    root = li.library_dir()
    clips = li.search_clips(
        li.scan_library(root),
        query=query,
        mode=mode,
        favorites_only=favorites_only,
        show_rejected=show_rejected,
        min_rating=max(0, min(li.MAX_RATING, min_rating)),
        tags=tags,
        limit=max(1, min(200, limit)),
    )
    return {
        "library_dir": str(root),
        "count": len(clips),
        "clips": [clip.as_dict() for clip in clips],
    }


@server.tool(
    name="get_clip",
    description=(
        "Details of one library clip by id or absolute path: its prompt, mode, rating, "
        "tags and length. Set `inline_audio` to also play a short clip inline, which is "
        "how you listen back to a take you generated earlier."
    ),
    structured_output=False,
)
def get_clip(clip: str, inline_audio: bool = False) -> list:
    found = li.find_clip(clip, li.library_dir())
    if found is None:
        raise ToolError(f"no clip {clip!r} in the library")
    payload = found.as_dict()
    blocks: list = [payload]
    if inline_audio:
        audio = _inline_audio(found.path, found.seconds)
        if audio is not None:
            blocks.append(audio)
        else:
            payload["audio_omitted"] = (
                f"clip is longer than {INLINE_MAX_SECONDS:g}s; open the path to listen"
            )
    return blocks


@server.tool(
    name="export_clip",
    description=(
        "Encode a library clip to another format at a path you choose. Formats: opus, "
        "ogg, mp3, flac, wav, aiff. This is the only tool here that writes anything "
        "outside the library."
    ),
)
def export_clip(
    clip: str,
    dest_path: str,
    format: str = "opus",  # noqa: A002 — the engine's own field name
    bitrate: int | None = None,
    sample_rate: int | None = None,
    mono: bool = False,
) -> dict:
    found = li.find_clip(clip, li.library_dir())
    if found is None:
        raise ToolError(f"no clip {clip!r} in the library")
    fmt = (format or "opus").strip().lower()
    if fmt not in EXPORT_FORMATS:
        raise ToolError(f"unknown format {format!r}; expected one of {', '.join(EXPORT_FORMATS)}")
    dest = Path(dest_path).expanduser()
    if not dest.is_absolute():
        raise ToolError("dest_path must be an absolute path")
    fields: dict = {"wav_path": str(found.path), "dest_path": str(dest), "format": fmt}
    if bitrate:
        fields["bitrate"] = int(bitrate)
    if sample_rate:
        fields["sample_rate"] = int(sample_rate)
    if mono:
        fields["mono"] = True
    try:
        result = client.encode_audio(**fields)
    except EngineError as exc:
        raise _engine_failure(exc) from exc
    return {
        "path": result.get("path"),
        "format": result.get("format"),
        "encoder": result.get("encoder"),
        "bitrate": result.get("bitrate"),
        "source_clip": found.id,
    }


# --- status ---------------------------------------------------------------


@server.tool(
    name="engine_status",
    description=(
        "Whether the model is loaded, how much VRAM is in use, which GPU, and where the "
        "library lives. Also reports the pinned quality preset. Cheap: it does not load "
        "the model."
    ),
)
def engine_status() -> dict:
    payload = {
        "preset": PRESET,
        "precision": PRECISION,
        "model_loaded": client.model_loaded,
        "model": client.model_name,
        "library_dir": str(li.library_dir()),
        "inline_audio_max_seconds": INLINE_MAX_SECONDS,
        "idle_unload_seconds": IDLE_UNLOAD_S,
        "engine_running": client.alive,
    }
    if not client.alive:
        # Nothing is spawned until first use; say so rather than starting the
        # engine just to answer a status question.
        payload["note"] = "engine not started yet; it starts on the first generate call"
        return payload
    try:
        status = client.status()
    except EngineError as exc:
        payload["error"] = str(exc)
        return payload
    for key, out in (
        ("gpuName", "gpu"),
        ("vramUsedGb", "vram_used_gb"),
        ("vramTotalGb", "vram_total_gb"),
        ("device", "device"),
        ("mock", "mock_engine"),
        ("loaded", "engine_reports_loaded"),
        ("message", "message"),
    ):
        if key in status:
            payload[out] = status[key]
    return payload


def main() -> None:
    lock = _InstanceLock(lock_path())
    if not _env_flag("THUNDER_FX_MCP_ALLOW_MULTIPLE") and not lock.acquire():
        sys.stderr.write(
            "Another Thunder FX MCP server is already running. Two servers would each "
            "load the model into VRAM. Stop the other one, or set "
            "THUNDER_FX_MCP_ALLOW_MULTIPLE=1 if you know you have the headroom.\n"
        )
        raise SystemExit(1)
    idle_unloader.start()
    try:
        server.run("stdio")
    finally:
        idle_unloader.stop()
        client.stop()
        lock.release()


if __name__ == "__main__":
    main()
