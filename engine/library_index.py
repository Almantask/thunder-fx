#!/usr/bin/env python3
"""Read-only index over the Thunder FX library folder.

A library clip is a bare WAV on disk. Its prompt and mode come from the file's
`LIST`/`INFO` chunk and the folder it sits in; favourites, ratings, tags and
renames come from the `thunder-fx-meta.json` sidecar. Both halves are read with
the same semantics as `src/lib/clipMeta.ts` and `clip_json_from_path` in
`src-tauri/src/lib.rs` -- notably that a clip's id is its file stem, so a rename
changes the id.

Nothing here writes. The MCP surface deliberately cannot edit triage decisions.
"""

from __future__ import annotations

import json
import os
import re
import struct
import wave
from dataclasses import dataclass, field
from pathlib import Path

META_FILENAME = "thunder-fx-meta.json"
TRASH_DIRNAME = ".trash"
MAX_RATING = 5

# `worker.read_wav_info` reads the whole file to find the INFO chunk, which is
# correct for one clip and unusable for a scan: a six-minute stereo WAV is ~65 MB
# and a library holds thousands. `embed_wav_info` inserts the LIST chunk directly
# after `fmt `, so it is always within the first few KB -- reading a bounded
# header window finds it without paging the audio in.
_HEADER_WINDOW_BYTES = 64 * 1024

_INFO_TAGS = ("INAM", "IGNR", "ISBJ", "IART", "ISFT", "IKEY", "ICMT")


def library_dir(override: str | None = None) -> Path:
    """Mirrors `_library_dir` in worker.py, without creating the folder."""
    chosen = (override or "").strip() or os.environ.get("THUNDER_FX_LIBRARY_DIR", "").strip()
    if chosen:
        return Path(chosen)
    local = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_DATA_HOME")
    if local:
        return Path(local) / "thunder-fx" / "library"
    return Path.home() / ".thunder-fx" / "library"


def read_wav_info_header(path: Path, window: int = _HEADER_WINDOW_BYTES) -> dict[str, str]:
    """INFO tags from a WAV, reading only the first `window` bytes."""
    try:
        with open(path, "rb") as handle:
            data = handle.read(window)
    except OSError:
        return {}
    if data[0:4] != b"RIFF" or data[8:12] != b"WAVE":
        return {}
    fields: dict[str, str] = {}
    offset = 12
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
                if tag in _INFO_TAGS:
                    try:
                        fields[tag] = raw.split(b"\x00", 1)[0].decode("utf-8")
                    except UnicodeDecodeError:
                        fields[tag] = raw.split(b"\x00", 1)[0].decode("latin-1", "replace")
                cursor += 8 + sub + (sub % 2)
            break
        if chunk_id == b"data":
            # Audio starts here; no INFO chunk was written before it.
            break
        offset += 8 + size + (size % 2)
    return fields


def wav_seconds(path: Path) -> float | None:
    """Clip length from the WAV header. Does not read the audio."""
    try:
        with wave.open(str(path), "rb") as handle:
            rate = handle.getframerate()
            frames = handle.getnframes()
    except (OSError, wave.Error, EOFError):
        # A truncated file raises EOFError out of the chunk reader rather than
        # wave.Error, so a half-written clip must not take a whole scan down.
        return None
    if not rate:
        return None
    return round(frames / float(rate), 3)


@dataclass
class ClipMeta:
    favorite: bool = False
    rejected: bool = False
    rating: int = 0
    tags: tuple[str, ...] = ()
    name: str = ""


@dataclass
class LibraryClip:
    id: str
    path: Path
    mode: str
    category: str
    subcategory: str
    seconds: float | None
    modified_at: float
    size_bytes: int
    prompt: str = ""
    title: str = ""
    instruments: tuple[str, ...] = ()
    meta: ClipMeta = field(default_factory=ClipMeta)

    @property
    def display_name(self) -> str:
        return self.meta.name or self.title or self.id

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.display_name,
            "path": str(self.path),
            "mode": self.mode,
            "category": self.category,
            "subcategory": self.subcategory,
            "seconds": self.seconds,
            "prompt": self.prompt,
            "instruments": list(self.instruments),
            "favorite": self.meta.favorite,
            "rejected": self.meta.rejected,
            "rating": self.meta.rating,
            "tags": list(self.meta.tags),
            "size_bytes": self.size_bytes,
            "modified_at": self.modified_at,
        }


def load_meta(root: Path) -> dict[str, ClipMeta]:
    """Read the sidecar. A missing or corrupt file means no metadata, not an error."""
    path = Path(root) / META_FILENAME
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return {}
    clips = raw.get("clips") if isinstance(raw, dict) else None
    if not isinstance(clips, dict):
        return {}
    out: dict[str, ClipMeta] = {}
    for clip_id, entry in clips.items():
        if not isinstance(entry, dict):
            continue
        rating = entry.get("rating")
        tags = entry.get("tags")
        out[str(clip_id)] = ClipMeta(
            favorite=bool(entry.get("favorite")),
            rejected=bool(entry.get("rejected")),
            rating=int(rating) if isinstance(rating, (int, float)) else 0,
            tags=tuple(str(t) for t in tags if str(t).strip()) if isinstance(tags, list) else (),
            name=str(entry.get("name") or ""),
        )
    return out


