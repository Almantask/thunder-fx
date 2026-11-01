# MCP integration

**Problem:** Generating a sound effect or a music bed means opening Thunder FX and typing in it.
An agent working on a game — writing a level, filling a sound folder — cannot ask for audio. The
engine already does the work; it just has no entry point other than the desktop app.

**Shape:** A local MCP server that owns an `engine/worker.py` subprocess and exposes generation,
the shipped prompt catalog, and read access to the library as MCP tools.

**Scope:** Local runs only. Stdio transport, no network listener anywhere in the design.

## Why the quality is not a parameter

Every generate call sends `preset: "balanced"`, `precision: "fp16"`, and nothing in the MCP
surface can change it.

That is the best quality:speed:VRAM ratio this engine has, and the repo already measured it:

- `medium` at Balanced sits in the **~6.2–7.6 GB** VRAM band (see the estimate table in
  `README.md`). `medium-base` is loaded in fp32 and converted afterwards, so its peak is higher
  again, on top of a ~9 GB download.
- Balanced is the **ceiling on `medium`**. The checkpoint is ARC-distilled and sampled with
  `pingpong`, which re-injects noise every step, so extra steps buy hallucinated detail rather
  than fidelity.
- Max quality is not a straight upgrade. It measured *worse* for instrumental — `medium-base`
  came out 38–51% darker and less varied at every CFG tested — which is why `QUALITY_BY_MODE`
  keeps music on `medium` even under the Max quality preset.

So `medium-base` is never loaded by this server. A preset knob here would offer a slower, far
more VRAM-hungry path that is only sometimes better, and the server cannot tell the caller
which time it is.

**Consequence: there is no negative-prompt parameter.** At CFG 1 the DiT skips its guidance
branch entirely, so a negative prompt would be a field that silently does nothing. Vocal
suppression for music comes from the `VocalType: Instrumental` control tag that
`normalize_prompt` already adds, which is trained and does work at CFG 1.

## Architecture

```
MCP client (Claude Code / Desktop / Cursor)
  │  stdio, JSON-RPC (MCP)
  ▼
engine/mcp_server.py        tool definitions only
  ├── engine/engine_client.py    spawns + talks to worker.py
  ├── engine/prompt_catalog.py   parses prompts/
  └── engine/library_index.py    scans the library folder
                 │  stdio, JSON-lines (existing protocol)
                 ▼
          engine/worker.py  ── Stable Audio 3 Medium (CUDA)
```

Four modules rather than one. `worker.py` is already 2 365 lines and a second file like it is
not wanted; each of these has one job and can be tested without the others.

**No generation logic is duplicated.** Prompt normalisation, loudness mastering, seamless-loop
construction, WAV `LIST`/`INFO` tagging and the library folder layout all stay in `worker.py`.
The MCP server is a client of the same protocol the Rust shell speaks.

### Dependency

The official `mcp` Python SDK (**2.x**, where the server class is `MCPServer` -- the v1
name `FastMCP` no longer exists), stdio transport only. It brings pydantic/httpx/starlette
along, which is irrelevant for a local tool, and in exchange protocol revisions, progress
notifications and cancellation are handled rather than hand-rolled.

### The one change to the engine

`worker.py` gained a `modelPrompt` field on its `generate` done event. The event already carried
`prompt`, but that is the caller's text -- the prompt the model receives has control tags, a
re-derived `Length:` tag and any `BPM:` lifted into the trailing slot. Reporting "the prompt
sent" without it would have meant either mislabelling the caller's text or re-deriving the
normalisation on this side, where it could drift. The field is additive and the Rust shell
parses the event untyped, so nothing else has to change.

### Process ownership

The server spawns `worker.py` with `sys.executable`, so it runs in the same venv that imported
the server — no interpreter discovery logic, unlike the Rust side which has to search for one.

- **Lazy load.** No model is loaded at startup. The first generate call issues `warmup`.
- **Idle unload.** After `THUNDER_FX_MCP_IDLE_UNLOAD_S` (default 600) with no work, the server
  sends `unload` so it does not squat on ~6 GB indefinitely. `0` disables.
- **Single instance.** A lock file under the user's local app data stops two MCP servers both
  loading Medium. Second instance exits with a message naming the first.
- **Serialised generation.** `worker.py` rejects overlapping work with "a generation is already
  in progress". The MCP server takes its own lock first, so a second concurrent tool call waits
  instead of failing.
- **Desktop app collision.** The server cannot read the app's model state, so it does not
  pre-emptively refuse. On a CUDA OOM it checks for a running `thunder-fx` process and, if one
  is there, says so in the error rather than reporting a bare OOM.

## Tools

### Generation

Three tools rather than one with a `mode` enum, so each carries its own duration default and
its own guidance — that is what makes a client pick the right one.

