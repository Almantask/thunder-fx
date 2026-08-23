# Thunder FX

A Windows-first desktop app for **local sound effects and instrumental music**: describe a clip, generate it with **Stable Audio 3 Medium**, trim it, and export **WAV** / **OGG** for games and video.

The studio uses a dark gold-and-leather look. It does **not** use Wizards of the Coast trademarks or art.

## Run the app (UI + mock engine)

Node 22+:

```bash
npm install
npm run dev
```

On Generate, switch **Sound effects** (default) and **Instrumental**. Instrumental uses the same Medium engine with `TrackType: Music` prompts and a vocals-avoiding negative prompt. Named instruments from the prompt are written into the WAVE file as RIFF INFO tags.

**Prompt catalog** loads the markdown pack in `prompts/`. Add effects (or a whole category) to a queue, then **Generate queue** to create them one after another. **Use** puts one prompt into Generate without queueing.

**Load model** puts Medium into VRAM. **Generate** only creates a clip. After an app restart, load the model once so generation time is not mixed with that wait.

```bash
npm test
npm run typecheck
npm run lint
```

## Desktop shell (Tauri)

Requires [Rust](https://rustup.rs/) and WebView2.

```bash
npm run tauri:dev
```

The engine process is `engine/worker.py`. Desktop (`npm run tauri:dev`) prefers `engine/.venv` and runs CUDA Medium once that env is installed. Browser `npm run dev` still uses the mock engine. Force mock with `THUNDER_FX_MOCK_ENGINE=1`.

## CUDA Medium (top quality, local)

Weights are **not** in this repo. They are under the [Stability AI Community License](https://stability.ai/license). The T5Gemma encoder is under [Gemma Terms of Use](https://ai.google.dev/gemma/terms).

On a machine with NVIDIA CUDA (~6 GB+ VRAM). This Windows pin is **Python 3.12 + PyTorch 2.7.1+cu128 + Flash Attention 2.8.3** (prebuilt wheel — do not compile FA2):

1. Install Python 3.12 x64 and [uv](https://docs.astral.sh/uv/).
2. Sync the engine env (CUDA torch, **not** CPU torch):

```bash
cd engine
uv sync
```

`pyproject.toml` pulls `stable-audio-3` from GitHub and a matching Windows FA2 wheel. If `import flash_attn` fails, setup will show the technical error — do not skip it.

3. Run the worker (mock is off unless `THUNDER_FX_MOCK_ENGINE=1`):

```bash
engine\.venv\Scripts\python.exe -u engine\worker.py
```

The CUDA venv is ~4 GB and Medium + T5Gemma weights are several more GB. If `C:` is full, set `UV_CACHE_DIR` and `HF_HUB_CACHE` to a larger drive and junction `engine/.venv` / `engine/.hf-cache` there. Setup downloads weights into `HF_HUB_CACHE` (needs a Hugging Face login that has accepted the Stability Community License and Gemma Terms).

Quality settings are fixed: fp32, 8 steps, unchunked decode (retry chunked only on CUDA OOM).

## Layout

- `src/` — React studio (Library, Generate, Settings; first-run setup)
- `engine/` — JSON-lines Python engine
- `src-tauri/` — Tauri 2 window, trim, engine spawn
- `docs/designs/` — scene specs + HTML prototypes
- `features/` — Gherkin acceptance specs
- `prompts/` — game SFX prompt catalog (also loaded in Generate → Prompt catalog)

App code is Apache-2.0 (see `LICENSE`). Model weights are downloaded separately and remain under Stability’s license.

## Release notes

See [CHANGELOG.md](CHANGELOG.md) for 0.3.0 (instrumental generate mode, prompt catalog queue) and 0.2.0 (Library / Generate / Settings tabs).