def _mode_from_parts(parts: tuple[str, ...]) -> tuple[str, str, str]:
    """Split the `<mode>/<category>/<subcategory>` tail the engine writes into."""
    mode = parts[0].lower() if len(parts) >= 1 else ""
    if mode not in {"sfx", "ambience", "music"}:
        mode = mode or "sfx"
    category = parts[1] if len(parts) >= 2 else ""
    subcategory = parts[2] if len(parts) >= 3 else ""
    return mode, category, subcategory


def _title_from_info(info: dict[str, str]) -> str:
    return (info.get("INAM") or "").strip()


def _instruments_from_info(info: dict[str, str]) -> tuple[str, ...]:
    raw = (info.get("IKEY") or "").strip()
    if not raw:
        return ()
    return tuple(part.strip() for part in raw.split(";") if part.strip())


def scan_library(root: Path | None = None, *, read_info: bool = True) -> list[LibraryClip]:
    """Every WAV in the library, newest first. Trash is excluded."""
    base = Path(root) if root is not None else library_dir()
    if not base.is_dir():
        return []
    meta = load_meta(base)
    clips: list[LibraryClip] = []
    for path in base.rglob("*.wav"):
        rel = path.relative_to(base)
        parts = rel.parts[:-1]
        if any(part.lower() == TRASH_DIRNAME for part in parts):
            continue
        try:
            stat = path.stat()
        except OSError:
            continue
        mode, category, subcategory = _mode_from_parts(parts)
        info = read_wav_info_header(path) if read_info else {}
        clips.append(
            LibraryClip(
                id=path.stem,
                path=path,
                mode=mode,
                category=category,
                subcategory=subcategory,
                seconds=wav_seconds(path),
                modified_at=stat.st_mtime,
                size_bytes=stat.st_size,
                prompt=(info.get("ICMT") or "").strip(),
                title=_title_from_info(info),
                instruments=_instruments_from_info(info),
                meta=meta.get(path.stem, ClipMeta()),
            )
        )
    clips.sort(key=lambda c: c.modified_at, reverse=True)
    return clips


def search_clips(
    clips: list[LibraryClip],
    *,
    query: str | None = None,
    mode: str | None = None,
    favorites_only: bool = False,
    show_rejected: bool = False,
    min_rating: int = 0,
    tags: list[str] | None = None,
    limit: int = 20,
) -> list[LibraryClip]:
    """Filter a scan. Matches `applyLibraryFilter` in src/lib/clipMeta.ts."""
    wanted_tags = [t.strip().lower() for t in (tags or []) if t.strip()]
    needle = (query or "").strip().lower()
    out: list[LibraryClip] = []
    for clip in clips:
        # Rejects are hidden rather than deleted, so they stay out unless asked for.
        if clip.meta.rejected and not show_rejected:
            continue
        if favorites_only and not clip.meta.favorite:
            continue
        if min_rating > 0 and clip.meta.rating < min_rating:
            continue
        if mode and clip.mode != mode.strip().lower():
            continue
        if wanted_tags:
            have = {t.lower() for t in clip.meta.tags}
            # A clip must carry every selected tag, not any of them.
            if not all(t in have for t in wanted_tags):
                continue
        if needle:
            haystack = " ".join(
                [
                    clip.display_name,
                    clip.id,
                    clip.prompt,
                    clip.title,
                    clip.category,
                    clip.subcategory,
                ]
            ).lower()
            if needle not in haystack:
                continue
        out.append(clip)
        if limit > 0 and len(out) >= limit:
            break
    return out


_SAFE_ID_RE = re.compile(r"^[^\\/:*?\"<>|]+$")


def find_clip(clip: str, root: Path | None = None) -> LibraryClip | None:
    """Resolve a clip id (file stem) or an absolute path to a library clip."""
    base = Path(root) if root is not None else library_dir()
    candidate = Path(clip)
    if candidate.is_absolute():
        try:
            candidate.relative_to(base)
        except ValueError:
            # Outside the library: not addressable through this surface.
            return None
        if not candidate.is_file():
            return None
        target_stem = candidate.stem
    else:
        if not _SAFE_ID_RE.match(clip.strip()):
            return None
        target_stem = Path(clip.strip()).stem
    # Locate without reading INFO chunks: opening a header for every clip in the
    # library to find one of them is thousands of wasted file opens. The match
    # is then hydrated on its own.
    for found in scan_library(base, read_info=False):
        if found.id == target_stem:
            info = read_wav_info_header(found.path)
            found.prompt = (info.get("ICMT") or "").strip()
            found.title = _title_from_info(info)
            found.instruments = _instruments_from_info(info)
            return found
    return None
