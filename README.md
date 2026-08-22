# Thunder FX

A Windows-first desktop **spellbook for sound**: describe an effect, weave it locally with **Stable Audio 3 Medium**, trim it, export **WAV** / **OGG** for games and video.

The UI is a D&D-inspired keep (candlelit, gold leaf, parchment well). It does **not** use Wizards of the Coast trademarks or art.

## Run the studio (UI + mock weave)

Node 22+:

```bash
npm install
npm run dev
```

Open http://localhost:1420. First Watch uses a **mock engine** so you can Cast without GPU weights. Mock audio is a deterministic impact tone, not Medium quality.

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

The sidecar is `engine/worker.py`. Desktop (`npm run tauri:dev`) prefers `engine/.venv` and runs CUDA Medium once that env is installed. Browser `npm run dev` still uses the mock engine. Force mock with `THUNDER_FX_MOCK_ENGINE=1`.

## CUDA Medium (top quality, local)

Weights are **not** in this repo. They are under the [Stability AI Community License](https://stability.ai/license). The T5Gemma encoder is under [Gemma Terms of Use](https://ai.google.dev/gemma/terms).

On a machine with NVIDIA CUDA (~6 GB+ VRAM). This Windows pin is **Python 3.12 + PyTorch 2.7.1+cu128 + Flash Attention 2.8.3** (prebuilt wheel — do not compile FA2):

1. Install Python 3.12 x64 and [uv](https://docs.astral.sh/uv/).
2. Sync the engine env (CUDA torch, **not** CPU torch):

```bash
cd engine
uv sync
```

`pyproject.toml` pulls `stable-audio-3` from GitHub and a matching Windows FA2 wheel. If `import flash_attn` fails, First Watch will show the technical error — do not skip it.

3. Run the worker (mock is off unless `THUNDER_FX_MOCK_ENGINE=1`):

```bash
engine\.venv\Scripts\python.exe -u engine\worker.py
```

The CUDA venv is ~4 GB and Medium + T5Gemma weights are several more GB. If `C:` is full, set `UV_CACHE_DIR` and `HF_HUB_CACHE` to a larger drive and junction `engine/.venv` / `engine/.hf-cache` there. First Watch scribing downloads weights into `HF_HUB_CACHE` (needs a Hugging Face login that has accepted the Stability Community License and Gemma Terms).

Quality settings are fixed: fp32, 8 steps, unchunked decode (retry chunked only on CUDA OOM).

## Layout

- `src/` — React studio (Library, Generate, Settings; First Watch)
- `engine/` — JSON-lines Python sidecar
- `src-tauri/` — Tauri 2 window, trim, sidecar spawn
- `docs/designs/` — scene specs + HTML prototypes
- `features/` — Gherkin acceptance specs

App code is Apache-2.0 (see `LICENSE`). Model weights are downloaded separately and remain under Stability’s license.

## Release notes

See [CHANGELOG.md](CHANGELOG.md) for 0.2.0 (Library / Generate / Settings tabs, error log, hover hints).
