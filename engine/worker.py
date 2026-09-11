#!/usr/bin/env python3
"""Keep-alive JSON-lines worker for Thunder FX.

Protocol (one JSON object per line):

  {"id":"1","cmd":"status"}
  {"id":"2","cmd":"probe"}
  {"id":"3","cmd":"generate","prompt":"...","seconds":8,"seed":-1,"cfg":1.0,"negative":"","mode":"music","instruments":["lute"]}
  {"id":"3","cmd":"cancel"}
  {"id":"4","cmd":"encode_ogg","wav_path":"...","ogg_path":"..."}
  {"id":"5","cmd":"warmup"}

Mock mode is enabled with THUNDER_FX_MOCK_ENGINE=1. Unset (or 0) uses CUDA
Medium. Tests force mock; the desktop sidecar prefers engine/.venv.
"""

from __future__ import annotations

import array
import contextlib
import inspect
import json
import math
import os
import random
import re
import struct
import sys
import threading
import time
import traceback
import uuid
import wave
from contextlib import contextmanager
from pathlib import Path

SAMPLE_RATE = 44100
CHANNELS = 2
TOTAL_RITES = 8
# Sampling is not the whole run: the VAE decode, mastering and WAV write still
# follow it. Capping the sampling ratio short of 1 leaves that tail visible
# instead of parking the bar at 100% while the file is still being written.
SAMPLING_RATIO_CEILING = 0.9
# Floor between step emits, so a 100-step run does not flood the stdout pipe.
_STEP_EMIT_MIN_S = 0.08
DEFAULT_STEPS = 20
MIN_STEPS = 4
MAX_STEPS = 100
DEFAULT_CFG = 1.0
MIN_SECONDS = 0.5
# Stable Audio 3 Medium max length (6m 20s).
MAX_SECONDS = 380.0

# --- Quality presets -------------------------------------------------------
# "medium" is ARC-distilled and sampled with `pingpong`, which re-injects fresh
# noise on every step. Extra steps there buy hallucinated detail, not fidelity,
# and a deterministic solver averages the texture away entirely -- so on this
# checkpoint neither knob buys quality, and Balanced is the ceiling.
#
# A preset therefore changes the *checkpoint*. "medium-base" is the un-distilled
# model: real CFG works there (so the negative prompt finally does something),
# and a deterministic sampler is correct, so its extra steps genuinely converge.
PRESET_LABELS = {"speed": "Max speed", "balanced": "Balanced", "quality": "Max quality"}
PRESETS: dict[str, dict] = {
    "speed": {"model": "medium", "sampler": "pingpong", "steps": 8, "cfg": 1.0},
    "balanced": {"model": "medium", "sampler": "pingpong", "steps": 20, "cfg": 1.0},
    "quality": {"model": "medium-base", "sampler": "euler", "steps": 50, "cfg": 4.0},
}
DEFAULT_PRESET = "balanced"
CUSTOM_PRESET = "custom"
BASE_MODEL = "medium-base"
DEFAULT_MODEL = "medium"
# Samplers the rf_denoiser objective accepts (inference/sampling.py).
SAMPLERS = ("pingpong", "euler", "dpmpp", "rk4")
# Deterministic solvers. They only belong on a checkpoint that was never
# distilled: "medium" is ARC post-trained and its texture comes from pingpong
# re-noising at every step, so stepping through it deterministically averages the
# detail away and sounds muffled and lifeless. Enforced in resolve_preset.
DETERMINISTIC_SAMPLERS = ("euler", "dpmpp", "rk4")

# What Max quality actually runs, per content type, measured against Balanced by
# sweeping CFG 1/2/4/7 on medium-base (see scripts/compare_presets.py).
#
# Guidance strength has to differ by material: more of it sharpens a one-shot and
# dulls a bed. A door slam was brightest at CFG 4-7 (+3% to +17% centroid); a rain
# bed went the other way, +24% brightness and +84% high-band at CFG 2 but -9% by
# CFG 7, where it also lost most of its level movement.
#
# Instrumental is the honest exception: no CFG tested beat Balanced. medium-base
# came out consistently darker (-38% to -51% centroid) and less varied at every
# setting, so Max quality keeps music on the checkpoint that measured better
# rather than promising an upgrade it does not deliver. This is a per-mode
# decision the UI states, not a silent substitution.
QUALITY_BY_MODE = {
    "sfx": {"model": BASE_MODEL, "sampler": "euler", "steps": 50, "cfg": 4.0},
    "ambience": {"model": BASE_MODEL, "sampler": "euler", "steps": 50, "cfg": 2.0},
    "music": {"model": DEFAULT_MODEL, "sampler": "pingpong", "steps": 20, "cfg": 1.0},
}
# There is deliberately no fallback. A preset that cannot run as specified fails
# with advice instead of quietly generating something else: an earlier version
# substituted a deterministic sampler on the distilled checkpoint, which sounds
# muffled and flat, and the substitution made that impossible to notice.


def clamp_steps(steps: int) -> int:
    try:
        val = int(steps)
    except (ValueError, TypeError):
        return DEFAULT_STEPS
    return max(MIN_STEPS, min(MAX_STEPS, val))


_cancel = threading.Event()
_model = None
_model_precision = "fp16"
_model_name = DEFAULT_MODEL
_mock_unloaded = False
_model_lock = threading.Lock()
_gen_lock = threading.Lock()
_stdout_lock = threading.Lock()
_log_lock = threading.Lock()
# One in-flight GPU status probe at a time, plus the last good answer. The UI
# polls every 4s and the CUDA calls behind a probe serialize against a running
# generation, so without this a stalled driver stacks up a probe per tick.
_status_probe_lock = threading.Lock()
_status_cache: dict = {}
_status_cache_lock = threading.Lock()
_MAX_ERROR_LOG_BYTES = 2_000_000
# A finished run emits its "done" event a beat before cmd_generate's `finally`
# releases the lock, so a caller that fires the next request the moment it sees
# "done" -- the queue runner, or clicking Generate as the Load model toast
# appears -- could be told the engine was busy. A real generation holds the lock
# for far longer than this, so waiting out the handoff does not mask one.
_GEN_LOCK_HANDOFF_S = 3.0


def _env_mock() -> bool:
    flag = os.environ.get("THUNDER_FX_MOCK_ENGINE", "").strip()
    if flag in {"1", "true", "TRUE", "yes"}:
        return True
    if flag in {"0", "false", "FALSE", "no"}:
        return False
    return False


def _apply_hf_token(msg: dict | None = None) -> None:
    token = ""
    if msg is not None:
        token = str(msg.get("hf_token") or "").strip()
    if token:
        os.environ["HF_TOKEN"] = token
        os.environ["HUGGING_FACE_HUB_TOKEN"] = token


def _configure_hf_cache() -> None:
    """Keep weight blobs off a full C: drive when engine/.hf-cache exists."""
    if os.environ.get("HF_HUB_CACHE") or os.environ.get("HUGGINGFACE_HUB_CACHE"):
        return
    local = Path(__file__).resolve().parent / ".hf-cache"
    if local.exists():
        os.environ["HF_HUB_CACHE"] = str(local)


def _normalize_precision(value) -> str:
    text = str(value or "fp16").strip().lower()
    if text in {"fp16", "bf16", "half", "low"}:
        return "fp16"
    if text in {"fp32", "float32", "full", "high"}:
        return "fp32"
    return "fp16"


def _unload_model_locked() -> None:
    global _model
    if _model is None:
        return
    del _model
    _model = None
    try:
        import gc

        gc.collect()
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            if hasattr(torch.cuda, "ipc_collect"):
                torch.cuda.ipc_collect()
    except Exception:
        pass


def _try_load_model(precision: str = "fp16", model_name: str = DEFAULT_MODEL):
    global _model, _model_precision, _model_name
    if _env_mock():
        _model_precision = _normalize_precision(precision)
        _model_name = model_name
        return None
    _configure_hf_cache()
    wanted = _normalize_precision(precision)
    with _model_lock:
        if _model is not None and _model_precision == wanted and _model_name == model_name:
            return _model
        if _model is not None:
            # Both checkpoints will not fit alongside each other on a 6 GB card.
            _unload_model_locked()
        from stable_audio_3 import StableAudioModel

        # SA3 defaults to model_half=True (fp16). FP16 is optimal for speed & VRAM.
        _model = StableAudioModel.from_pretrained(
            model_name,
            device="cuda",
            model_half=wanted == "fp16",
        )
        try:
            conds = getattr(getattr(_model, "model", None), "conditioner", None)
            if conds is not None and hasattr(conds, "conditioners"):
                for c in conds.conditioners.values():
                    if hasattr(c, "model") and hasattr(c.model, "to"):
                        c.model.to("cuda")
                    if hasattr(c, "proj_out") and hasattr(c.proj_out, "to"):
                        c.proj_out.to("cuda")
                    if hasattr(c, "_device_initialized"):
                        c._device_initialized = True
        except Exception:
            pass
        _model_precision = wanted
        _model_name = model_name
        return _model


def _python_float(value, default: float) -> float:
    if value is None:
        return default
    if isinstance(value, bool) or not hasattr(value, "item"):
        return float(value)
    size = getattr(value, "size", 1)
    if callable(size):
        size = value.numel() if hasattr(value, "numel") else 1
    if int(size) != 1:
        raise TypeError(f"expected a scalar, got shape {getattr(value, 'shape', None)}")
    return float(value.item())


def clamp_seconds(seconds: float) -> float:
    if not math.isfinite(seconds):
        return 8.0
    return max(MIN_SECONDS, min(MAX_SECONDS, seconds))


