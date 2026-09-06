#!/usr/bin/env python3
"""Bench sampler x steps per content type, to settle the quality-preset table.

Two things this exists to measure:

1. Sampler by content type. `pingpong` re-injects fresh noise on every step, so
   it preserves stochastic high-frequency detail (rain, fire, gravel, transients)
   at the cost of a noise floor. `euler` and `dpmpp` are deterministic and
   converge cleaner, which should suit tonal material (pads, drones, sustained
   music) where that floor reads as hiss.

2. Steps by sampler. This is the direct check on "does the quality dial work":
   step count should *degrade* output under pingpong and *improve* it under the
   deterministic samplers, and each should plateau somewhere.

Outputs into bench/:
  <mode>/<sampler>-<steps>/<slug>-seed<N>.wav
  metrics.csv     peak, integrated LUFS, RMS, spectral centroid, >10 kHz ratio,
                  DC offset, wall-clock
  index.html      blind A/B player -- sampler and step labels are hidden until
                  you reveal them, so the call gets made by ear first

Needs the real CUDA engine; it will refuse to run against the mock.

    engine\\.venv\\Scripts\\python.exe scripts/bench_sampler.py
    engine\\.venv\\Scripts\\python.exe scripts/bench_sampler.py --quick
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import math
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "engine"))

# The bench drives the real model; mock mode would produce synthetic tones.
os.environ.pop("THUNDER_FX_MOCK_ENGINE", None)

import worker as w  # noqa: E402  (path set up above)

# One prompt per content type, plus a short one-shot, all already in the
# catalog's canonical shape so the bench measures the sampler and nothing else.
PROMPTS = [
    ("sfx-oneshot", "sfx", 1.5, "steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay"),
    ("sfx-action", "sfx", 5.0, "heavy oak door slamming shut in a stone hall, close mic, short decay"),
    ("ambience-bed", "ambience", 30.0, "heavy rain on a metal roof, distant thunder, steady bed, looping-friendly"),
    ("music-bed", "music", 20.0, "dark orchestral tension, low brass swells, quiet string ostinato, 60 BPM"),
]

SAMPLERS = ("pingpong", "euler", "dpmpp")
STEPS = (8, 16, 32, 50)
SEEDS = (12345, 67890)

QUICK_SAMPLERS = ("pingpong", "dpmpp")
QUICK_STEPS = (8, 32)
QUICK_SEEDS = (12345,)


def metrics(wav, sample_rate: int = 44100) -> dict:
    """Objective descriptors for one clip, computed on the shipped master."""
    import torch

    from audio_metrics import describe

    mono = wav.mean(dim=0)
    peak = float(wav.abs().max())
    rms = float(torch.sqrt((mono.double() ** 2).mean()))

    def dbfs(value: float) -> float:
        return 20.0 * math.log10(max(value, 1e-12))

    lufs = w.integrated_lufs(wav, sample_rate)
    out = {
        "peak_dbfs": round(dbfs(peak), 2),
        "rms_dbfs": round(dbfs(rms), 2),
        "lufs": round(lufs, 2) if lufs is not None else "",
        "dc_offset": round(float(mono.mean()), 6),
    }
    # The measures that tell a dull, flat, uniform result from a lively one.
    out.update({k: round(v, 5) for k, v in describe(wav, sample_rate).items()})
    return out


def write_index(out_dir: Path, rows: list[dict]) -> None:
    """A blind A/B player: labels stay hidden until you ask for them."""
    by_prompt: dict[str, list[dict]] = {}
    for row in rows:
        by_prompt.setdefault(row["prompt"], []).append(row)

    blocks = []
    for prompt_id, entries in by_prompt.items():
        items = []
        for i, row in enumerate(entries, start=1):
            label = f"{row['sampler']} @ {row['steps']} steps, seed {row['seed']}"
            items.append(
                f'<li><span class="tag">{i}</span>'
                f'<audio controls preload="none" src="{html.escape(row["path"])}"></audio>'
                f'<span class="who" hidden>{html.escape(label)}</span></li>'
            )
        blocks.append(
            f"<section><h2>{html.escape(prompt_id)}</h2><ol>{''.join(items)}</ol></section>"
        )

    out_dir.joinpath("index.html").write_text(
        "<!doctype html><meta charset=utf-8><title>Thunder FX sampler bench</title>"
        "<style>body{font:14px system-ui;margin:2rem;max-width:60rem}"
        "li{margin:.4rem 0;display:flex;gap:.6rem;align-items:center}"
        ".tag{font-variant-numeric:tabular-nums;opacity:.6;width:2rem}"
        ".who{font-family:ui-monospace,monospace;font-size:12px}"
        "button{margin-bottom:1rem;padding:.4rem .8rem}</style>"
        "<h1>Sampler bench</h1>"
        "<p>Listen first, then reveal. Within one section every clip is the same "
        "prompt at the same duration, level-matched by the shipped mastering.</p>"
        "<button onclick=\"document.querySelectorAll('.who').forEach(e=>e.hidden=!e.hidden)\">"
        "Toggle labels</button>" + "".join(blocks),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(ROOT / "bench"), help="output directory")
    parser.add_argument(
        "--quick",
        action="store_true",
        help="two samplers, two step counts, one seed -- a smoke run, not a verdict",
    )
    parser.add_argument("--precision", default="fp16", choices=["fp16", "fp32"])
    args = parser.parse_args()

    samplers = QUICK_SAMPLERS if args.quick else SAMPLERS
    steps_grid = QUICK_STEPS if args.quick else STEPS
    seeds = QUICK_SEEDS if args.quick else SEEDS

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    total = len(PROMPTS) * len(samplers) * len(steps_grid) * len(seeds)
    print(f"Loading medium ({args.precision})...")
    model = w._try_load_model(args.precision)
    if model is None:
        print("Refusing to run: no real model loaded (mock mode or CUDA missing).")
        return 1
    sample_size = int(model.model_config["sample_size"])

    rows: list[dict] = []
    done = 0
    for slug, mode, seconds, text in PROMPTS:
        prompt = w.normalize_prompt(text, mode=mode, seconds=seconds)
        for sampler in samplers:
            for steps in steps_grid:
                sub = out_dir / mode / f"{sampler}-{steps}"
                sub.mkdir(parents=True, exist_ok=True)
                for seed in seeds:
                    done += 1
                    started = time.time()
                    audio = model.generate(
                        prompt=prompt,
                        duration=seconds,
                        steps=steps,
                        seed=seed,
                        cfg_scale=1.0,
                        sample_size=sample_size,
                        sampler_type=sampler,
                        chunked_decode=args.precision == "fp16",
                    )
                    elapsed = time.time() - started

                    path = sub / f"{slug}-seed{seed}.wav"
                    w._save_generated_wav(path, audio, master=True, mode=mode)
                    row = {
                        "prompt": slug,
                        "mode": mode,
                        "seconds": seconds,
                        "sampler": sampler,
                        "steps": steps,
                        "seed": seed,
                        "elapsed_s": round(elapsed, 2),
                        "path": str(path.relative_to(out_dir)).replace(os.sep, "/"),
                    }
                    row.update(metrics(w._master_audio_cpu(w._to_stereo_cpu(audio), mode)))
                    rows.append(row)
                    print(
                        f"[{done}/{total}] {slug:14s} {sampler:9s} {steps:>3} steps "
                        f"seed {seed}  {elapsed:6.1f}s  "
                        f"crest {row['crest_db']:.1f} dB  hi>8k {row['high_ratio']:.4f}  "
                        f"flux {row['flux']:.4f}  LUFS {row['lufs']}"
                    )

    with (out_dir / "metrics.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    (out_dir / "metrics.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    write_index(out_dir, rows)

    print(f"\nWrote {len(rows)} clips to {out_dir}")
    print(f"Open {out_dir / 'index.html'} and listen before reading metrics.csv.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
