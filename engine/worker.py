#!/usr/bin/env python3
"""Keep-alive JSON-lines worker for Thunder FX.

Protocol (one JSON object per line):

  {"id":"1","cmd":"status"}
  {"id":"2","cmd":"probe"}
  {"id":"3","cmd":"generate","prompt":"...","seconds":8,"seed":-1,"cfg":1.0,"negative":""}
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
import struct
import sys
import threading
import time
import traceback
import uuid
import wave
from pathlib import Path

SAMPLE_RATE = 44100
CHANNELS = 2
TOTAL_RITES = 8

_cancel = threading.Event()
_model = None
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


def _try_load_model():
    global _model
    if _env_mock():
        return None
    _configure_hf_cache()
    with _model_lock:
        if _model is not None:
            return _model
        from stable_audio_3 import StableAudioModel

        # Plan: fp32. SA3 defaults to model_half=True (fp16).
        _model = StableAudioModel.from_pretrained("medium", device="cuda", model_half=False)
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


def _write_wav(path: Path, frames: list[tuple[int, int]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(CHANNELS)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        packed = b"".join(struct.pack("<hh", l, r) for l, r in frames)
        wav.writeframes(packed)


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


def _save_generated_wav(path: Path, audio) -> None:
    """Write 16-bit PCM stereo @ 44.1 kHz (the studio parser rejects float WAV)."""
    import torch

    wav = _to_stereo_cpu(audio)
    pcm = (wav * 32767.0).round().clamp(-32768, 32767).to(torch.int16)
    interleaved = pcm.transpose(0, 1).contiguous().numpy().tobytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(CHANNELS)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(interleaved)


def _mock_pcm(seconds: float, seed: int) -> list[tuple[int, int]]:
    rng = random.Random(seed if seed > 0 else 1)
    n = max(1, int(seconds * SAMPLE_RATE))
    frames: list[tuple[int, int]] = []
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
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()


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
            message = str(exc)
    _emit(
        {
            "id": msg_id,
            "event": "status",
            "ready": ready,
            "mock": mock,
            "device": device,
            "message": message,
        }
    )


def cmd_probe(msg_id: str, msg: dict | None = None) -> None:
    _apply_hf_token(msg)
    mock = _env_mock()
    if mock:
        _emit(
            {
                "id": msg_id,
                "event": "probe",
                "ok": True,
                "flavor": "The brazier catches. A mock weave is ready until CUDA Medium is installed.",
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
        "The brazier is lit."
        if ok
        else "The signs fail. The keep cannot host Medium until CUDA and Flash Attention are present."
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
        _emit_error(msg.get("id"), "A weave is already in progress")
        return

    def run() -> None:
        try:
            _generate_body(msg)
        except Exception as exc:  # noqa: BLE001
            _emit_error(msg.get("id"), str(exc), exc, context={"cmd": "generate"})
        finally:
            _gen_lock.release()

    threading.Thread(target=run, name="thunder-fx-generate", daemon=True).start()


def _generate_body(msg: dict) -> None:
    _apply_hf_token(msg)
    msg_id = msg["id"]
    prompt = str(msg.get("prompt", "")).strip()
    seconds = _python_float(msg.get("seconds", 8), 8.0)
    seed = int(_python_float(msg.get("seed", -1), -1.0))
    cfg = _python_float(msg.get("cfg", 1.0), 1.0)
    negative = str(msg.get("negative") or "") or None
    _cancel.clear()
    if seed <= 0:
        seed = random.randint(1, 2_147_483_646)
    out = _library_dir(str(msg.get("library_dir") or msg.get("libraryDir") or "")) / f"{uuid.uuid4()}.wav"
    started = time.time()
    mock = _env_mock()
    if mock:
        for step in range(1, TOTAL_RITES + 1):
            if _cancel.is_set():
                _emit_error(msg_id, "Cast dispelled", log=False)
                return
            _emit(
                {
                    "id": msg_id,
                    "event": "progress",
                    "step": step,
                    "total": TOTAL_RITES,
                    "elapsedMs": int((time.time() - started) * 1000),
                }
            )
            time.sleep(_mock_step_s())
        _write_wav(out, _mock_pcm(seconds, seed))
        _emit(
            {
                "id": msg_id,
                "event": "done",
                "path": str(out),
                "seed": seed,
                "duration": seconds,
                "prompt": prompt,
            }
        )
        return

    model = _try_load_model()
    for step in range(1, TOTAL_RITES + 1):
        if _cancel.is_set():
            _emit_error(msg_id, "Cast dispelled", log=False)
            return
        _emit(
            {
                "id": msg_id,
                "event": "progress",
                "step": step,
                "total": TOTAL_RITES,
                "elapsedMs": int((time.time() - started) * 1000),
            }
        )
    chunked = False
    gen_context = {
        "cmd": "generate",
        "prompt": prompt,
        "seconds": seconds,
        "seed": seed,
        "cfg": cfg,
    }
    try:
        audio = model.generate(
            prompt=prompt,
            duration=seconds,
            steps=8,
            seed=seed,
            cfg_scale=cfg,
            negative_prompt=negative,
            chunked_decode=False,
        )
    except Exception as exc:  # noqa: BLE001
        if "out of memory" in str(exc).lower() or "oom" in str(exc).lower():
            _log_error("CUDA OOM; retrying with chunked decode", exc, context=gen_context)
            chunked = True
            audio = model.generate(
                prompt=prompt,
                duration=seconds,
                steps=8,
                seed=seed,
                cfg_scale=cfg,
                negative_prompt=negative,
                chunked_decode=True,
            )
        else:
            _emit_error(msg_id, str(exc), exc, context=gen_context)
            return
    try:
        _save_generated_wav(out, audio)
    except Exception as exc:  # noqa: BLE001
        _emit_error(
            msg_id,
            f"failed to write WAV: {exc}",
            exc,
            context=gen_context,
        )
        return
    _emit(
        {
            "id": msg_id,
            "event": "done",
            "path": str(out),
            "seed": seed,
            "duration": seconds,
            "prompt": prompt,
            "chunkedDecode": chunked,
        }
    )


def cmd_encode_ogg(msg: dict) -> None:
    msg_id = msg["id"]
    wav_path = Path(msg["wav_path"])
    ogg_path = Path(msg["ogg_path"])
    try:
        import soundfile as sf

        data, sr = sf.read(str(wav_path))
        ogg_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(ogg_path), data, sr, format="OGG", subtype="VORBIS")
        _emit({"id": msg_id, "event": "done", "path": str(ogg_path)})
    except Exception as exc:  # noqa: BLE001
        _emit_error(msg_id, str(exc), exc, context={"cmd": "encode_ogg"})


def cmd_warmup(msg: dict) -> None:
    _apply_hf_token(msg)
    msg_id = msg.get("id")
    if _env_mock():
        _emit({"id": msg_id, "event": "done", "message": "Mock engine — no weights to scribe."})
        return
    started = time.time()
    _emit(
        {
            "id": msg_id,
            "event": "progress",
            "step": 1,
            "total": TOTAL_RITES,
            "elapsedMs": 0,
        }
    )
    try:
        _try_load_model()
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
            elif cmd == "warmup":
                cmd_warmup(msg)
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