def clamp_cfg(cfg: float, model_name: str = "medium") -> float:
    """Clamp CFG to what the checkpoint can actually use.

    "medium" is ARC post-trained at CFG 1; the CFG branch in the DiT only runs
    when cfg_scale != 1.0, so anything else there both over-steers and silently
    doubles the compute. "medium-base" is un-distilled and wants real guidance.
    """
    if model_name != BASE_MODEL:
        return DEFAULT_CFG
    if not math.isfinite(cfg):
        return PRESETS["quality"]["cfg"]
    return max(1.0, min(25.0, cfg))


def base_model_cached() -> bool:
    """True when the medium-base weights are already in the HF cache.

    THUNDER_FX_BASE_MODEL_READY forces the answer, so the refusal path can be
    exercised without deleting several gigabytes of weights.
    """
    override = os.environ.get("THUNDER_FX_BASE_MODEL_READY", "").strip()
    if override:
        return override.lower() in {"1", "true", "yes"}
    if _env_mock():
        return True
    try:
        from huggingface_hub import try_to_load_from_cache
        from stable_audio_3.model_configs import models
    except Exception:
        return False
    cfg = models.get(BASE_MODEL)
    if cfg is None:
        return False
    try:
        found = [
            try_to_load_from_cache(cfg.repo_id, name)
            for name in (cfg.config_path, cfg.ckpt_path)
        ]
    except Exception:
        return False
    return all(isinstance(path, str) for path in found)


class PresetUnavailable(Exception):
    """A preset needs a checkpoint that is not installed.

    Raised rather than silently substituting another configuration, because the
    substitute is audibly worse and the substitution hides why.
    """


def preset_unavailable_advice(preset: str) -> str:
    return (
        f"The {PRESET_LABELS.get(preset, preset)} preset needs the {BASE_MODEL} "
        "checkpoint, which is not downloaded. Open Settings and choose "
        f"'Download {BASE_MODEL}' (about 9 GB; it shares Medium's text encoder, "
        "so Medium must already be installed), or switch to Balanced -- on the distilled "
        "Medium checkpoint Balanced is the best quality available, so nothing is "
        "lost by using it in the meantime."
    )


def resolve_preset(
    name,
    *,
    mode: str | None = None,
    steps_override=None,
    sampler_override=None,
    base_available=None,
    strict: bool = True,
) -> dict:
    """Turn a preset name into the concrete knobs a generation needs.

    Returns model / sampler / steps / cfg plus `preset` (what was asked for) and
    `unavailable` (its checkpoint is missing). With strict=True -- the default,
    and what the generate path uses -- a missing checkpoint raises
    PresetUnavailable instead of returning a plan, so nothing else can run in
    its place. strict=False is for callers that only want to inspect the plan.
    """
    key = str(name or DEFAULT_PRESET).strip().lower()
    if key == CUSTOM_PRESET:
        chosen = dict(PRESETS[DEFAULT_PRESET])
        if sampler_override in SAMPLERS:
            chosen["sampler"] = sampler_override
        if steps_override is not None:
            chosen["steps"] = steps_override
        chosen["steps"] = clamp_steps(chosen["steps"])
        chosen["cfg"] = clamp_cfg(chosen["cfg"], chosen["model"])
        chosen["preset"] = CUSTOM_PRESET
        chosen["unavailable"] = False
        return _enforce_sampler_invariant(chosen)
    if key not in PRESETS:
        key = DEFAULT_PRESET
    chosen = dict(PRESETS[key])
    if key == "quality" and mode in QUALITY_BY_MODE:
        chosen = dict(QUALITY_BY_MODE[mode])
    unavailable = False
    if chosen["model"] == BASE_MODEL:
        if base_available is None:
            base_available = base_model_cached()
        if not base_available:
            if strict:
                raise PresetUnavailable(preset_unavailable_advice(key))
            unavailable = True
    if steps_override is not None:
        chosen["steps"] = clamp_steps(steps_override)
    chosen["steps"] = clamp_steps(chosen["steps"])
    chosen["cfg"] = clamp_cfg(chosen["cfg"], chosen["model"])
    chosen["preset"] = key
    chosen["unavailable"] = unavailable
    return _enforce_sampler_invariant(chosen)


def _enforce_sampler_invariant(plan: dict) -> dict:
    """Keep deterministic samplers off the distilled checkpoint.

    This is a hard rule rather than a default, because getting it wrong is not
    subtle: the output goes muffled, loses its dynamics, and sounds the same all
    the way through. Nothing that reaches the model may violate it. The bench
    script calls model.generate directly, so experimentation is still possible.
    """
    if plan["model"] != BASE_MODEL and plan["sampler"] in DETERMINISTIC_SAMPLERS:
        plan["sampler"] = "pingpong"
    return plan


LOOP_PROMPT_CUE = (
    "seamless looping, starts and ends the same, no fade in, no fade out, "
    "steady texture with no ending"
)
LOOP_NEGATIVE_CUE = (
    "fade in, fade out, abrupt ending, silence at the start, silence at the end"
)


def loop_overlap_seconds(seconds: float) -> float:
    if not math.isfinite(seconds) or seconds <= 0:
        return 1.0
    return max(0.5, min(3.0, seconds * 0.05))


def ensure_loop_prompt(prompt: str) -> str:
    if re.search(r"starts and ends the same", prompt, re.I):
        return prompt
    cleaned = prompt.strip().rstrip(",")
    if not cleaned:
        return LOOP_PROMPT_CUE
    return f"{cleaned}, {LOOP_PROMPT_CUE}"


def ensure_loop_negative(negative: str) -> str:
    if re.search(r"fade in", negative, re.I) and re.search(r"fade out", negative, re.I):
        return negative
    cleaned = negative.strip().rstrip(",")
    if not cleaned:
        return LOOP_NEGATIVE_CUE
    return f"{cleaned}, {LOOP_NEGATIVE_CUE}"


# --- Prompt normalization --------------------------------------------------
# Stable Audio 3 was trained on AudioSparx metadata tags. Stability's own prompt
# rewriter (stable_audio_3/interface/reprompt.py) emits exactly this shape:
#   TrackType: SFX, <description>. Length: N seconds
#   TrackType: Music, VocalType: Instrumental, <description>. BPM: N. Length: N seconds
# and rejects its own output when it lacks the Length suffix or runs past 45
# words. VocalType is a positive control tag, so unlike the negative prompt it
# works at cfg 1.0 -- which is the only place vocal suppression can happen on
# the distilled checkpoint.
MODE_TRACK_TYPES = {"sfx": "SFX", "ambience": "SFX", "music": "Music"}
PROMPT_WORD_LIMIT = 45

_TRACK_TYPE_RE = re.compile(r"^\s*TrackType:\s*[A-Za-z]+\s*,?\s*", re.I)
_VOCAL_TYPE_RE = re.compile(r"\s*VocalType:\s*[A-Za-z]+\s*,?\s*", re.I)
_LENGTH_TAG_RE = re.compile(r"[.,;]?\s*Length:\s*\d+(?:\.\d+)?\s*seconds?\.?", re.I)
_BPM_TAG_RE = re.compile(r"[.,;]?\s*BPM:\s*(\d{1,3})\s*\.?", re.I)
_INLINE_BPM_RE = re.compile(r"[,]?\s*\b(\d{2,3})\s*BPM\b", re.I)
_BARE_INSTRUMENTAL_RE = re.compile(r"(?:^|,)\s*instrumental\s*(?=,|$)", re.I)
_TIDY_COMMAS_RE = re.compile(r"\s*,(?:\s*,)+")
_TIDY_SPACE_RE = re.compile(r"[ \t]{2,}")


def _length_phrase(seconds: float) -> str:
    """Stability's rewriter always emits whole seconds, minimum 1."""
    try:
        # Half-up, not Python's banker's rounding, so this agrees with the
        # Math.round in the generateMode.ts twin at every .5 boundary.
        n = math.floor(float(seconds) + 0.5)
    except (TypeError, ValueError):
        n = 1
    n = max(1, n)
    return f"Length: {n} second" + ("" if n == 1 else "s")


def prompt_word_count(prompt: str) -> int:
    return len(str(prompt or "").split())


def normalize_prompt(prompt: str, *, mode: str, seconds: float) -> str:
    """Rewrite a prompt into the form the model was trained on.

    Idempotent: an existing Length tag is rewritten to match `seconds` rather
    than duplicated, so moving the duration slider keeps the text honest.
    """
    text = str(prompt or "").strip()
    track = MODE_TRACK_TYPES.get(mode, "SFX")
    music = track == "Music"

    # Strip the tags we are about to re-emit canonically.
    text = _TRACK_TYPE_RE.sub("", text, count=1)
    text = _VOCAL_TYPE_RE.sub(" ", text)
    text = _LENGTH_TAG_RE.sub("", text)

    bpm = None
    if music:
        # Lift a BPM out of either form so it lands in the trailing tag slot.
        tag = _BPM_TAG_RE.search(text)
        if tag:
            bpm = tag.group(1)
            text = _BPM_TAG_RE.sub("", text)
        inline = _INLINE_BPM_RE.search(text)
        if inline:
            bpm = bpm or inline.group(1)
            text = _INLINE_BPM_RE.sub("", text)
        # "instrumental" as a bare term is superseded by the VocalType tag.
        text = _BARE_INSTRUMENTAL_RE.sub("", text)
    else:
        text = _BPM_TAG_RE.sub("", text)

    text = _TIDY_COMMAS_RE.sub(",", text)
    text = _TIDY_SPACE_RE.sub(" ", text)
    body = text.strip().strip(",").strip().rstrip(".;,").strip()

    head = f"TrackType: {track}, "
    if music:
        head += "VocalType: Instrumental, "
    out = head + body if body else head.rstrip(", ")
    if music and bpm:
        out = f"{out}. BPM: {bpm}"
    return f"{out}. {_length_phrase(seconds)}"


