#!/usr/bin/env python3
"""Tests for the prompt catalog reader."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

import prompt_catalog as pc  # noqa: E402

SAMPLE = """# Combat

Weapon and hit one-shots. Use a dry studio for HUD-style packs.

### Steel sword draw
- Duration: 1.5s
- Negative: music, speech, singing, rain

TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio. Length: 2 seconds

### Sword swing whoosh
- Duration: 1s
- Negative: music, speech, singing

TrackType: SFX, steel blade cutting air, fast whoosh, close mic, dry studio. Length: 1 second

### Not a prompt at all
Some prose with no duration and no track type.
"""

MUSIC_SAMPLE = """# Tavern

### Tavern revelry (II)
- Duration: 20s
- Instruments: lute, hand drum

TrackType: Music, VocalType: Instrumental, warm tavern lute and hand drum. BPM: 100. Length: 20 seconds
"""


class LibraryFromPath(unittest.TestCase):
    def test_fx_folder_is_fx(self):
        self.assertEqual(pc.library_from_path("prompts/fx/combat.md"), "fx")

    def test_environment_folder_is_ambience(self):
        """The folder names do not match the library ids."""
        self.assertEqual(pc.library_from_path("prompts/environment/forest.md"), "ambience")

    def test_ambience_folder_is_music(self):
        self.assertEqual(pc.library_from_path("prompts/ambience/tavern.md"), "music")

    def test_windows_separators(self):
        self.assertEqual(pc.library_from_path(r"C:\repo\prompts\environment\rain.md"), "ambience")

    def test_unknown_folder_defaults_to_fx(self):
        self.assertEqual(pc.library_from_path("prompts/whatever/x.md"), "fx")


class ParseMarkdown(unittest.TestCase):
    def test_category_name_from_heading(self):
        cat = pc.parse_catalog_markdown("prompts/fx/combat.md", SAMPLE)
        self.assertEqual(cat.name, "Combat")
        self.assertEqual(cat.library, "fx")
        self.assertEqual(cat.id, "fx:combat")

    def test_parses_every_complete_entry(self):
        cat = pc.parse_catalog_markdown("prompts/fx/combat.md", SAMPLE)
        self.assertEqual([e.title for e in cat.entries], ["Steel sword draw", "Sword swing whoosh"])

    def test_skips_entry_without_duration_or_prompt(self):
        cat = pc.parse_catalog_markdown("prompts/fx/combat.md", SAMPLE)
        self.assertNotIn("Not a prompt at all", [e.title for e in cat.entries])

    def test_prompt_kept_verbatim(self):
        cat = pc.parse_catalog_markdown("prompts/fx/combat.md", SAMPLE)
        self.assertTrue(cat.entries[0].prompt.startswith("TrackType: SFX, steel shortsword"))
        self.assertIn("Length: 2 seconds", cat.entries[0].prompt)

    def test_duration_and_negative(self):
        entry = pc.parse_catalog_markdown("prompts/fx/combat.md", SAMPLE).entries[0]
        self.assertEqual(entry.duration, 1.5)
        self.assertEqual(entry.negative, "music, speech, singing, rain")

    def test_entry_ids_are_unique_and_slugged(self):
        cat = pc.parse_catalog_markdown("prompts/fx/combat.md", SAMPLE)
        ids = [e.id for e in cat.entries]
        self.assertEqual(ids[0], "fx:combat:steel-sword-draw")
        self.assertEqual(len(ids), len(set(ids)))

    def test_intensity_from_title(self):
        entry = pc.parse_catalog_markdown("prompts/ambience/tavern.md", MUSIC_SAMPLE).entries[0]
        self.assertEqual(entry.intensity, "II")

    def test_instruments_only_for_music(self):
        music = pc.parse_catalog_markdown("prompts/ambience/tavern.md", MUSIC_SAMPLE).entries[0]
        self.assertEqual(music.instruments, ("lute", "hand drum"))
        fx = pc.parse_catalog_markdown("prompts/fx/combat.md", SAMPLE).entries[0]
        self.assertEqual(fx.instruments, ())

    def test_duration_is_clamped_to_engine_range(self):
        md = SAMPLE.replace("Duration: 1.5s", "Duration: 9000s")
        entry = pc.parse_catalog_markdown("prompts/fx/combat.md", md).entries[0]
        self.assertEqual(entry.duration, pc.MAX_SECONDS)

    def test_as_dict_reports_negative_as_unused(self):
        entry = pc.parse_catalog_markdown("prompts/fx/combat.md", SAMPLE).entries[0]
        payload = entry.as_dict()
        self.assertIn("negative_unused", payload)
        self.assertNotIn("negative", payload)


class LoadCatalog(unittest.TestCase):
    def test_skips_readme_and_empty_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "fx").mkdir()
            (root / "fx" / "README.md").write_text("# Readme\n\nnothing here\n", encoding="utf-8")
            (root / "fx" / "combat.md").write_text(SAMPLE, encoding="utf-8")
            cats = pc.load_catalog(root)
        self.assertEqual([c.name for c in cats], ["Combat"])

    def test_sorted_by_library_then_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for folder in ("fx", "environment", "ambience"):
                (root / folder).mkdir()
            (root / "ambience" / "tavern.md").write_text(MUSIC_SAMPLE, encoding="utf-8")
            (root / "environment" / "rain.md").write_text(
                SAMPLE.replace("# Combat", "# Rain"), encoding="utf-8"
            )
            (root / "fx" / "combat.md").write_text(SAMPLE, encoding="utf-8")
            cats = pc.load_catalog(root)
        self.assertEqual([c.library for c in cats], ["fx", "ambience", "music"])

    def test_missing_root_is_empty_not_an_error(self):
        self.assertEqual(pc.load_catalog(Path("no-such-dir-anywhere")), [])

    def test_real_shipped_catalog_parses(self):
        """Guards against a catalog edit that silently drops entries."""
        cats = pc.load_catalog()
        if not cats:
            self.skipTest("prompts/ not present")
        self.assertGreater(len(cats), 3)
        self.assertGreater(len(pc.all_entries(cats)), 50)
        self.assertEqual(
            sorted({c.library for c in cats}), ["ambience", "fx", "music"]
        )
        for entry in pc.all_entries(cats):
            with self.subTest(entry=entry.id):
                self.assertRegex(entry.prompt, r"(?i)^TrackType:")
                self.assertGreaterEqual(entry.duration, pc.MIN_SECONDS)
                self.assertLessEqual(entry.duration, pc.MAX_SECONDS)


class Search(unittest.TestCase):
    def setUp(self):
        self.cats = [
            pc.parse_catalog_markdown("prompts/fx/combat.md", SAMPLE),
            pc.parse_catalog_markdown("prompts/ambience/tavern.md", MUSIC_SAMPLE),
        ]

    def test_title_hit_outranks_body_hit(self):
        hits = pc.search("whoosh", categories=self.cats)
        self.assertEqual(hits[0].title, "Sword swing whoosh")

    def test_filters_by_library(self):
        hits = pc.search("", library="music", categories=self.cats)
        self.assertEqual([h.library for h in hits], ["music"])

    def test_respects_limit(self):
        hits = pc.search("sword", limit=1, categories=self.cats)
        self.assertEqual(len(hits), 1)

    def test_no_match_is_empty(self):
        self.assertEqual(pc.search("helicopter", categories=self.cats), [])

    def test_matches_prompt_body_not_just_title(self):
        hits = pc.search("scabbard", categories=self.cats)
        self.assertEqual(hits[0].title, "Steel sword draw")

    def test_empty_query_returns_catalog_order(self):
        hits = pc.search("   ", categories=self.cats)
        self.assertEqual(len(hits), 3)


if __name__ == "__main__":
    unittest.main()
