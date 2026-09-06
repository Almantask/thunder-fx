#!/usr/bin/env python3
"""Generate the same prompts at each quality preset, for a blind listen.

The objective measures in engine/audio_metrics.py catch collapse reliably, but
they are not a substitute for hearing it: they nearly passed a setting that was
audibly muffled, and the tolerance had to be corrected against a real listening
result. So this writes the clips *and* the numbers, and hides the labels until
you ask for them.

Presets that need a checkpoint you have not installed are skipped, not
substituted -- the same rule the engine follows.

    engine\\.venv\\Scripts\\python.exe scripts/compare_presets.py
    engine\\.venv\\Scripts\\python.exe scripts/compare_presets.py --seeds 3
"""

from __future__ import annotations

import argparse
import csv
import html
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "engine"))

os.environ.pop("THUNDER_FX_MOCK_ENGINE", None)

import audio_metrics  # noqa: E402
import worker as w  # noqa: E402

CASES = [
    ("sfx", 3.0, "heavy oak door slamming shut in a stone hall, close mic, short decay"),
    ("ambience", 12.0, "heavy rain on a metal roof, distant thunder, steady bed, looping-friendly"),
    ("music", 15.0, "dark orchestral tension, low brass swells, quiet string ostinato, 60 BPM"),
]
SEEDS = (4242, 1337, 90210)


def write_index(out_dir: Path, rows: list[dict]) -> None:
    """Blind A/B page: which preset made which clip stays hidden until asked."""
    by_case: dict[str, list[dict]] = {}
    for row in rows:
        by_case.setdefault(f"{row['mode']} · seed {row['seed']}", []).append(row)

    sections = []
    for title, entries in by_case.items():
        items = []
        for i, row in enumerate(entries, start=1):
            label = (
                f"{row['preset']} — {row['model']}, {row['sampler']}, "
                f"{row['steps']} steps, cfg {row['cfg']}"
            )
            numbers = (
                f"crest {row['crest_db']:.1f} dB · level spread {row['level_spread_db']:.1f} dB · "
                f"centroid {row['centroid_hz']:.0f} Hz · >8 kHz {row['high_ratio']:.4f} · "
                f"flux {row['flux']:.4f}"
            )
            items.append(
                f'<li><span class="tag">{i}</span>'
                f'<audio controls preload="none" src="{html.escape(row["path"])}"></audio>'
                f'<span class="who" hidden>{html.escape(label)}<br><small>{html.escape(numbers)}</small></span></li>'
            )
        sections.append(
            f"<section><h2>{html.escape(title)}</h2><ol>{''.join(items)}</ol></section>"
        )

    out_dir.joinpath("index.html").write_text(
        "<!doctype html><meta charset=utf-8><title>Thunder FX preset comparison</title>"
        "<style>body{font:14px system-ui;margin:2rem;max-width:64rem}"
        "li{margin:.5rem 0;display:flex;gap:.6rem;align-items:center}"
        ".tag{font-variant-numeric:tabular-nums;opacity:.6;width:2rem}"
        ".who{font-family:ui-monospace,monospace;font-size:12px}"
        "button{margin-bottom:1rem;padding:.4rem .8rem}</style>"
        "<h1>Preset comparison</h1>"
        "<p>Within a section every clip is the same prompt, duration and seed, level-matched by "
        "the shipped mastering. Only the preset differs. Listen first, then reveal — the numbers "
        "are there to explain what you heard, not to decide it for you.</p>"
        "<button onclick=\"document.querySelectorAll('.who').forEach(e=>e.hidden=!e.hidden)\">"
        "Toggle labels</button>" + "".join(sections),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(ROOT / "bench" / "presets"))
    parser.add_argument("--seeds", type=int, default=1, help="how many seeds per case (1-3)")
    parser.add_argument("--precision", default="fp16", choices=["fp16", "fp32"])
    args = parser.parse_args()

    seeds = SEEDS[: max(1, min(3, args.seeds))]
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    presets = [
        name
        for name in ("speed", "balanced", "quality")
        if not w.resolve_preset(name, strict=False)["unavailable"]
    ]
    skipped = [n for n in ("speed", "balanced", "quality") if n not in presets]
    if skipped:
        print(f"not installed, skipping: {', '.join(skipped)}")

    rows: list[dict] = []
    # Preset-major so each checkpoint is loaded once, not once per case.
    for preset in presets:
        plan = w.resolve_preset(preset, strict=False)
        print(
            f"\n=== {preset}: {plan['model']}, {plan['sampler']}, "
            f"{plan['steps']} steps, cfg {plan['cfg']} ===",
            flush=True,
        )
        model = w._try_load_model(args.precision, plan["model"])
        if model is None:
            print("no real model available")
            return 1
        sample_size = int(model.model_config["sample_size"])
        for mode, seconds, text in CASES:
            sub = out_dir / mode
            sub.mkdir(parents=True, exist_ok=True)
            for seed in seeds:
                started = time.time()
                audio = model.generate(
                    prompt=w.normalize_prompt(text, mode=mode, seconds=seconds),
                    duration=seconds,
                    steps=plan["steps"],
                    seed=seed,
                    cfg_scale=plan["cfg"],
                    sample_size=sample_size,
                    sampler_type=plan["sampler"],
                    chunked_decode=args.precision == "fp16",
                )
                elapsed = time.time() - started
                path = sub / f"{mode}-seed{seed}-{preset}.wav"
                w._save_generated_wav(path, audio, master=True, mode=mode)
                row = {
                    "mode": mode,
                    "seed": seed,
                    "preset": preset,
                    "model": plan["model"],
                    "sampler": plan["sampler"],
                    "steps": plan["steps"],
                    "cfg": plan["cfg"],
                    "elapsed_s": round(elapsed, 1),
                    "path": str(path.relative_to(out_dir)).replace(os.sep, "/"),
                }
                row.update(
                    audio_metrics.describe(
                        w._master_audio_cpu(w._to_stereo_cpu(audio), mode)
                    )
                )
                rows.append(row)
                print(
                    f"  {mode:10s} seed {seed}  {elapsed:6.1f}s  "
                    f"crest {row['crest_db']:6.2f}  spread {row['level_spread_db']:6.2f}  "
                    f"centroid {row['centroid_hz']:6.0f}",
                    flush=True,
                )

    with (out_dir / "metrics.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    write_index(out_dir, rows)
    print(f"\nOpen {out_dir / 'index.html'} and listen before reading metrics.csv.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