def _flag_true(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes"}


def _wants_seamless_loop(msg: dict, loopable: bool) -> bool:
    if not loopable:
        return False
    return _flag_true(msg.get("seamless_loop") if "seamless_loop" in msg else msg.get("seamlessLoop"))


def _clamp_pcm16(value: float) -> int:
    return max(-32768, min(32767, int(round(value))))


def _make_seamless_loop_frames(
    frames: list[tuple[int, int]],
    fade_sec: float,
    sample_rate: int = SAMPLE_RATE,
) -> list[tuple[int, int]]:
    total = len(frames)
    fade_wanted = int(round(max(0.5, min(3.0, fade_sec)) * sample_rate))
    fade = max(2, min(fade_wanted, total // 3))
    if total < fade * 2 + 1:
        return frames
    out: list[tuple[int, int]] = []
    for i in range(fade):
        t = 1.0 if fade == 1 else i / (fade - 1)
        head_gain = math.sin((t * math.pi) / 2)
        tail_gain = math.cos((t * math.pi) / 2)
        head_l, head_r = frames[i]
        tail_l, tail_r = frames[total - fade + i]
        # An equal-power sum of two near-full-scale samples reaches ~1.41x, so
        # clamp before it overflows the 16-bit range on write.
        out.append(
            (
                _clamp_pcm16(tail_l * tail_gain + head_l * head_gain),
                _clamp_pcm16(tail_r * tail_gain + head_r * head_gain),
            )
        )
    out.extend(frames[fade : total - fade])
    return out


ZERO_CROSS_SEARCH_MS = 5.0


def _nearest_zero_crossing(row, frame: int, window: int, total: int) -> int:
    """Frame with the smallest amplitude within +/- `window` of `frame`.

    Joining near a zero crossing stops the crossfade from summing two waveforms
    that are out of phase, which is what makes a loop point click. Mirrors
    nearestZeroCrossing in src/lib/seamlessLoop.ts.
    """
    if total < 2:
        return 0
    best = max(0, min(frame, total - 1))
    best_abs = abs(float(row[best]))
    lo = max(0, frame - window)
    hi = min(total - 1, frame + window)
    for f in range(lo, hi + 1):
        a = abs(float(row[f]))
        if a < best_abs:
            best_abs = a
            best = f
    return best


def _make_seamless_loop_tensor(wav, fade_sec: float, sample_rate: int = SAMPLE_RATE):
    import torch

    total = int(wav.shape[-1])
    fade_wanted = int(round(max(0.5, min(3.0, fade_sec)) * sample_rate))
    fade_frames = max(2, min(fade_wanted, total // 3))
    if total < fade_frames * 2 + 1:
        return wav

    search = int(round(ZERO_CROSS_SEARCH_MS / 1000.0 * sample_rate))
    row = wav[0]
    head_join = _nearest_zero_crossing(row, 0, search, total)
    tail_join = _nearest_zero_crossing(row, total - fade_frames, search, total)
    fade = max(2, min(fade_frames, total - tail_join, total - head_join))

    t = torch.linspace(0, 1, fade, dtype=wav.dtype, device=wav.device)
    head_gain = torch.sin((t * math.pi) / 2).unsqueeze(0)
    tail_gain = torch.cos((t * math.pi) / 2).unsqueeze(0)
    mixed = (
        wav[:, tail_join: tail_join + fade] * tail_gain
        + wav[:, head_join: head_join + fade] * head_gain
    )
    # Body offsets stay fixed so the result is always exactly total - fade
    # samples, which is what the caller generated the extra overlap for.
    body = wav[:, fade: total - fade]
    return torch.cat([mixed, body], dim=-1)


def _write_wav(path: Path, frames: list[tuple[int, int]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # One bulk conversion rather than a struct.pack per frame.
    flat = array.array("h", [sample for frame in frames for sample in frame])
    if sys.byteorder != "little":
        flat.byteswap()
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(CHANNELS)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(flat.tobytes())


def _resolve_instruments(msg: dict) -> list[str]:
    """Instrument names come from the caller.

    The term table and the matching rules live in `src/lib/instruments.ts`;
    the studio extracts names there and sends them on the generate request, so
    the worker keeps no second copy to drift out of sync.
    """
    raw = msg.get("instruments")
    if not isinstance(raw, list):
        return []
    names: list[str] = []
    for item in raw:
        name = str(item).strip()
        if name and name not in names:
            names.append(name)
    return names


def _slugify_prompt(prompt: str, max_len: int = 48) -> str:
    cleaned = re.sub(r"tracktype:\s*\w+,?", "", prompt, flags=re.I).lower()
    cleaned = re.sub(r"[^a-z0-9]+", "-", cleaned).strip("-")
    cleaned = cleaned[:max_len].rstrip("-")
    return cleaned or "sound"


def _wav_info_fields(
    prompt: str,
    instruments: list[str],
    mode: str = "sfx",
    category: str = "",
    intensity: str = "",
) -> dict[str, str]:
    if mode == "music":
        genre = "Instrumental"
    elif mode == "ambience":
        genre = "Ambience"
    else:
        genre = "Sound Effects"
    fields = {"ISFT": "Thunder FX", "IGNR": genre}
    title = re.sub(r"tracktype:\s*\w+,?", "", prompt, flags=re.I).strip()
    if title:
        fields["INAM"] = title[:120]
    if category:
        fields["ISBJ"] = category[:80]
    if intensity:
        fields["IART"] = intensity[:80]

    comment_parts = []
    if category and mode == "music":
        comment_parts.append(f"Category: {category}")
    if intensity and mode == "music":
        comment_parts.append(f"Intensity: {intensity}")
    if instruments:
        fields["IKEY"] = ";".join(instruments)
        comment_parts.append("Instruments: " + ", ".join(instruments))

    if comment_parts:
        fields["ICMT"] = " · ".join(comment_parts)
    elif prompt:
        fields["ICMT"] = prompt[:200]

    return fields


def _info_subchunk(tag: bytes, text: str) -> bytes:
    payload = text.encode("utf-8") + b"\x00"
    pad = b"\x00" if len(payload) % 2 else b""
    return tag + struct.pack("<I", len(payload)) + payload + pad


def _list_info_chunk(fields: dict[str, str]) -> bytes:
    body = b"INFO"
    for key in ("INAM", "IGNR", "ISBJ", "IART", "ISFT", "IKEY", "ICMT"):
        value = fields.get(key, "").strip()
        if value:
            body += _info_subchunk(key.encode("ascii"), value)
    pad = b"\x00" if len(body) % 2 else b""
    return b"LIST" + struct.pack("<I", len(body)) + body + pad


def embed_wav_info(path: Path, fields: dict[str, str]) -> None:
    if not fields:
        return
    data = path.read_bytes()
    if data[0:4] != b"RIFF" or data[8:12] != b"WAVE":
        return
    list_chunk = _list_info_chunk(fields)
    offset = 12
    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        size = struct.unpack_from("<I", data, offset + 4)[0]
        next_off = offset + 8 + size + (size % 2)
        if chunk_id == b"fmt ":
            patched = data[:next_off] + list_chunk + data[next_off:]
            patched = patched[:4] + struct.pack("<I", len(patched) - 8) + patched[8:]
            path.write_bytes(patched)
            return
        offset = next_off


def read_wav_info(path: Path) -> dict[str, str]:
    data = path.read_bytes()
    offset = 12
    fields: dict[str, str] = {}
    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        size = struct.unpack_from("<I", data, offset + 4)[0]
        body = data[offset + 8 : offset + 8 + size]
        if chunk_id == b"LIST" and body[:4] == b"INFO":
            cursor = 4
            while cursor + 8 <= len(body):
                tag = body[cursor : cursor + 4].decode("ascii", "replace")
                sub = struct.unpack_from("<I", body, cursor + 4)[0]
                raw = body[cursor + 8 : cursor + 8 + sub]
                try:
                    fields[tag] = raw.split(b"\x00", 1)[0].decode("utf-8")
                except UnicodeDecodeError:
                    fields[tag] = raw.split(b"\x00", 1)[0].decode("latin-1", "replace")
                cursor += 8 + sub + (sub % 2)
        offset += 8 + size + (size % 2)
    return fields


def _to_stereo_cpu(audio):
    """SA3 returns [batch, channels, samples]. Export wants [channels, samples]."""
    import torch

    if not torch.is_tensor(audio):
        audio = torch.as_tensor(audio)
    wav = audio.detach().to(dtype=torch.float32, device="cpu").contiguous()
    while wav.ndim > 2:
        wav = wav[0]
    if wav.ndim == 1:
        wav = wav.unsqueeze(0).repeat(CHANNELS, 1)
    elif wav.ndim == 2 and wav.shape[0] > CHANNELS and wav.shape[1] <= CHANNELS:
        wav = wav.transpose(0, 1)
    if wav.shape[0] == 1:
        wav = wav.repeat(CHANNELS, 1)
    elif wav.shape[0] > CHANNELS:
        wav = wav[:CHANNELS]
    return wav.clamp(-1.0, 1.0)


# --- Loudness --------------------------------------------------------------
# Peak normalization alone only ever attenuates, so quiet takes stayed quiet and
# takes of the same sound landed a dozen dB apart. One-shots want a predictable
# peak (a game engine triggers them at unity); beds want a predictable loudness
# so they sit under dialogue the same way every time.
TARGET_PEAK = 0.89125  # -1.0 dBFS
LOUDNESS_TARGETS = {"ambience": -20.0, "music": -18.0}
# Below this there is no signal worth normalizing, only decode noise.
SILENCE_FLOOR_DBFS = -60.0
MAX_LOUDNESS_GAIN_DB = 24.0


_K_COEFF_CACHE: dict[int, tuple] = {}


def _k_weight_coeffs(rate: int) -> tuple:
    """BS.1770-4 K-weighting biquads for an arbitrary sample rate.

    This is libebur128's derivation. At 48 kHz it reproduces the coefficient
    table printed in the standard exactly, which the RBJ shelf parameterisation
    does not -- that reads ~0.25 dB low at 1 kHz and biases every measurement.
    """
    cached = _K_COEFF_CACHE.get(rate)
    if cached is not None:
        return cached

    # Stage 1: head/shoulder pre-filter.
    f0, gain_db, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = math.tan(math.pi * f0 / rate)
    vh = 10.0 ** (gain_db / 20.0)
    vb = vh ** 0.4996667741545416
    a0 = 1.0 + k / q + k * k
    pre_b = [
        (vh + vb * k / q + k * k) / a0,
        2.0 * (k * k - vh) / a0,
        (vh - vb * k / q + k * k) / a0,
    ]
    pre_a = [1.0, 2.0 * (k * k - 1.0) / a0, (1.0 - k / q + k * k) / a0]

    # Stage 2: RLB high-pass.
    f0, q = 38.13547087602444, 0.5003270373238773
    k = math.tan(math.pi * f0 / rate)
    denom = 1.0 + k / q + k * k
    rlb_b = [1.0, -2.0, 1.0]
    rlb_a = [1.0, 2.0 * (k * k - 1.0) / denom, (1.0 - k / q + k * k) / denom]

    _K_COEFF_CACHE[rate] = (pre_b, pre_a, rlb_b, rlb_a)
    return _K_COEFF_CACHE[rate]


def _k_weight(wav, sample_rate: int = SAMPLE_RATE):
    """Apply BS.1770-4 K-weighting to [channels, samples]."""
    import torch
    import torchaudio.functional as F

    pre_b, pre_a, rlb_b, rlb_a = _k_weight_coeffs(sample_rate)
    x = wav.to(torch.float64)

    def biquad(sig, b, a):
        return F.lfilter(
            sig,
            torch.tensor(a, dtype=sig.dtype, device=sig.device),
            torch.tensor(b, dtype=sig.dtype, device=sig.device),
            clamp=False,
        )

    return biquad(biquad(x, pre_b, pre_a), rlb_b, rlb_a)


def integrated_lufs(wav, sample_rate: int = SAMPLE_RATE):
    """Gated integrated loudness in LUFS, or None when there is nothing to gate.

    Follows BS.1770-4: K-weight, 400 ms blocks at 75% overlap, an absolute gate
    at -70 LUFS and a relative gate 10 LU below the ungated mean.
    """
    import torch

    try:
        weighted = _k_weight(wav, sample_rate)
    except Exception:
        return None
    block = int(0.4 * sample_rate)
    hop = max(1, block // 4)
    total = int(weighted.shape[-1])
    if total < block:
        return None
    # Mean square per 400 ms block, summed over channels (all weight 1.0 for
    # stereo L/R under BS.1770).
    squares = weighted.to(torch.float64) ** 2
    starts = range(0, total - block + 1, hop)
    powers = torch.tensor(
        [float(squares[:, i: i + block].mean(dim=-1).sum().item()) for i in starts],
        dtype=torch.float64,
    )
    if powers.numel() == 0:
        return None
    loud = -0.691 + 10.0 * torch.log10(powers.clamp(min=1e-12))

    keep = loud > -70.0  # absolute gate
    if not bool(keep.any()):
        return None
    ungated = -0.691 + 10.0 * torch.log10(powers[keep].mean().clamp(min=1e-12))
    keep = keep & (loud > (ungated - 10.0))  # relative gate
    if not bool(keep.any()):
        return float(ungated)
    gated = -0.691 + 10.0 * torch.log10(powers[keep].mean().clamp(min=1e-12))
    return float(gated)


def _master_audio_cpu(wav, mode: str = "sfx"):
    """Studio mastering pipeline for generated audio tensor [channels, samples]."""
    import torch

    # 1. DC offset correction on full-length audio
    if wav.shape[-1] >= 1024:
        wav = wav - wav.mean(dim=-1, keepdim=True)

    # 2. Gentle 25 Hz highpass filter (removes subsonic diffusion decode rumble)
    if wav.shape[-1] >= 1024:
        try:
            import torchaudio.functional as F

            wav = F.highpass_biquad(wav, sample_rate=SAMPLE_RATE, cutoff_freq=25.0, Q=0.7071)
        except Exception:
            pass

    peak = float(wav.abs().max().item())
    if peak <= 0.0:
        return wav.clamp(-1.0, 1.0)
    peak_dbfs = 20.0 * math.log10(peak)

    target_lufs = LOUDNESS_TARGETS.get(mode)
    gain = 1.0
    if target_lufs is not None and peak_dbfs > SILENCE_FLOOR_DBFS:
        # 3a. Beds: hit a loudness target, then let the peak ceiling win.
        measured = integrated_lufs(wav)
        if measured is not None and math.isfinite(measured):
            delta = max(-MAX_LOUDNESS_GAIN_DB, min(MAX_LOUDNESS_GAIN_DB, target_lufs - measured))
            gain = 10.0 ** (delta / 20.0)
    elif peak_dbfs > SILENCE_FLOOR_DBFS:
        # 3b. One-shots: normalize the peak in both directions so every take of
        # the same sound triggers at the same level.
        gain = TARGET_PEAK / peak
    if gain != 1.0:
        wav = wav * gain

    # 4. True-peak ceiling always wins over the loudness target.
    peak = float(wav.abs().max().item())
    if peak > TARGET_PEAK:
        wav = wav * (TARGET_PEAK / peak)

    return wav.clamp(-1.0, 1.0)


def _quantize_pcm16(wav, dither: bool = True):
    """Float [-1, 1] to int16 with TPDF dither.

    Rounding bare correlates the quantization error with the signal, which is
    audible as grit on quiet tails; TPDF noise decorrelates it.
    """
    import torch

    scaled = wav * 32767.0
    if dither:
        # Triangular PDF, +/-1 LSB peak, from the difference of two uniforms.
        noise = torch.rand_like(scaled) - torch.rand_like(scaled)
        # Leave true digital silence alone. The decoder zeroes everything past
        # the valid region, and game one-shots are expected to start and end on
        # exact zeros -- dithering those would put a noise floor under the whole
        # file for no benefit.
        noise = torch.where(scaled == 0, torch.zeros_like(noise), noise)
        scaled = scaled + noise
    return scaled.round().clamp(-32768, 32767).to(torch.int16)


def _save_generated_wav(
    path: Path,
    audio,
    master: bool = True,
    loop: bool = False,
    fade_sec: float = 1.0,
    mode: str = "sfx",
) -> None:
    """Write 16-bit PCM stereo @ 44.1 kHz (the studio parser rejects float WAV)."""
    wav = _to_stereo_cpu(audio)
    # The crossfade sums two correlated windows and can lift the peak, so it has
    # to happen before normalization rather than after it.
    if loop:
        wav = _make_seamless_loop_tensor(wav, fade_sec)
    if master:
        wav = _master_audio_cpu(wav, mode)
    pcm = _quantize_pcm16(wav)
    interleaved = pcm.transpose(0, 1).contiguous().numpy().tobytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(CHANNELS)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(interleaved)


def _wants_music(msg: dict) -> bool:
    mode = str(msg.get("mode") or "").strip().lower()
    if mode in {"music", "instrumental"}:
        return True
    prompt = str(msg.get("prompt") or "")
    return bool(re.search(r"tracktype:\s*music\b", prompt, re.I))


def _mode_str(msg: dict) -> str:
    mode = str(msg.get("mode") or "").strip().lower()
    if mode in {"music", "instrumental"}:
        return "music"
    if mode in {"ambience", "ambient", "environment"}:
        return "ambience"
    if _wants_music(msg):
        return "music"
    return "sfx"


def _mock_pcm(seconds: float, seed: int, *, music: bool = False) -> list[tuple[int, int]]:
    rng = random.Random(seed if seed > 0 else 1)
    n = max(1, int(seconds * SAMPLE_RATE))
    frames: list[tuple[int, int]] = []
    if music:
        roots = (261.63, 329.63, 392.0, 349.23)
        for i in range(n):
            t = i / SAMPLE_RATE
            root = roots[int(t / 0.5) % len(roots)]
            fifth = root * 1.5
            octv = root * 2
            pulse = 0.72 + 0.18 * math.sin(2 * math.pi * 2 * t)
            melody = math.sin(2 * math.pi * octv * t) * 0.22
            drone = math.sin(2 * math.pi * root * t) * 0.28 + math.sin(2 * math.pi * fifth * t) * 0.16
            air = (rng.random() * 2 - 1) * 0.02
            sample = max(-1.0, min(1.0, (drone + melody + air) * pulse))
            v = int(sample * 0.7 * 32767)
            frames.append((v, int(v * 0.94)))
        return frames
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 3.2) * (1.0 if t >= 0.012 else t / 0.012)
        hit = math.sin(2 * math.pi * (90 + t * 40) * t) * 0.55
        grit = (rng.random() * 2 - 1) * 0.35
        body = math.sin(2 * math.pi * 55 * t) * 0.4
        sample = max(-1.0, min(1.0, (hit + grit + body) * env))
        v = int(sample * 0.85 * 32767)
        frames.append((v, int(v * 0.92)))
    return frames


def _emit(payload: dict) -> None:
    with _stdout_lock:
        line = json.dumps(payload) + "\n"
        try:
            sys.stdout.write(line)
            sys.stdout.flush()
        except OSError as exc:
            try:
                if hasattr(sys.stdout, "buffer"):
                    sys.stdout.buffer.write(line.encode("utf-8"))
                    sys.stdout.buffer.flush()
            except Exception:
                _log_error(f"Pipe write failed: {exc}", exc)
        except Exception as exc:
            _log_error(f"Emit failed: {exc}", exc)


def _emit_progress(
    msg_id,
    started: float,
    *,
    step: int,
    phase: str,
    total: int = TOTAL_RITES,
    ratio: float | None = None,
    message: str = "",
) -> None:
    payload: dict = {
        "id": msg_id,
        "event": "progress",
        "step": int(step),
        "total": int(total),
        "elapsedMs": int((time.time() - started) * 1000),
        "phase": phase,
    }
    if ratio is not None:
        payload["ratio"] = float(ratio)
    if message:
        payload["message"] = message
    _emit(payload)


class _Heartbeat:
    """Keep the loading bar alive while CUDA or Hugging Face blocks."""

    def __init__(
        self,
        msg_id,
        started: float,
        phase: str = "loading",
        total: int = TOTAL_RITES,
    ) -> None:
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._phase = phase
        self._step = 0
        self._total = total
        self._ratio: float | None = None
        self._last_emit = 0.0
        self._msg_id = msg_id
        self._started = started
        self._thread = threading.Thread(
            target=self._run, name="thunder-fx-heartbeat", daemon=True
        )

    def start(self) -> _Heartbeat:
        self._thread.start()
        return self

    def update(
        self,
        *,
        phase: str | None = None,
        step: int | None = None,
        total: int | None = None,
        ratio: float | None = None,
    ) -> None:
        with self._lock:
            if phase is not None:
                self._phase = phase
            if step is not None:
                self._step = step
            if total is not None:
                self._total = total
            if ratio is not None:
                self._ratio = ratio

    def mark(self, *, step: int, total: int, ratio: float | None = None) -> None:
        """Publish a step the moment it lands, not on the next 250ms tick.

        The UI derives its live pace from the gap between step events, so a
        quarter-second of jitter on an eight-step run is the difference between
        a steady countdown and one that lurches. Throttled so a 100-step run
        does not flood the pipe.
        """
        self.update(step=step, total=total, ratio=ratio)
        now = time.time()
        with self._lock:
            if step < self._total and now - self._last_emit < _STEP_EMIT_MIN_S:
                return
            self._last_emit = now
            phase = self._phase
        _emit_progress(
            self._msg_id,
            self._started,
            step=step,
            total=total,
            phase=phase,
            ratio=ratio,
        )

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=1.0)

    def _snapshot(self) -> tuple[str, int, int, float | None]:
        with self._lock:
            return self._phase, self._step, self._total, self._ratio

    def _run(self) -> None:
        while not self._stop.wait(0.25):
            phase, step, total, ratio = self._snapshot()
            with self._lock:
                self._last_emit = time.time()
            _emit_progress(
                self._msg_id,
                self._started,
                step=step,
                total=total,
                phase=phase,
                ratio=ratio,
            )



@contextmanager
def _hub_progress(heartbeat: _Heartbeat):
    """Forward Hugging Face / tqdm download ratios when weights are still missing."""

    restore = []

    def on_ratio(ratio: float) -> None:
        if ratio > 0:
            heartbeat.update(phase="loading", ratio=min(1.0, ratio))

    def emit_subclass(base: type) -> type:
        """Wrap one module's own tqdm, rather than swapping in a vanilla one.

        huggingface_hub calls its bars as `cls(disable=..., name=..., **kw)` but
        only after checking `issubclass(cls, tqdm)` against its *own* subclass --
        the guard that stops `name` reaching a vanilla tqdm, which rejects it with
        TqdmKeyError. Patching the module global with a `tqdm.auto` subclass made
        that check compare the replacement against itself, so it passed, `name`
        went through, and every hub download died before a byte moved. Deriving
        from whatever the module already exposes keeps the guard honest.
        """

        class EmitTqdm(base):  # type: ignore[misc,valid-type]
            def __init__(self, *args, **kwargs):
                self._tfx_seen = 0
                super().__init__(*args, **kwargs)

            def update(self, n=1):
                result = super().update(n)
                # tqdm disables itself when its output is not a TTY, and the
                # worker's pipes never are -- a disabled bar returns from
                # update() without advancing self.n, which left this hook
                # reporting 0 for the whole download. Counting the increments
                # we are handed works whether or not the bar draws itself.
                self._tfx_seen = getattr(self, "_tfx_seen", 0) + (n or 0)
                total = getattr(self, "total", None) or 0
                current = max(getattr(self, "n", 0) or 0, self._tfx_seen)
                if total:
                    on_ratio(current / total)
                return result

        return EmitTqdm

    for mod_name in ("huggingface_hub.utils.tqdm", "tqdm.auto", "tqdm"):
        try:
            mod = __import__(mod_name, fromlist=["tqdm"])
        except Exception:
            continue
        original = getattr(mod, "tqdm", None)
        # A non-class export (a partial, a shim) cannot be subclassed; leave it be
        # rather than trading a progress bar for a broken download.
        if not isinstance(original, type):
            continue
        try:
            patched = emit_subclass(original)
        except Exception:
            continue
        mod.tqdm = patched
        restore.append((mod, original))

    try:
        yield
    finally:
        for mod, original in restore:
            with contextlib.suppress(Exception):
                mod.tqdm = original


def _logs_dir() -> Path:
    override = os.environ.get("THUNDER_FX_LOG_DIR", "").strip()
    if override:
        return Path(override)
    local = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_DATA_HOME")
    if local:
        return Path(local) / "thunder-fx" / "logs"
    return Path.home() / ".thunder-fx" / "logs"


def error_log_path() -> Path:
    return _logs_dir() / "error.log"


def _rotate_error_log(path: Path) -> None:
    try:
        if not path.is_file() or path.stat().st_size < _MAX_ERROR_LOG_BYTES:
            return
        backup = path.with_name("error.log.1")
        if backup.exists():
            backup.unlink()
        path.replace(backup)
    except OSError:
        return


def _log_error(
    message: str,
    exc: BaseException | None = None,
    *,
    context: dict | None = None,
) -> None:
    try:
        path = error_log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        _rotate_error_log(path)
        stamp = time.strftime("%Y-%m-%dT%H:%M:%S")
        block = [f"[{stamp}] ERROR {message}"]
        if context:
            block.append("context: " + json.dumps(context, default=str, ensure_ascii=True))
        if exc is not None:
            block.append("".join(traceback.format_exception(exc)).rstrip())
        text = "\n".join(block) + "\n\n"
        with _log_lock, path.open("a", encoding="utf-8") as fh:
            fh.write(text)
    except Exception:
        return


def _emit_error(
    msg_id,
    message: str,
    exc: BaseException | None = None,
    *,
    log: bool = True,
    context: dict | None = None,
) -> None:
    if log:
        _log_error(message, exc, context=context)
    _emit({"id": msg_id, "event": "error", "message": message})


def _mock_step_s() -> float:
    raw = os.environ.get("THUNDER_FX_MOCK_STEP_MS", "50").strip()
    try:
        return max(0.0, float(raw) / 1000.0)
    except ValueError:
        return 0.05


def _library_dir(override: str | None = None) -> Path:
    chosen = (override or "").strip() or os.environ.get("THUNDER_FX_LIBRARY_DIR", "").strip()
    if chosen:
        path = Path(chosen)
    else:
        local = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_DATA_HOME")
        if local:
            path = Path(local) / "thunder-fx" / "library"
        else:
            path = Path.home() / ".thunder-fx" / "library"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _vram_stats() -> dict:
    mock = _env_mock()
    if mock:
        return {
            "vramUsedGb": 0.0 if _mock_unloaded else 0.4,
            "vramTotalGb": 8.0,
            "vramAllocatedGb": 0.0 if _mock_unloaded else 0.3,
            "vramReservedGb": 0.0 if _mock_unloaded else 0.4,
            "gpuName": "mock",
            "precision": _model_precision,
        }
    out: dict = {"precision": _model_precision}
    try:
        import torch

        if not torch.cuda.is_available():
            return out
        idx = 0
        total = float(torch.cuda.get_device_properties(idx).total_memory)
        used = float(torch.cuda.memory_reserved(idx))
        try:
            free, total_info = torch.cuda.mem_get_info(idx)
            total = float(total_info)
            used = float(total_info - free)
        except Exception:
            pass
        gib = 1024 ** 3
        out["vramUsedGb"] = round(used / gib, 2)
        out["vramTotalGb"] = round(total / gib, 2)
        out["vramAllocatedGb"] = round(float(torch.cuda.memory_allocated(idx)) / gib, 2)
        out["vramReservedGb"] = round(float(torch.cuda.memory_reserved(idx)) / gib, 2)
        out["gpuName"] = torch.cuda.get_device_name(idx)
        try:
            temp_fn = getattr(torch.cuda, "temperature", None)
            if callable(temp_fn):
                out["gpuTempC"] = int(temp_fn(idx))
        except Exception:
            pass
        if "gpuTempC" not in out:
            try:
                import pynvml

                pynvml.nvmlInit()
                handle = pynvml.nvmlDeviceGetHandleByIndex(idx)
                out["gpuTempC"] = int(
                    pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
                )
            except Exception:
                pass
    except Exception:
        pass
    return out


def _status_snapshot() -> dict:
    """The status payload minus its id. Talks to CUDA, so it can block."""
    mock = _env_mock()
    device = "mock"
    ready = True
    message = "Mock engine."
    if not mock:
        try:
            import torch

            ready = bool(torch.cuda.is_available())
            device = "cuda" if ready else "cpu"
            message = "CUDA ready." if ready else "CUDA not available."
        except Exception as exc:  # noqa: BLE001
            ready = False
            device = "unknown"
            message = str(exc)
    payload = {
        "event": "status",
        "ready": ready,
        "mock": mock,
        "loaded": (not _mock_unloaded) if mock else _model is not None,
        "device": device,
        "message": message,
        "model": _model_name,
        "baseModelReady": base_model_cached(),
    }
    payload.update(_vram_stats())
    return payload


def cmd_status(msg_id: str) -> None:
    if not _status_probe_lock.acquire(blocking=False):
        # A probe is already parked inside the CUDA driver. Answering from the
        # last snapshot keeps the poll cheap; the alternative is a second call
        # into a driver that is demonstrably not answering.
        with _status_cache_lock:
            cached = dict(_status_cache)
        if not cached:
            cached = {
                "event": "status",
                "ready": False,
                "mock": _env_mock(),
                "loaded": False,
                "device": "unknown",
                "message": "Waiting on the GPU.",
            }
        cached["id"] = msg_id
        cached["stale"] = True
        _emit(cached)
        return
    try:
        payload = _status_snapshot()
    finally:
        _status_probe_lock.release()
    with _status_cache_lock:
        _status_cache.clear()
        _status_cache.update(payload)
    payload = dict(payload)
    payload["id"] = msg_id
    _emit(payload)


def cmd_probe(msg_id: str, msg: dict | None = None) -> None:
    _apply_hf_token(msg)
    mock = _env_mock()
    if mock:
        _emit(
            {
                "id": msg_id,
                "event": "probe",
                "ok": True,
                "flavor": "Mock engine is ready. Install CUDA Medium for full quality.",
                "technical": "THUNDER_FX_MOCK_ENGINE=1 — no PyTorch / Flash Attention loaded.",
                "device": "mock",
            }
        )
        return
    technical = []
    ok = True
    try:
        import torch

        if not torch.cuda.is_available():
            ok = False
            technical.append("CUDA not found. Install an NVIDIA driver and CUDA-enabled PyTorch.")
        else:
            technical.append(f"CUDA device: {torch.cuda.get_device_name(0)}")
    except Exception as exc:  # noqa: BLE001
        ok = False
        technical.append(f"torch import failed: {exc}")
    try:
        import flash_attn  # noqa: F401

        technical.append("flash_attn import ok")
    except Exception as exc:  # noqa: BLE001
        ok = False
        technical.append(
            "Flash Attention 2 import failed. Pin a wheel matching Python/Torch/CUDA. "
            f"Detail: {exc}"
        )
    try:
        import stable_audio_3  # noqa: F401

        technical.append("stable_audio_3 import ok")
    except Exception as exc:  # noqa: BLE001
        ok = False
        technical.append(f"stable_audio_3 import failed: {exc}")
    flavor = (
        "The hardware looks good."
        if ok
        else "Hardware check failed. CUDA and Flash Attention are required for Medium."
    )
    _emit(
        {
            "id": msg_id,
            "event": "probe",
            "ok": ok,
            "flavor": flavor,
            "technical": "\n".join(technical),
            "device": "cuda" if ok else "unknown",
        }
    )


class GenerationCancelled(Exception):
    """Raised from the per-step hook so diffusion unwinds promptly."""


def _cancel_hook(*_args, **_kwargs):
    if _cancel.is_set():
        raise GenerationCancelled("Generation cancelled")
    # Diffusers-style callbacks expect a (possibly empty) kwargs dict back.
    return {}


def _callback_step(args: tuple, kwargs: dict, seen: dict) -> int:
    """Pull the step index out of whatever shape the sampler hands the callback.

    k-diffusion passes one positional dict carrying a zero-based `i`; other
    samplers pass it as a keyword or not at all. A local counter covers the
    last case, so the step number is never worse than "how many times were we
    called".
    """
    for candidate in (*args, kwargs.get("info"), kwargs):
        if isinstance(candidate, dict) and isinstance(candidate.get("i"), (int, float)):
            index = int(candidate["i"])
            if index >= 0:
                seen["step"] = index + 1
                return seen["step"]
    seen["step"] += 1
    return seen["step"]


def _cancel_hook_kwargs(heartbeat: _Heartbeat | None = None, total_steps: int = 0) -> dict:
    """Wire cancellation and per-step progress into the sampler.

    StableAudioModel.generate does not name a callback parameter -- it forwards
    unknown kwargs into sample_diffusion, which passes `callback` down to every
    sampler and invokes it once per step. Probing generate's signature therefore
    always came up empty, leaving cancel unable to act until the run finished.

    The same callback is the only per-step signal the process has, so it also
    reports progress. Without it the heartbeat repeated `step=0` for the whole
    sampling phase and the UI had nothing but wall clock to estimate from.
    """
    if heartbeat is None or total_steps <= 0:
        return {"callback": _cancel_hook}

    seen = {"step": 0}

    def hook(*args, **kwargs):
        if _cancel.is_set():
            raise GenerationCancelled("Generation cancelled")
        step = min(total_steps, _callback_step(args, kwargs, seen))
        heartbeat.mark(
            step=step,
            total=total_steps,
            ratio=min(SAMPLING_RATIO_CEILING, SAMPLING_RATIO_CEILING * step / total_steps),
        )
        return {}

    return {"callback": hook}


def cmd_generate(msg: dict) -> None:
    if not _gen_lock.acquire(timeout=_GEN_LOCK_HANDOFF_S):
        _emit_error(msg.get("id"), "A generation or model load is already in progress")
        return

    def run() -> None:
        try:
            _generate_body(msg)
        except Exception as exc:  # noqa: BLE001
            _emit_error(msg.get("id"), str(exc), exc, context={"cmd": "generate"})
        finally:
            _gen_lock.release()

    threading.Thread(target=run, name="thunder-fx-generate", daemon=True).start()


def _sanitize_folder_name(name: str | None, fallback: str = "General") -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", str(name or "")).strip()
    cleaned = cleaned.strip(". ")
    return cleaned if cleaned else fallback


def _generate_body(msg: dict) -> None:
    _apply_hf_token(msg)
    msg_id = msg["id"]
    prompt = str(msg.get("prompt", "")).strip()
    seconds = clamp_seconds(_python_float(msg.get("seconds", 8), 8.0))
    seed = int(_python_float(msg.get("seed", -1), -1.0))
    raw_steps = msg.get("steps")
    try:
        plan = resolve_preset(
            msg.get("preset"),
            mode=_mode_str(msg),
            steps_override=None
            if raw_steps is None
            else int(_python_float(raw_steps, DEFAULT_STEPS)),
            sampler_override=str(msg.get("sampler") or "").strip().lower() or None,
        )
    except PresetUnavailable as exc:
        # Raised before any GPU work, so this comes back immediately rather than
        # after a wasted generation.
        _emit_error(msg["id"], str(exc), log=False)
        return
    steps = plan["steps"]
    cfg = plan["cfg"]
    sampler = plan["sampler"]
    model_name = plan["model"]
    negative = str(msg.get("negative") or "") or None
    _cancel.clear()
    if seed <= 0:
        seed = random.randint(1, 2_147_483_646)
    music = _wants_music(msg)
    mode_str = _mode_str(msg)
    loop = _wants_seamless_loop(msg, music or mode_str == "ambience")
    fade = loop_overlap_seconds(seconds) if loop else 0.0
    gen_seconds = clamp_seconds(seconds + fade) if loop else seconds
    model_prompt = ensure_loop_prompt(prompt) if loop else prompt
    model_prompt = normalize_prompt(model_prompt, mode=mode_str, seconds=gen_seconds)
    model_negative = ensure_loop_negative(negative or "") if loop else negative
    # Negative prompts only reach the model through CFG, and the DiT skips its
    # CFG branch entirely at cfg_scale 1.0. Say so rather than pretending.
    negative_active = cfg != 1.0
    warnings: list[str] = []
    if prompt_word_count(model_prompt) > PROMPT_WORD_LIMIT:
        warnings.append(
            f"Prompt is over {PROMPT_WORD_LIMIT} words; Stable Audio 3 was tuned on "
            "shorter prompts and tends to drop detail past this point."
        )
    if model_negative and not negative_active:
        warnings.append(
            "Negative prompt ignored: this checkpoint runs at CFG 1, where the "
            "model has no guidance branch. Use the Max quality preset for it."
        )
    cat_str = _sanitize_folder_name(msg.get("category"), fallback="Custom")
    subcat_default = "I" if music else "General"
    subcat_str = _sanitize_folder_name(
        msg.get("subcategory") or msg.get("intensity"),
        fallback=subcat_default,
    )
    lib_dir = _library_dir(str(msg.get("library_dir") or msg.get("libraryDir") or ""))
    out_dir = lib_dir / mode_str / cat_str / subcat_str
    out_dir.mkdir(parents=True, exist_ok=True)
    base_slug = _slugify_prompt(prompt)
    dur_str = f"{round(seconds, 1):g}s"
    unique_suffix = uuid.uuid4().hex[:8]
    filename = f"{base_slug}-{dur_str}-{unique_suffix}.wav"
    out = out_dir / filename
    started = time.time()
    mock = _env_mock()
    if mock:
        if _mock_unloaded:
            _emit_error(msg_id, "The model is not loaded. Click Load model first.")
            return
        for step in range(1, steps + 1):
            if _cancel.is_set():
                _emit_error(msg_id, "Generation cancelled", log=False)
                return
            _emit_progress(
                msg_id,
                started,
                step=step,
                total=steps,
                phase="weaving",
                ratio=step / steps,
            )
            time.sleep(_mock_step_s())
        frames = _mock_pcm(gen_seconds, seed, music=music)
        if loop:
            frames = _make_seamless_loop_frames(frames, fade)
        _write_wav(out, frames)
        actual_duration = len(frames) / SAMPLE_RATE
        instruments = _resolve_instruments(msg)
        intensity_val = str(msg.get("intensity") or (subcat_str if mode_str == "music" else "")).strip()
        embed_wav_info(
            out,
            _wav_info_fields(
                prompt,
                instruments,
                mode_str,
                category=cat_str,
                intensity=intensity_val,
            ),
        )
        _emit(
            {
                "id": msg_id,
                "event": "done",
                "path": str(out),
                "seed": seed,
                "duration": actual_duration,
                "steps": steps,
                "prompt": prompt,
                "mode": mode_str,
                "category": cat_str,
                "subcategory": subcat_str,
                "instruments": instruments,
                "seamlessLoop": loop,
                "preset": plan["preset"],
                "sampler": sampler,
                "model": model_name,
                "presetUnavailable": plan["unavailable"],
                "warnings": warnings,
            }
        )
        return

    if _model is None:
        _emit_error(msg_id, "The model is not loaded. Click Load model first.")
        return
    if _model_name != model_name:
        # Presets can straddle the medium / medium-base boundary and both will
        # not fit in VRAM together, so this is a real unload + load.
        _emit_progress(
            msg_id,
            started,
            step=0,
            total=steps,
            phase="loading",
            message=f"Loading {model_name} for the {plan['preset']} preset",
        )
        try:
            _try_load_model(_model_precision, model_name)
        except Exception as exc:  # noqa: BLE001
            _emit_error(msg_id, f"failed to load {model_name}: {exc}", exc)
            return
    model = _model
    heartbeat = _Heartbeat(msg_id, started, "weaving", total=steps).start()
    try:
        _emit_progress(msg_id, started, step=0, total=steps, phase="weaving")
        chunked = _model_precision == "fp16"
        gen_context = {
            "cmd": "generate",
            "prompt": model_prompt,
            "seconds": gen_seconds,
            "seed": seed,
            "cfg": cfg,
            "steps": steps,
            "sampler": sampler,
            "model": model_name,
            "preset": plan["preset"],
            "precision": _model_precision,
            "seamlessLoop": loop,
        }
        # Without an explicit sample_size, generate() falls back to its own
        # default of 5292032 samples (120s) and _adapt_sample_size clamps every
        # longer request down to it -- so a 380s bed silently came back at 120s.
        sample_size = int(model.model_config["sample_size"])

        def run_generate(use_chunked: bool):
            # Built per attempt: an OOM retry restarts sampling at step 0, so a
            # counter carried over from the failed attempt would report a run
            # that is further along than it is.
            hook = _cancel_hook_kwargs(heartbeat, steps)
            return model.generate(
                prompt=model_prompt,
                duration=gen_seconds,
                steps=steps,
                seed=seed,
                cfg_scale=cfg,
                negative_prompt=model_negative if negative_active else None,
                sample_size=sample_size,
                sampler_type=sampler,
                chunked_decode=use_chunked,
                **hook,
            )

        try:
            audio = run_generate(chunked)
        except GenerationCancelled:
            _emit_error(msg_id, "Generation cancelled", log=False)
            return
        except Exception as exc:  # noqa: BLE001
            if "out of memory" in str(exc).lower() or "oom" in str(exc).lower():
                _log_error("CUDA OOM; retrying with chunked decode", exc, context=gen_context)
                chunked = True
                try:
                    audio = run_generate(True)
                except GenerationCancelled:
                    _emit_error(msg_id, "Generation cancelled", log=False)
                    return
            else:
                _emit_error(msg_id, str(exc), exc, context=gen_context)
                return
        if _cancel.is_set():
            _emit_error(msg_id, "Generation cancelled", log=False)
            return
        heartbeat.update(phase="writing", step=steps, total=steps, ratio=0.95)
        _emit_progress(
            msg_id,
            started,
            step=steps,
            total=steps,
            phase="writing",
            ratio=0.95,
        )
        try:
            _save_generated_wav(
                out, audio, master=True, loop=loop, fade_sec=fade, mode=mode_str
            )
        except Exception as exc:  # noqa: BLE001
            _emit_error(
                msg_id,
                f"failed to write WAV: {exc}",
                exc,
                context=gen_context,
            )
            return
        instruments = _resolve_instruments(msg)
        intensity_val = str(msg.get("intensity") or (subcat_str if mode_str == "music" else "")).strip()
        embed_wav_info(
            out,
            _wav_info_fields(
                prompt,
                instruments,
                mode_str,
                category=cat_str,
                intensity=intensity_val,
            ),
        )
        _emit(
            {
                "id": msg_id,
                "event": "done",
                "path": str(out),
                "seed": seed,
                "duration": seconds,
                "steps": steps,
                "prompt": prompt,
                "mode": mode_str,
                "category": cat_str,
                "subcategory": subcat_str,
                "chunkedDecode": chunked,
                "instruments": instruments,
                "seamlessLoop": loop,
                "preset": plan["preset"],
                "sampler": sampler,
                "model": model_name,
                "presetUnavailable": plan["unavailable"],
                "warnings": warnings,
            }
        )
    finally:
        heartbeat.stop()


def cmd_encode_ogg(msg: dict) -> None:
    msg = dict(msg)
    msg["format"] = "ogg"
    if not msg.get("dest_path"):
        msg["dest_path"] = msg.get("ogg_path")
    cmd_encode_audio(msg)


def _resample_audio(data, sr: int, target_sr: int):
    """Resample [frames] or [frames, channels] float audio.

    torchaudio's windowed-sinc resampler is used rather than the old linear
    interpolation, which had no anti-alias filter and imaged badly on the
    44.1 -> 48 kHz conversion every DAW/game-engine export asks for. soxr stays
    as a first choice for callers that happen to have it; plain interpolation is
    now only a last resort when neither is importable.
    """
    if target_sr <= 0 or sr == target_sr:
        return data, sr
    try:
        import soxr

        return soxr.resample(data, sr, target_sr), target_sr
    except Exception:
        pass
    try:
        import numpy as np
        import torch
        import torchaudio.functional as F

        arr = np.asarray(data)
        planar = arr.T if arr.ndim == 2 else arr[None, :]
        tensor = torch.as_tensor(np.ascontiguousarray(planar), dtype=torch.float32)
        out = F.resample(tensor, sr, target_sr).numpy()
        out = out.T if arr.ndim == 2 else out[0]
        return out.astype(arr.dtype, copy=False), target_sr
    except Exception:
        pass
    try:
        import numpy as np
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Resample needs numpy, torchaudio or soxr: {exc}") from exc
    n = int(data.shape[0])
    new_n = max(1, int(round(n * target_sr / sr)))
    x_old = np.linspace(0.0, 1.0, n, endpoint=False)
    x_new = np.linspace(0.0, 1.0, new_n, endpoint=False)
    if data.ndim == 1:
        return np.interp(x_new, x_old, data).astype(data.dtype, copy=False), target_sr
    chans = [
        np.interp(x_new, x_old, data[:, c] if data.shape[1] <= 8 else data[c])
        for c in range(data.shape[1] if data.shape[1] <= 8 else data.shape[0])
    ]
    if data.shape[1] <= 8:
        return np.stack(chans, axis=1).astype(data.dtype, copy=False), target_sr
    return np.stack(chans, axis=0).astype(data.dtype, copy=False), target_sr


def _downmix_mono(data):
    if getattr(data, "ndim", 1) == 1:
        return data
    try:
        # Fails fast when numpy is missing; the mean below is a numpy method.
        import numpy  # noqa: F401

        if data.shape[1] <= 8:
            return data.mean(axis=1)
        return data.mean(axis=0)
    except Exception:
        return data


# Opus is defined only for these rates; libsndfile refuses anything else
# instead of resampling for us.
OPUS_RATES = (8000, 12000, 16000, 24000, 48000)


def _write_mp3(data, sr: int, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        import torch
        import torchaudio

        tensor = torch.as_tensor(data)
        if tensor.ndim == 1:
            tensor = tensor.unsqueeze(0)
        else:
            tensor = tensor.T.contiguous() if tensor.shape[1] <= 8 else tensor.contiguous()
        torchaudio.save(str(dest), tensor.float(), sr, format="mp3")
        return
    except Exception:
        pass
    import shutil
    import subprocess
    import tempfile

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        # libsndfile 1.1+ writes MP3 itself. No bitrate control, so this is the
        # fallback rather than the first choice for a 320 kbps export.
        import soundfile as sf

        if "MP3" in sf.available_formats():
            sf.write(str(dest), data, sr, format="MP3", subtype="MPEG_LAYER_III")
            return
        raise RuntimeError("MP3 export needs ffmpeg on PATH (320 kbps CBR).")
    tmp_path = ""
    try:
        import soundfile as sf

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        sf.write(tmp_path, data, sr, format="WAV", subtype="PCM_16")
        subprocess.run(
            [ffmpeg, "-y", "-i", tmp_path, "-codec:a", "libmp3lame", "-b:a", "320k", str(dest)],
            check=True,
            capture_output=True,
            text=True,
        )
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)


def cmd_encode_audio(msg: dict) -> None:
    msg_id = msg["id"]
    wav_path = Path(msg["wav_path"])
    dest_path = Path(str(msg.get("dest_path") or msg.get("ogg_path") or ""))
    fmt = str(msg.get("format") or "ogg").strip().lower()
    if fmt in {"vorbis"}:
        fmt = "ogg"
    elif fmt in {"aif", "aifc"}:
        fmt = "aiff"
    try:
        sample_rate = int(msg.get("sample_rate") or msg.get("sampleRate") or 0)
    except (TypeError, ValueError):
        sample_rate = 0
    try:
        bit_depth = int(msg.get("bit_depth") or msg.get("bitDepth") or 16)
    except (TypeError, ValueError):
        bit_depth = 16
    mono = str(msg.get("mono") or "").strip().lower() in {"1", "true", "yes"}
    if not dest_path:
        _emit_error(msg_id, "encode_audio missing dest_path")
        return
    try:
        import soundfile as sf

        data, sr = sf.read(str(wav_path), always_2d=False)
        if mono:
            data = _downmix_mono(data)
        if sample_rate > 0 and sample_rate != sr:
            data, sr = _resample_audio(data, int(sr), sample_rate)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        if fmt == "ogg":
            sf.write(str(dest_path), data, sr, format="OGG", subtype="VORBIS")
        elif fmt == "opus":
            if int(sr) not in OPUS_RATES:
                data, sr = _resample_audio(data, int(sr), 48000)
            sf.write(str(dest_path), data, sr, format="OGG", subtype="OPUS")
        elif fmt == "flac":
            subtype = "PCM_24" if bit_depth >= 24 else "PCM_16"
            sf.write(str(dest_path), data, sr, format="FLAC", subtype=subtype)
        elif fmt == "wav":
            subtype = "PCM_24" if bit_depth >= 24 else "PCM_16"
            sf.write(str(dest_path), data, sr, format="WAV", subtype=subtype)
        elif fmt == "aiff":
            subtype = "PCM_24" if bit_depth >= 24 else "PCM_16"
            sf.write(str(dest_path), data, sr, format="AIFF", subtype=subtype)
        elif fmt == "mp3":
            _write_mp3(data, int(sr), dest_path)
        else:
            raise RuntimeError(f"Unsupported export format: {fmt}")
        _emit({"id": msg_id, "event": "done", "path": str(dest_path), "format": fmt})
    except Exception as exc:  # noqa: BLE001
        _emit_error(msg_id, str(exc), exc, context={"cmd": "encode_audio", "format": fmt})


def cmd_warmup(msg: dict) -> None:
    if not _gen_lock.acquire(timeout=_GEN_LOCK_HANDOFF_S):
        _emit_error(msg.get("id"), "A generation or model load is already in progress")
        return

    def run() -> None:
        try:
            _warmup_body(msg)
        except Exception as exc:  # noqa: BLE001
            _emit_error(msg.get("id"), str(exc), exc, context={"cmd": "warmup"})
        finally:
            _gen_lock.release()

    threading.Thread(target=run, name="thunder-fx-warmup", daemon=True).start()


def _warmup_body(msg: dict) -> None:
    global _mock_unloaded, _model_precision
    _apply_hf_token(msg)
    msg_id = msg.get("id")
    _cancel.clear()
    if _env_mock():
        _mock_unloaded = False
        _model_precision = _normalize_precision(msg.get("precision"))
        _emit({"id": msg_id, "event": "done", "message": "Mock engine — no model download needed."})
        return
    wanted = _normalize_precision(msg.get("precision"))
    # A preset can ask for medium-base, so warmup has to know which checkpoint
    # to bring in -- and downloading it is exactly the slow path warmup exists
    # to get out of the way.
    # Load model must keep working even when the default preset's checkpoint is
    # missing, so this inspects the plan rather than demanding it.
    plan = resolve_preset(msg.get("preset"), strict=False)
    wanted_model = str(msg.get("model") or "")
    if not wanted_model:
        wanted_model = DEFAULT_MODEL if plan["unavailable"] else plan["model"]
    label = "Medium" if wanted_model == DEFAULT_MODEL else wanted_model
    if _model is not None and _model_precision == wanted and _model_name == wanted_model:
        _emit({"id": msg_id, "event": "done", "message": f"{label} already loaded."})
        return
    started = time.time()
    heartbeat = _Heartbeat(msg_id, started, "loading").start()
    try:
        _emit_progress(
            msg_id, started, step=0, phase="loading", message=f"Loading {label}"
        )
        with _hub_progress(heartbeat):
            _try_load_model(wanted, wanted_model)
        if _cancel.is_set():
            _emit_error(msg_id, "Model load cancelled", log=False)
            return
        if _model is None:
            _emit_error(msg_id, f"{label} failed to load")
            return
        _emit(
            {
                "id": msg_id,
                "event": "done",
                "message": f"{label} loaded.",
                "model": wanted_model,
                "presetUnavailable": plan["unavailable"],
                "elapsedMs": int((time.time() - started) * 1000),
            }
        )
    except Exception as exc:  # noqa: BLE001
        _emit_error(msg_id, str(exc), exc, context={"cmd": "warmup"})
    finally:
        heartbeat.stop()


def cmd_unload(msg_id: str) -> None:
    global _model, _mock_unloaded
    # Unloading under a running generation would report freed VRAM that the
    # in-flight run still holds, so refuse rather than lie about the state.
    if not _gen_lock.acquire(timeout=_GEN_LOCK_HANDOFF_S):
        _emit_error(msg_id, "A generation or model load is already in progress")
        return
    try:
        if _env_mock():
            _mock_unloaded = True
            _emit({"id": msg_id, "event": "done", "message": "Mock model unloaded."})
            return
        with _model_lock:
            _unload_model_locked()
        _emit({"id": msg_id, "event": "done", "message": "Model unloaded."})
    finally:
        _gen_lock.release()


def _force_utf8_pipes() -> None:
    """Talk UTF-8 on stdin/stdout whatever the console code page says.

    The host sets PYTHONUTF8, but an older interpreter or a hand-started worker
    would otherwise decode the JSON with the Windows ANSI code page, turning an
    em dash in a category name into mojibake and choking on bytes cp1252 has no
    mapping for.
    """
    for stream in (sys.stdin, sys.stdout):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass


def _dispatch(cmd: str | None, msg: dict, msg_id) -> None:
    """Run one command off the stdin loop. Never raises into its thread."""
    try:
        if cmd == "status":
            cmd_status(msg_id)
        elif cmd == "probe":
            cmd_probe(msg_id, msg)
        elif cmd == "generate":
            cmd_generate(msg)
        elif cmd == "encode_ogg":
            cmd_encode_ogg(msg)
        elif cmd == "encode_audio":
            cmd_encode_audio(msg)
        elif cmd == "warmup":
            cmd_warmup(msg)
        elif cmd == "unload":
            cmd_unload(msg_id)
        else:
            _emit_error(msg_id, f"unknown cmd {cmd}")
    except Exception as exc:  # noqa: BLE001
        _emit_error(msg_id, str(exc), exc, context={"cmd": cmd})


def _preload_native_modules() -> None:
    """Load the C extensions here, on the main thread, before the read loop.

    While any thread sits in a blocking stdin read, a *first* native-extension
    import on another thread never returns -- it parks inside the module
    loader and the command that triggered it simply never answers. Dispatching
    commands to threads walked straight into that: the first `import soundfile`
    or `import torch` now happens off the main thread. Importing them up front,
    while nothing is blocked on stdin yet, turns every later import into a
    sys.modules lookup.

    This is the same work the first `status` used to do inline, just moved a
    few milliseconds earlier, so it costs the caller nothing it was not already
    paying. Anything already imported (stable_audio_3 leaning on torch) is
    fine in a thread; only the first load of a given extension is affected.
    """
    names = ["numpy", "soundfile"]
    # pynvml only supplies a GPU temperature reading and is often absent, so it
    # is preloaded when present but never complained about.
    optional = {"pynvml"}
    if not _env_mock():
        # Mock mode reaches none of these, and torch alone costs seconds.
        # stable_audio_3 is on the list because `status` walks the HF cache
        # through base_model_cached(), which imports it -- that used to happen
        # on the main thread during the first status, and it is what primed the
        # import for the generation threads that come later.
        names += ["torch", "pynvml", "huggingface_hub", "stable_audio_3.model_configs"]
    for name in names:
        try:
            __import__(name)
        except Exception as exc:  # noqa: BLE001
            # Not fatal: the command that needs it still reports its own error.
            if name not in optional:
                _log_error(f"preload of {name} failed", exc)


def main() -> None:
    _force_utf8_pipes()
    sys.excepthook = _excepthook
    threading.excepthook = _thread_excepthook
    _preload_native_modules()
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as exc:
            _emit_error(None, f"invalid json: {exc}", exc)
            continue
        cmd = msg.get("cmd")
        msg_id = msg.get("id")
        # Cancel is the one command that must never wait behind another, so it
        # runs right here. Everything else moves to a thread: `status` polls the
        # CUDA driver every 4s and those calls serialize against a running
        # generation, so handling one inline stopped this loop reading stdin --
        # which is exactly where cancel arrives. A cancel that never gets read
        # leaves the generation thread holding _gen_lock forever, and every
        # later request answers "a generation is already in progress" until the
        # app is restarted.
        if cmd == "cancel":
            _cancel.set()
            _emit({"id": msg_id, "event": "status", "message": "cancel requested"})
            continue
        threading.Thread(
            target=_dispatch,
            args=(cmd, msg, msg_id),
            name=f"thunder-fx-{cmd or 'cmd'}",
            daemon=True,
        ).start()


def _excepthook(exc_type, exc, tb) -> None:
    _log_error(str(exc) or getattr(exc_type, "__name__", "error"), exc)
    sys.__excepthook__(exc_type, exc, tb)


def _thread_excepthook(args: threading.ExceptHookArgs) -> None:
    _log_error(str(args.exc_value or args.exc_type), args.exc_value)


if __name__ == "__main__":
    main()
