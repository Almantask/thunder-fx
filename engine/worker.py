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
DEFAULT_STEPS = 20
MIN_STEPS = 4
MAX_STEPS = 100
DEFAULT_CFG = 1.0
MIN_SECONDS = 0.5
# Stable Audio 3 Medium max length (6m 20s).
MAX_SECONDS = 380.0


def clamp_steps(steps: int) -> int:
    try:
        val = int(steps)
    except (ValueError, TypeError):
        return DEFAULT_STEPS
    return max(MIN_STEPS, min(MAX_STEPS, val))


_cancel = threading.Event()
_model = None
_model_precision = "fp16"
_mock_unloaded = False
_model_lock = threading.Lock()
_gen_lock = threading.Lock()
_stdout_lock = threading.Lock()
_log_lock = threading.Lock()
_MAX_ERROR_LOG_BYTES = 2_000_000


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


def _try_load_model(precision: str = "fp16"):
    global _model, _model_precision
    if _env_mock():
        _model_precision = _normalize_precision(precision)
        return None
    _configure_hf_cache()
    wanted = _normalize_precision(precision)
    with _model_lock:
        if _model is not None and _model_precision == wanted:
            return _model
        if _model is not None:
            _unload_model_locked()
        from stable_audio_3 import StableAudioModel

        # SA3 defaults to model_half=True (fp16). FP16 is optimal for speed & VRAM.
        _model = StableAudioModel.from_pretrained(
            "medium",
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


def clamp_cfg(_cfg: float) -> float:
    # SA3 Medium is post-trained at CFG 1. Extra guidance over-steers.
    return DEFAULT_CFG


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


def _flag_true(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes"}


def _wants_seamless_loop(msg: dict, loopable: bool) -> bool:
    if not loopable:
        return False
    return _flag_true(msg.get("seamless_loop") if "seamless_loop" in msg else msg.get("seamlessLoop"))


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
        out.append(
            (
                int(round(tail_l * tail_gain + head_l * head_gain)),
                int(round(tail_r * tail_gain + head_r * head_gain)),
            )
        )
    out.extend(frames[fade : total - fade])
    return out


def _make_seamless_loop_tensor(wav, fade_sec: float, sample_rate: int = SAMPLE_RATE):
    import torch

    total = int(wav.shape[-1])
    fade_wanted = int(round(max(0.5, min(3.0, fade_sec)) * sample_rate))
    fade = max(2, min(fade_wanted, total // 3))
    if total < fade * 2 + 1:
        return wav
    t = torch.linspace(0, 1, fade, dtype=wav.dtype, device=wav.device)
    head_gain = torch.sin((t * math.pi) / 2).unsqueeze(0)
    tail_gain = torch.cos((t * math.pi) / 2).unsqueeze(0)
    mixed = wav[:, -fade:] * tail_gain + wav[:, :fade] * head_gain
    body = wav[:, fade: total - fade]
    return torch.cat([mixed, body], dim=-1)


def _write_wav(path: Path, frames: list[tuple[int, int]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(CHANNELS)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        packed = b"".join(struct.pack("<hh", l, r) for l, r in frames)
        wav.writeframes(packed)


_INSTRUMENT_TERMS = (
    ("fingerpicked acoustic guitar", "acoustic guitar"),
    ("acoustic guitar", "acoustic guitar"),
    ("classical guitar", "classical guitar"),
    ("electric guitar", "electric guitar"),
    ("plucked strings", "strings"),
    ("string ensemble", "strings"),
    ("string orchestra", "strings"),
    ("string section", "strings"),
    ("string harmonics", "strings"),
    ("string swells", "strings"),
    ("string runs", "strings"),
    ("string pads", "strings"),
    ("string pad", "strings"),
    ("low strings", "strings"),
    ("high strings", "strings"),
    ("warm strings", "strings"),
    ("muted strings", "strings"),
    ("bowed strings", "strings"),
    ("plucked runs", "strings"),
    ("plucked notes", "strings"),
    ("plucked patterns", "strings"),
    ("viola da gamba", "viola da gamba"),
    ("glass harmonica", "glass harmonica"),
    ("glass marimba", "marimba"),
    ("glass bells", "bells"),
    ("glass bell", "bells"),
    ("double bass", "double bass"),
    ("french horn", "french horn"),
    ("english horn", "english horn"),
    ("cor anglais", "english horn"),
    ("steel drums", "steel drum"),
    ("steel drum", "steel drum"),
    ("hurdy-gurdy", "hurdy-gurdy"),
    ("hurdy gurdy", "hurdy-gurdy"),
    ("pan flute", "pan flute"),
    ("pan pipes", "pan flute"),
    ("panpipes", "pan flute"),
    ("tin whistle", "whistle"),
    ("penny whistle", "whistle"),
    ("low whistle", "whistle"),
    ("woodwinds", "woodwinds"),
    ("woodwind", "woodwinds"),
    ("ambient pads", "pad"),
    ("ambient pad", "pad"),
    ("glow pads", "pad"),
    ("glow pad", "pad"),
    ("warm pads", "pad"),
    ("warm pad", "pad"),
    ("synth pads", "synth"),
    ("synth pad", "synth"),
    ("synthesizer", "synth"),
    ("church organ", "organ"),
    ("pipe organ", "organ"),
    ("reed organ", "organ"),
    ("pump organ", "organ"),
    ("finger cymbals", "zils"),
    ("finger cymbal", "zils"),
    ("wordless choir", "choir"),
    ("female choir", "choir"),
    ("male choir", "choir"),
    ("vocal choir", "choir"),
    ("boy choir", "choir"),
    ("choral swells", "choir"),
    ("full orchestra", "orchestra"),
    ("chamber orchestra", "orchestra"),
    ("taiko drums", "taiko"),
    ("taiko drum", "taiko"),
    ("taiko", "taiko"),
    ("war drums", "war drums"),
    ("war drum", "war drums"),
    ("hand drums", "hand drums"),
    ("hand drum", "hand drums"),
    ("snare drum", "snare"),
    ("heavy horns", "horns"),
    ("solo cello", "cello"),
    ("solo violin", "violin"),
    ("solo flute", "flute"),
    ("solo horn", "horn"),
    ("harpsichord", "harpsichord"),
    ("glockenspiel", "glockenspiel"),
    ("celesta", "celesta"),
    ("celeste", "celesta"),
    ("waterphone", "waterphone"),
    ("darbuka", "darbuka"),
    ("dumbek", "darbuka"),
    ("oud", "oud"),
    ("contrabass", "contrabass"),
    ("contra bass", "contrabass"),
    ("gamba", "viola da gamba"),
    ("percussion", "percussion"),
    ("accordion", "accordion"),
    ("bagpipes", "bagpipes"),
    ("mandolin", "mandolin"),
    ("clarinet", "clarinet"),
    ("trombone", "trombone"),
    ("trumpet", "trumpet"),
    ("bassoon", "bassoon"),
    ("piccolo", "piccolo"),
    ("dulcimer", "dulcimer"),
    ("ocarina", "ocarina"),
    ("bodhran", "bodhran"),
    ("timpani", "timpani"),
    ("snare", "snare"),
    ("cymbals", "cymbals"),
    ("cymbal", "cymbals"),
    ("gongs", "gong"),
    ("gong", "gong"),
    ("tambourine", "tambourine"),
    ("shakers", "shaker"),
    ("shaker", "shaker"),
    ("castanets", "castanets"),
    ("xylophone", "xylophone"),
    ("marimba", "marimba"),
    ("vibraphone", "vibraphone"),
    ("kalimba", "kalimba"),
    ("whistle", "whistle"),
    ("recorder", "recorder"),
    ("duduk", "duduk"),
    ("shakuhachi", "shakuhachi"),
    ("erhu", "erhu"),
    ("koto", "koto"),
    ("shamisen", "shamisen"),
    ("sitar", "sitar"),
    ("bouzouki", "bouzouki"),
    ("nyckelharpa", "nyckelharpa"),
    ("cittern", "cittern"),
    ("theorbo", "theorbo"),
    ("zils", "zils"),
    ("zil", "zils"),
    ("ney", "ney"),
    ("shawm", "shawm"),
    ("crumhorn", "crumhorn"),
    ("sackbut", "sackbut"),
    ("lyre", "lyre"),
    ("zither", "zither"),
    ("autoharp", "autoharp"),
    ("didgeridoo", "didgeridoo"),
    ("harmonica", "harmonica"),
    ("theremin", "theremin"),
    ("mellotron", "mellotron"),
    ("orchestra", "orchestra"),
    ("orchestral", "orchestra"),
    ("symphonic", "orchestra"),
    ("choir", "choir"),
    ("choral", "choir"),
    ("vocalise", "choir"),
    ("strings", "strings"),
    ("string", "strings"),
    ("plucked", "strings"),
    ("plucks", "strings"),
    ("strums", "guitar"),
    ("violin", "violin"),
    ("fiddle", "fiddle"),
    ("guitar", "guitar"),
    ("piano", "piano"),
    ("cello", "cello"),
    ("viola", "viola"),
    ("flute", "flute"),
    ("brass", "brass"),
    ("drums", "drums"),
    ("drum", "drums"),
    ("organ", "organ"),
    ("banjo", "banjo"),
    ("harp", "harp"),
    ("lute", "lute"),
    ("oboe", "oboe"),
    ("horns", "horns"),
    ("horn", "horn"),
    ("tuba", "tuba"),
    ("bass", "bass"),
    ("synth", "synth"),
    ("chimes", "chimes"),
    ("bells", "bells"),
    ("bell", "bells"),
    ("pads", "pad"),
    ("pad", "pad"),
    ("drone", "drone"),
    ("drones", "drone"),
    ("winds", "woodwinds"),
    ("wind", "woodwinds"),
    ("reeds", "woodwinds"),
    ("reed", "woodwinds"),
    ("djembe", "djembe"),
    ("cajon", "cajon"),
    ("congas", "congas"),
    ("conga", "congas"),
    ("bongos", "bongos"),
    ("bongo", "bongos"),
    ("tabla", "tabla"),
    ("kantele", "kantele"),
    ("balalaika", "balalaika"),
    ("santoor", "santoor"),
    ("santur", "santoor"),
    ("psaltery", "psaltery"),
    ("clavichord", "clavichord"),
)


def _fold_text(text: str) -> str:
    import unicodedata

    return "".join(
        ch for ch in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(ch) != "Mn"
    )


def extract_instruments(prompt: str) -> list[str]:
    hay = _fold_text(prompt)
    hits: list[tuple[int, str]] = []
    occupied: list[tuple[int, int]] = []
    for term, name in sorted(_INSTRUMENT_TERMS, key=lambda item: -len(item[0])):
        start = 0
        while True:
            idx = hay.find(term, start)
            if idx < 0:
                break
            before = hay[idx - 1] if idx > 0 else " "
            after_i = idx + len(term)
            after = hay[after_i] if after_i < len(hay) else " "
            if (not before.isalnum()) and (not after.isalnum()):
                if not any(idx < end and after_i > begin for begin, end in occupied):
                    hits.append((idx, name))
                    occupied.append((idx, after_i))
            start = idx + 1
    hits.sort()
    names: list[str] = []
    seen: set[str] = set()
    for _, name in hits:
        if name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def _resolve_instruments(msg: dict, prompt: str) -> list[str]:
    raw = msg.get("instruments")
    if isinstance(raw, list):
        names = [str(item).strip() for item in raw if str(item).strip()]
        if names:
            return names
    if _wants_music(msg):
        return extract_instruments(prompt)
    return []


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


def _music_info_fields(
    prompt: str,
    instruments: list[str],
    category: str = "",
    intensity: str = "",
) -> dict[str, str]:
    return _wav_info_fields(
        prompt,
        instruments,
        mode="music",
        category=category,
        intensity=intensity,
    )


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


def _master_audio_cpu(wav):
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

    # 3. Peak Normalization to -1.0 dBFS (amplitude 0.89125) if signal clips / exceeds headroom
    peak = float(wav.abs().max().item())
    target_peak = 0.89125  # -1.0 dBFS
    if peak > target_peak:
        wav = wav * (target_peak / peak)

    return wav.clamp(-1.0, 1.0)


def _save_generated_wav(
    path: Path, audio, master: bool = True, loop: bool = False, fade_sec: float = 1.0
) -> None:
    """Write 16-bit PCM stereo @ 44.1 kHz (the studio parser rejects float WAV)."""
    import torch

    wav = _to_stereo_cpu(audio)
    if master:
        wav = _master_audio_cpu(wav)
    if loop:
        wav = _make_seamless_loop_tensor(wav, fade_sec)
    pcm = (wav * 32767.0).round().clamp(-32768, 32767).to(torch.int16)
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

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=1.0)

    def _snapshot(self) -> tuple[str, int, int, float | None]:
        with self._lock:
            return self._phase, self._step, self._total, self._ratio

    def _run(self) -> None:
        while not self._stop.wait(0.25):
            phase, step, total, ratio = self._snapshot()
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

    try:
        from tqdm.auto import tqdm as BaseTqdm
    except Exception:
        try:
            from tqdm import tqdm as BaseTqdm
        except Exception:
            BaseTqdm = None  # type: ignore[assignment]

    if BaseTqdm is not None:

        class EmitTqdm(BaseTqdm):
            def update(self, n=1):
                result = super().update(n)
                total = getattr(self, "total", None) or 0
                current = getattr(self, "n", 0) or 0
                if total:
                    on_ratio(current / total)
                return result

        for mod_name in ("huggingface_hub.utils.tqdm", "tqdm.auto", "tqdm"):
            try:
                mod = __import__(mod_name, fromlist=["tqdm"])
            except Exception:
                continue
            original = getattr(mod, "tqdm", None)
            if original is None:
                continue
            setattr(mod, "tqdm", EmitTqdm)
            restore.append((mod, original))

    try:
        yield
    finally:
        for mod, original in restore:
            try:
                setattr(mod, "tqdm", original)
            except Exception:
                pass


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
        with _log_lock:
            with path.open("a", encoding="utf-8") as fh:
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


def cmd_status(msg_id: str) -> None:
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
        "id": msg_id,
        "event": "status",
        "ready": ready,
        "mock": mock,
        "loaded": (not _mock_unloaded) if mock else _model is not None,
        "device": device,
        "message": message,
    }
    payload.update(_vram_stats())
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


def cmd_generate(msg: dict) -> None:
    if not _gen_lock.acquire(blocking=False):
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
    cfg = clamp_cfg(_python_float(msg.get("cfg", 1.0), 1.0))
    steps = clamp_steps(int(_python_float(msg.get("steps", DEFAULT_STEPS), float(DEFAULT_STEPS))))
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
    model_negative = ensure_loop_negative(negative or "") if loop else negative
    cat_str = _sanitize_folder_name(msg.get("category"), fallback="Custom")
    subcat_default = "Level I" if music else "General"
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
        instruments = _resolve_instruments(msg, prompt)
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
            }
        )
        return

    if _model is None:
        _emit_error(msg_id, "The model is not loaded. Click Load model first.")
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
            "precision": _model_precision,
            "seamlessLoop": loop,
        }
        try:
            audio = model.generate(
                prompt=model_prompt,
                duration=gen_seconds,
                steps=steps,
                seed=seed,
                cfg_scale=cfg,
                negative_prompt=model_negative,
                chunked_decode=chunked,
            )
        except Exception as exc:  # noqa: BLE001
            if "out of memory" in str(exc).lower() or "oom" in str(exc).lower():
                _log_error("CUDA OOM; retrying with chunked decode", exc, context=gen_context)
                chunked = True
                audio = model.generate(
                    prompt=model_prompt,
                    duration=gen_seconds,
                    steps=steps,
                    seed=seed,
                    cfg_scale=cfg,
                    negative_prompt=model_negative,
                    chunked_decode=True,
                )
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
            _save_generated_wav(out, audio, master=True, loop=loop, fade_sec=fade)
        except Exception as exc:  # noqa: BLE001
            _emit_error(
                msg_id,
                f"failed to write WAV: {exc}",
                exc,
                context=gen_context,
            )
            return
        instruments = _resolve_instruments(msg, prompt)
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
    if target_sr <= 0 or sr == target_sr:
        return data, sr
    try:
        import soxr

        return soxr.resample(data, sr, target_sr), target_sr
    except Exception:
        pass
    try:
        import numpy as np
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Resample needs numpy or soxr: {exc}") from exc
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
        import numpy as np

        if data.shape[1] <= 8:
            return data.mean(axis=1)
        return data.mean(axis=0)
    except Exception:
        return data


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
        elif fmt == "flac":
            subtype = "PCM_24" if bit_depth >= 24 else "PCM_16"
            sf.write(str(dest_path), data, sr, format="FLAC", subtype=subtype)
        elif fmt == "wav":
            subtype = "PCM_24" if bit_depth >= 24 else "PCM_16"
            sf.write(str(dest_path), data, sr, format="WAV", subtype=subtype)
        elif fmt == "mp3":
            _write_mp3(data, int(sr), dest_path)
        else:
            raise RuntimeError(f"Unsupported export format: {fmt}")
        _emit({"id": msg_id, "event": "done", "path": str(dest_path), "format": fmt})
    except Exception as exc:  # noqa: BLE001
        _emit_error(msg_id, str(exc), exc, context={"cmd": "encode_audio", "format": fmt})


def cmd_warmup(msg: dict) -> None:
    if not _gen_lock.acquire(blocking=False):
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
    if _model is not None and _model_precision == wanted:
        _emit({"id": msg_id, "event": "done", "message": "Medium already loaded."})
        return
    started = time.time()
    heartbeat = _Heartbeat(msg_id, started, "loading").start()
    try:
        _emit_progress(msg_id, started, step=0, phase="loading", message="Loading model")
        with _hub_progress(heartbeat):
            _try_load_model(wanted)
        if _cancel.is_set():
            _emit_error(msg_id, "Model load cancelled", log=False)
            return
        if _model is None:
            _emit_error(msg_id, "Medium failed to load")
            return
        _emit(
            {
                "id": msg_id,
                "event": "done",
                "message": "Medium loaded.",
                "elapsedMs": int((time.time() - started) * 1000),
            }
        )
    except Exception as exc:  # noqa: BLE001
        _emit_error(msg_id, str(exc), exc, context={"cmd": "warmup"})
    finally:
        heartbeat.stop()


def cmd_unload(msg_id: str) -> None:
    global _model, _mock_unloaded
    if _env_mock():
        _mock_unloaded = True
        _emit({"id": msg_id, "event": "done", "message": "Mock model unloaded."})
        return
    with _model_lock:
        _unload_model_locked()
    _emit({"id": msg_id, "event": "done", "message": "Model unloaded."})


def main() -> None:
    sys.excepthook = _excepthook
    threading.excepthook = _thread_excepthook
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
        try:
            if cmd == "status":
                cmd_status(msg_id)
            elif cmd == "probe":
                cmd_probe(msg_id, msg)
            elif cmd == "generate":
                cmd_generate(msg)
            elif cmd == "cancel":
                _cancel.set()
                _emit({"id": msg_id, "event": "status", "message": "cancel requested"})
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


def _excepthook(exc_type, exc, tb) -> None:
    _log_error(str(exc) or getattr(exc_type, "__name__", "error"), exc)
    sys.__excepthook__(exc_type, exc, tb)


def _thread_excepthook(args: threading.ExceptHookArgs) -> None:
    _log_error(str(args.exc_value or args.exc_type), args.exc_value)


if __name__ == "__main__":
    main()
