#!/usr/bin/env python3
"""Tests for the read-only library index."""

from __future__ import annotations

import json
import os
import struct
import sys
import tempfile
import unittest
import wave
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

import library_index as li  # noqa: E402
import worker  # noqa: E402


def write_wav(path: Path, seconds: float = 1.0, rate: int = 44100) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = int(seconds * rate)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"\x00\x00\x00\x00" * frames)


def write_meta(root: Path, clips: dict) -> None:
    (root / li.META_FILENAME).write_text(
        json.dumps({"version": 1, "clips": clips}), encoding="utf-8"
    )


class InfoHeaderReader(unittest.TestCase):
    """The bounded reader must agree with the worker's own full-file reader."""

    def test_matches_worker_read_wav_info(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "clip.wav"
            write_wav(path, seconds=0.2)
            fields = worker._wav_info_fields(
                "TrackType: SFX, a door slam, dry studio. Length: 1 second",
                ["lute"],
                "sfx",
                category="Combat",
            )
            worker.embed_wav_info(path, fields)
            full = worker.read_wav_info(path)
            windowed = li.read_wav_info_header(path)
        self.assertEqual(windowed.get("ICMT"), full.get("ICMT"))
        self.assertEqual(windowed.get("INAM"), full.get("INAM"))
        self.assertTrue(windowed["ICMT"].startswith("TrackType: SFX, a door slam"))

    def test_reads_only_the_window(self):
        """A tiny window must not blow up, just find nothing."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "clip.wav"
            write_wav(path, seconds=0.2)
            worker.embed_wav_info(path, worker._wav_info_fields("TrackType: SFX, x", [], "sfx"))
            self.assertEqual(li.read_wav_info_header(path, window=16), {})

    def test_non_wav_is_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "not.wav"
            path.write_bytes(b"this is not a riff file at all")
            self.assertEqual(li.read_wav_info_header(path), {})

    def test_missing_file_is_empty(self):
        self.assertEqual(li.read_wav_info_header(Path("no-such-file.wav")), {})

    def test_wav_without_info_is_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bare.wav"
            write_wav(path, seconds=0.2)
            self.assertEqual(li.read_wav_info_header(path), {})

    def test_truncated_chunk_does_not_hang(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "trunc.wav"
            path.write_bytes(b"RIFF" + struct.pack("<I", 4) + b"WAVEfmt ")
            self.assertEqual(li.read_wav_info_header(path), {})


class WavSeconds(unittest.TestCase):
    def test_reads_duration(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "clip.wav"
            write_wav(path, seconds=2.5)
            self.assertAlmostEqual(li.wav_seconds(path), 2.5, places=2)

    def test_bad_file_is_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.wav"
            path.write_bytes(b"nope")
            self.assertIsNone(li.wav_seconds(path))


class LibraryDir(unittest.TestCase):
    def test_env_override_wins(self):
        old = os.environ.get("THUNDER_FX_LIBRARY_DIR")
        os.environ["THUNDER_FX_LIBRARY_DIR"] = r"D:\somewhere\lib"
        try:
            self.assertEqual(li.library_dir(), Path(r"D:\somewhere\lib"))
        finally:
            if old is None:
                del os.environ["THUNDER_FX_LIBRARY_DIR"]
            else:
                os.environ["THUNDER_FX_LIBRARY_DIR"] = old

    def test_explicit_override_beats_env(self):
        self.assertEqual(li.library_dir(r"E:\given"), Path(r"E:\given"))

    def test_does_not_create_the_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "nope"
            self.assertEqual(li.library_dir(str(target)), target)
            self.assertFalse(target.exists())


class ScanLibrary(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        write_wav(self.root / "sfx" / "Combat" / "General" / "sword-1s-aaaa.wav")
        write_wav(self.root / "ambience" / "Forest" / "General" / "rain-30s-bbbb.wav")
        write_wav(self.root / "music" / "Tavern" / "II" / "lute-20s-cccc.wav")
        write_wav(self.root / ".trash" / "sfx" / "deleted-1s-dddd.wav")

    def tearDown(self):
        self._tmp.cleanup()

    def test_finds_every_clip(self):
        ids = {c.id for c in li.scan_library(self.root)}
        self.assertEqual(ids, {"sword-1s-aaaa", "rain-30s-bbbb", "lute-20s-cccc"})

    def test_trash_excluded(self):
        ids = {c.id for c in li.scan_library(self.root)}
        self.assertNotIn("deleted-1s-dddd", ids)

    def test_mode_and_category_from_folders(self):
        clips = {c.id: c for c in li.scan_library(self.root)}
        self.assertEqual(clips["rain-30s-bbbb"].mode, "ambience")
        self.assertEqual(clips["rain-30s-bbbb"].category, "Forest")
        self.assertEqual(clips["lute-20s-cccc"].subcategory, "II")

    def test_newest_first(self):
        clips = li.scan_library(self.root)
        times = [c.modified_at for c in clips]
        self.assertEqual(times, sorted(times, reverse=True))

    def test_missing_root_is_empty(self):
        self.assertEqual(li.scan_library(Path("no-such-library-dir")), [])

    def test_meta_applied(self):
        write_meta(
            self.root,
            {"sword-1s-aaaa": {"favorite": True, "rating": 4, "tags": ["metal", "dry"]}},
        )
        clips = {c.id: c for c in li.scan_library(self.root)}
        self.assertTrue(clips["sword-1s-aaaa"].meta.favorite)
        self.assertEqual(clips["sword-1s-aaaa"].meta.rating, 4)
        self.assertEqual(clips["sword-1s-aaaa"].meta.tags, ("metal", "dry"))

    def test_rename_shows_as_display_name(self):
        write_meta(self.root, {"sword-1s-aaaa": {"name": "Hero sword"}})
        clips = {c.id: c for c in li.scan_library(self.root)}
        self.assertEqual(clips["sword-1s-aaaa"].display_name, "Hero sword")

    def test_corrupt_meta_is_ignored(self):
        (self.root / li.META_FILENAME).write_text("{not json", encoding="utf-8")
        clips = li.scan_library(self.root)
        self.assertEqual(len(clips), 3)
        self.assertFalse(any(c.meta.favorite for c in clips))

    def test_as_dict_has_no_path_surprises(self):
        clip = li.scan_library(self.root)[0]
        payload = clip.as_dict()
        self.assertEqual(set(payload) >= {"id", "name", "path", "mode", "seconds"}, True)


class SearchClips(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        write_wav(self.root / "sfx" / "Combat" / "General" / "sword-hit-aaaa.wav")
        write_wav(self.root / "sfx" / "Doors" / "General" / "door-slam-bbbb.wav")
        write_wav(self.root / "music" / "Tavern" / "II" / "lute-bed-cccc.wav")
        write_meta(
            self.root,
            {
                "sword-hit-aaaa": {"favorite": True, "rating": 5, "tags": ["metal", "dry"]},
                "door-slam-bbbb": {"rating": 2, "tags": ["wood"]},
                "lute-bed-cccc": {"rejected": True, "rating": 4},
            },
        )
        self.clips = li.scan_library(self.root)

    def tearDown(self):
        self._tmp.cleanup()

    def test_rejected_hidden_by_default(self):
        ids = {c.id for c in li.search_clips(self.clips)}
        self.assertNotIn("lute-bed-cccc", ids)

    def test_rejected_shown_on_request(self):
        ids = {c.id for c in li.search_clips(self.clips, show_rejected=True)}
        self.assertIn("lute-bed-cccc", ids)

    def test_favorites_only(self):
        ids = {c.id for c in li.search_clips(self.clips, favorites_only=True)}
        self.assertEqual(ids, {"sword-hit-aaaa"})

    def test_min_rating(self):
        ids = {c.id for c in li.search_clips(self.clips, min_rating=3)}
        self.assertEqual(ids, {"sword-hit-aaaa"})

    def test_mode_filter(self):
        ids = {c.id for c in li.search_clips(self.clips, mode="music", show_rejected=True)}
        self.assertEqual(ids, {"lute-bed-cccc"})

    def test_tags_match_all_not_any(self):
        both = li.search_clips(self.clips, tags=["metal", "dry"])
        self.assertEqual({c.id for c in both}, {"sword-hit-aaaa"})
        mixed = li.search_clips(self.clips, tags=["metal", "wood"])
        self.assertEqual(mixed, [])

    def test_query_matches_id(self):
        ids = {c.id for c in li.search_clips(self.clips, query="door")}
        self.assertEqual(ids, {"door-slam-bbbb"})

    def test_query_matches_category(self):
        ids = {c.id for c in li.search_clips(self.clips, query="combat")}
        self.assertEqual(ids, {"sword-hit-aaaa"})

    def test_limit_respected(self):
        self.assertEqual(len(li.search_clips(self.clips, limit=1)), 1)

    def test_no_match_is_empty(self):
        self.assertEqual(li.search_clips(self.clips, query="helicopter"), [])


class FindClip(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.wav = self.root / "sfx" / "Combat" / "General" / "sword-1s-aaaa.wav"
        write_wav(self.wav)

    def tearDown(self):
        self._tmp.cleanup()

    def test_by_id(self):
        found = li.find_clip("sword-1s-aaaa", self.root)
        self.assertIsNotNone(found)
        self.assertEqual(found.path, self.wav)

    def test_by_absolute_path(self):
        found = li.find_clip(str(self.wav), self.root)
        self.assertIsNotNone(found)
        self.assertEqual(found.id, "sword-1s-aaaa")

    def test_unknown_id_is_none(self):
        self.assertIsNone(li.find_clip("nope", self.root))

    def test_path_outside_library_refused(self):
        with tempfile.TemporaryDirectory() as other:
            outside = Path(other) / "elsewhere.wav"
            write_wav(outside)
            self.assertIsNone(li.find_clip(str(outside), self.root))

    def test_traversal_in_id_refused(self):
        self.assertIsNone(li.find_clip("../../etc/passwd", self.root))

    def test_found_clip_still_carries_its_prompt(self):
        """find_clip skips INFO during the scan, so it must hydrate the match."""
        worker.embed_wav_info(
            self.wav,
            worker._wav_info_fields(
                "TrackType: SFX, a steel sword draw. Length: 1 second", ["lute"], "sfx"
            ),
        )
        found = li.find_clip("sword-1s-aaaa", self.root)
        self.assertIn("steel sword draw", found.prompt)
        self.assertEqual(found.instruments, ("lute",))


if __name__ == "__main__":
    unittest.main()