| Tool | Mode | Duration default | Mastering |
| :--- | :--- | ---: | :--- |
| `generate_sound_effect` | `sfx` | 2.0 s | −1.0 dBFS peak |
| `generate_ambience` | `ambience` | 30.0 s | −20 LUFS, peak-limited |
| `generate_instrumental` | `music` | 20.0 s | −18 LUFS, peak-limited |

Common parameters: `description` (required), `seconds`, `seed`, `category`.
`generate_ambience` adds `seamless_loop` (default **true** — a bed is for looping).
`generate_instrumental` adds `bpm`, `instruments`, and `seamless_loop` (default false).

Durations clamp to the engine's own `MIN_SECONDS`/`MAX_SECONDS` (0.5–380 s) rather than being
rejected, matching the slider.

Each call blocks and streams MCP progress notifications from the worker's existing `progress`
events, cold model load included — on a mechanical disk that load can run minutes, and silence
there is what makes a client give up.

Returns: absolute `path`, `duration`, `seed`, `prompt_sent` (the **normalised** prompt the model
actually received, not the caller's text), `mode`, `category`/`subcategory`, `warnings`, plus an
inline audio block when the clip is short enough.

### Inline audio

Opus, 64 kbps, mono, for clips at or under `THUNDER_FX_MCP_INLINE_MAX_SECONDS` (default **15**).
Encoded through the worker's existing `encode_audio` into a temp file, then returned as an MCP
audio content block.

~120 KB for 15 s, ~160 KB base64 — small enough to be free, and 15 s covers essentially every
sound effect and short stinger, which are the takes worth auditioning. A two-minute ambience bed
comes back as a path only; inlining those is how a client's context gets destroyed.

### Catalog

- `search_prompt_catalog(query, library=None, limit=20)`
- `list_prompt_categories(library=None)`

These exist because the shipped prompts are stored in the exact shape Stable Audio 3 was trained
on, and a client reusing that wording gets better takes than one inventing prose. Results carry
the prompt verbatim plus its suggested duration.

**Directory mapping is not what the names suggest** and must be carried over from
`src/lib/promptCatalog.ts`:

| Folder | Library |
| :--- | :--- |
| `prompts/fx` | `fx` |
| `prompts/environment` | `ambience` |
| `prompts/ambience` | `music` |

### Library

- `search_library(query=None, mode=None, favorites_only=False, min_rating=0, tags=None, limit=20)`
- `get_clip(clip, inline_audio=False)` — `clip` is a clip id (WAV file stem) or an absolute path
- `export_clip(clip, dest_path, format="opus", bitrate=None, sample_rate=None, mono=False)`

Clip identity is the WAV's file stem, matching `clip_json_from_path` in `src-tauri/src/lib.rs`.
Prompt and mode come from the file's `LIST`/`INFO` chunk via the existing `read_wav_info`;
favourites, ratings, tags and renames come from the `thunder-fx-meta.json` sidecar, read with
the same semantics as `src/lib/clipMeta.ts` (tags match as **all**, not any; rejects hidden
unless asked for). Export routes to the worker's `encode_audio`.

**The library is read-only here, except `export_clip` writing to a path the caller names.**
No rating, tagging, renaming, deleting or trash. An agent should not be editing triage
decisions, and delete is destructive. Deliberate omission, not an oversight.

### Status

`engine_status()` — model loaded and which checkpoint, VRAM used/total, GPU name, library path,
the preset in force, and whether the engine is in mock mode.

## Errors

Worker `error` events become MCP tool errors carrying the worker's message **verbatim**. No
fallback and no substitution anywhere — the same rule the preset system already follows, for the
same reason: an earlier version of this engine quietly swapped a sampler and the resulting
muffled output was untraceable.

- A dead worker is respawned once on the next call, with the stderr tail surfaced.
- MCP cancellation notifications map to the worker's `cancel` command.
- `THUNDER_FX_MOCK_ENGINE=1` propagates to the worker, so the whole surface runs with no GPU.

## Registration

```
claude mcp add thunder-fx -- <repo>\engine\.venv\Scripts\python.exe -u <repo>\engine\mcp_server.py
```

Documented in `README.md` along with the equivalent `mcp.json` block for Claude Desktop and
Cursor. No Settings UI.

## Testing

Per module, against a fake transport rather than a subprocess, plus one end-to-end test that
spawns the real server and a mock worker over stdio.

The tests that matter most:

- every generate path sends `preset: "balanced"` and **never** requests `medium-base`
- no generate path exposes or forwards a negative prompt
- the inline-audio cap holds, and a long clip returns a path with no audio block
- catalog parsing against the real `prompts/` tree, including the `environment`→ambience and
  `ambience`→music mapping
- library filters: tags match as all, rejects hidden by default, newest first
- worker errors surface verbatim rather than as a generic failure

## Out of scope

- Any network transport. Stdio only.
- Library writes other than export.
- A preset / steps / sampler / CFG / negative-prompt surface (see above).
- MCP resources and prompts. Tools cover the need and resource support across clients is uneven.
- A Settings UI for installing the server.
