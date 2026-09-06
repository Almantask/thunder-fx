#!/usr/bin/env python3
"""Objective descriptors for generated audio.

These exist to catch a specific failure: a "higher quality" setting that actually
produces flatter, duller, more uniform audio. Each measure maps to something a
listener would say out loud.

    crest_db          peak over RMS                  -> "no dynamics"
    level_spread_db   spread of 100 ms block levels  -> "no dynamics over time"
    centroid_hz       spectral centroid              -> "muffled", "underwater"
    high_ratio        share of energy above 8 kHz    -> "muffled", "underwater"
    flux              frame-to-frame spectral change -> "similar sound all over"

Everything is computed on the mastered signal, so loudness normalisation cannot
skew a comparison between two settings.
"""

from __future__ import annotations

import math

SAMPLE_RATE = 44100
HIGH_BAND_HZ = 8000.0
BLOCK_SECONDS = 0.1
N_FFT = 2048
HOP = 512


def describe(wav, sample_rate: int = SAMPLE_RATE) -> dict:
    """Descriptors for a mastered [channels, samples] float tensor in [-1, 1]."""
    import torch

    mono = wav.mean(dim=0).double()
    if mono.numel() < N_FFT:
        raise ValueError("clip is too short to describe")

    peak = float(mono.abs().max())
    rms = float(torch.sqrt((mono**2).mean()))
    crest = 20 * math.log10(max(peak, 1e-12) / max(rms, 1e-12))

    # How much the level actually moves over the clip.
    block = int(BLOCK_SECONDS * sample_rate)
    usable = (mono.shape[-1] // block) * block
    block_db = 20 * torch.log10(
        torch.sqrt((mono[:usable].view(-1, block) ** 2).mean(dim=-1)).clamp(min=1e-10)
    )
    level_spread = float(block_db.std()) if block_db.numel() > 1 else 0.0

    window = torch.hann_window(N_FFT, dtype=torch.float64)
    spec = torch.stft(
        mono, n_fft=N_FFT, hop_length=HOP, window=window, return_complex=True
    ).abs()
    freqs = torch.fft.rfftfreq(N_FFT, 1.0 / sample_rate)

    frame_total = spec.sum(dim=0).clamp(min=1e-12)
    centroid = float(((spec * freqs[:, None]).sum(dim=0) / frame_total).mean())
    high_ratio = float(spec[freqs > HIGH_BAND_HZ].sum() / spec.sum().clamp(min=1e-12))

    # Per-frame unit-sum spectra, so flux measures variety rather than loudness.
    norm = spec / frame_total
    flux = (
        float((norm[:, 1:] - norm[:, :-1]).abs().sum(dim=0).mean())
        if norm.shape[-1] > 1
        else 0.0
    )

    return {
        "crest_db": crest,
        "level_spread_db": level_spread,
        "centroid_hz": centroid,
        "high_ratio": high_ratio,
        "flux": flux,
    }


# A higher-quality setting is allowed to differ, but not to go *duller* or
# *flatter* than the setting below it by more than this. Generation is
# stochastic even at a fixed seed once the sampler changes, so these are
# deliberately loose -- they catch collapse, not ordinary variation.
DEGRADATION_TOLERANCE = {
    "crest_db": 3.0,          # dB of dynamic range that may be lost
    "level_spread_db": 0.25,  # relative level movement that may be lost
    "centroid_hz": 0.25,      # relative brightness that may be lost
    "high_ratio": 0.30,       # relative share of >8 kHz energy that may be lost
    "flux": 0.25,             # relative frame-to-frame variety that may be lost
}

# Measures where a *relative* drop is the meaningful comparison, because their
# absolute scale depends entirely on the material.
#
# level_spread_db is relative because a one-shot and a sustained bed are not on
# the same scale at all: a door slam swings 30+ dB between its transient and the
# silence after it, so a couple of dB there is noise, while the same couple of dB
# on a 5 dB bed would be a collapse.
#
# centroid_hz is relative for the same reason, and because an absolute gate was
# demonstrably too loose: two settings that dulled by 1100-1300 Hz -- audibly
# muffled -- slipped under a 1500 Hz allowance because their starting brightness
# differed. A percentage catches both bright and dark material.
_RELATIVE = {"high_ratio", "flux", "level_spread_db", "centroid_hz"}


def verdict(baseline: dict, candidate: dict) -> list[str]:
    """Ways `candidate` is audibly worse than `baseline`; empty means acceptable.

    A single measure moving is not a regression -- two settings can differ
    without one being worse, and judging each measure in isolation both cried
    wolf (a one-shot's level spread) and missed a real collapse (brightness
    lost against too loose a gate). What listeners actually complain about is
    combinations:

        muffled / underwater  brightness drops -- centroid or high-band share
        no dynamics           peak-to-average *and* level movement both drop
        same all over         frame-to-frame spectral variety drops

    So brightness and variety each fail on their own, while a level measure
    only fails when its partner falls with it.
    """
    lost = {name.split(" ")[0] for name in _regressed(baseline, candidate)}
    reasons = []
    if "centroid_hz" in lost or "high_ratio" in lost:
        reasons.append("muffled: the result lost brightness")
    if "crest_db" in lost and "level_spread_db" in lost:
        reasons.append("no dynamics: peak-to-average and level movement both fell")
    if "flux" in lost:
        reasons.append("uniform: less change from moment to moment")
    if not reasons:
        return []
    return reasons + ["measured: " + "; ".join(degradations(baseline, candidate))]


def _regressed(baseline: dict, candidate: dict) -> list[str]:
    return [entry.split(" ")[0] for entry in degradations(baseline, candidate)]


def degradations(baseline: dict, candidate: dict) -> list[str]:
    """Ways `candidate` is duller or flatter than `baseline` beyond tolerance.

    Returns human-readable strings, empty when the candidate holds up.
    """
    problems: list[str] = []
    for key, allowed in DEGRADATION_TOLERANCE.items():
        before = baseline[key]
        after = candidate[key]
        if key in _RELATIVE:
            if before <= 0:
                continue
            drop = (before - after) / before
            if drop > allowed:
                problems.append(
                    f"{key} fell {drop * 100:.0f}% ({before:.4f} -> {after:.4f}), "
                    f"more than the {allowed * 100:.0f}% allowed"
                )
        else:
            drop = before - after
            if drop > allowed:
                problems.append(
                    f"{key} fell {drop:.2f} ({before:.2f} -> {after:.2f}), "
                    f"more than the {allowed:.2f} allowed"
                )
    return problems
