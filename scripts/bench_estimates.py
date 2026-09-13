#!/usr/bin/env python3
"""Print the first-run estimate constants and the README tables they produce.

The TypeScript source of truth is `src/lib/perfBenchmarks.ts`
(`BASELINE_PERF_ESTIMATES`). This script reprints those numbers so a README
edit can be checked against the model without opening the app.

    python scripts/bench_estimates.py

To re-fit after a GPU bench, paste `runMeasurements` lead/step/tail from the
timing log into the constants below (keep them identical to the TS file) and
re-run. PQ-81: load times are the NVMe hardware-reference measurements;
generate costs are the phase model (Fast Preview is the loaded-model cost,
not the old 12.6 s wall that included 6 s of discarded padding).
"""

from __future__ import annotations

# Keep in lockstep with src/lib/perfBenchmarks.ts BASELINE_PERF_ESTIMATES.
LOAD_MS = {"fp16": 3500, "fp32": 5200, "mock": 2000}
GENERATE = {
    "fp16": {
        "leadMs": 1600,
        "stepBaseMs": 380,
        "stepPerSecMs": 21,
        "tailBaseMs": 1600,
        "tailPerSecMs": 40,
        "vramBaseGb": 6.2,
        "vramPerSecGb": 0.008,
    },
    "fp32": {
        "leadMs": 2400,
        "stepBaseMs": 520,
        "stepPerSecMs": 31,
        "tailBaseMs": 2400,
        "tailPerSecMs": 60,
        "vramBaseGb": 12.8,
        "vramPerSecGb": 0.016,
    },
}

README_ROWS = [
    ("Micro UI Click", 0.5, 4, "fp16"),
    ("Micro UI Click (HQ)", 0.5, 4, "fp32"),
    ("Quick Footstep / Foley", 1.5, 8, "fp16"),
    ("Quick Action Impact", 3.0, 15, "fp16"),
    ("Standard SFX (Default)", 8.0, 20, "fp16"),
    ("Standard SFX (FP32)", 8.0, 20, "fp32"),
    ("Fast Preview (1s @ 4 steps)", 1.0, 4, "fp16"),
]


def phase_total_ms(precision: str, seconds: float, steps: int) -> int:
    model = GENERATE[precision]
    step = model["stepBaseMs"] + model["stepPerSecMs"] * seconds
    tail = model["tailBaseMs"] + model["tailPerSecMs"] * seconds
    return round(model["leadMs"] + steps * step + tail)


def main() -> None:
    print("Load (NVMe hardware reference)")
    print(f"  FP16  {LOAD_MS['fp16'] / 1000:.1f} s")
    print(f"  FP32  {LOAD_MS['fp32'] / 1000:.1f} s")
    print()
    print("Generate phase model")
    for name, seconds, steps, precision in README_ROWS:
        ms = phase_total_ms(precision, seconds, steps)
        print(f"  {name:28} {seconds:6.1f}s x {steps:3} {precision}  ~{ms / 1000:.1f} s")
    print()
    print("TypeScript constants (paste into BASELINE_PERF_ESTIMATES if you re-fit):")
    print(f"  loadMs.fp16 = {LOAD_MS['fp16']}")
    print(f"  loadMs.fp32 = {LOAD_MS['fp32']}")
    for precision, model in GENERATE.items():
        print(f"  generate.{precision} = {model}")


if __name__ == "__main__":
    main()
