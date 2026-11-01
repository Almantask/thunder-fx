#!/usr/bin/env python3
"""Reader for the shipped prompt catalog under `prompts/`.

A Python port of the parsing half of `src/lib/promptCatalog.ts`, so the MCP
server can hand a client the same curated prompts the Browse prompts dialog
shows. The catalog matters because every entry is stored in the exact shape
Stable Audio 3 was trained on -- a client reusing that wording gets better
takes than one inventing prose.

Only the explicit `- Instruments:` line is read. The TS side also mines
instruments out of the prompt text and infers a subcategory, both of which
live in other frontend modules; neither is needed to hand a prompt back.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

# Library ids, in the order the UI lists them.
LIBRARIES = ("fx", "ambience", "music")

# The folder names do not match the library ids. `prompts/environment` holds the
# ambience beds and `prompts/ambience` holds the instrumental ones -- a historical
# layout the frontend already works around in `libraryFromPath`, and getting it
# wrong here would silently serve music when a caller asked for ambience.
_FOLDER_TO_LIBRARY = {
    "environment": "ambience",
    "ambience": "music",
    "music": "music",
    "fx": "fx",
}

_DURATION_RE = re.compile(r"duration:\s*(\d+(?:\.\d+)?)\s*s\b", re.I)
_NEGATIVE_RE = re.compile(r"negative:\s*(.+)$", re.I | re.M)
_INSTRUMENTS_RE = re.compile(r"instruments:\s*(.+)$", re.I | re.M)
_TRACK_TYPE_RE = re.compile(r"^\s*TrackType:\s*.+", re.I | re.M)
_HEADING_RE = re.compile(r"^#\s+(.+)$", re.M)
_INTENSITY_RE = re.compile(r"\((I{1,3}|IV|V)\)", re.I)
_EFFECT_SPLIT_RE = re.compile(r"^### ", re.M)

# Mirrors MIN_SECONDS / MAX_SECONDS in worker.py. Duplicated rather than imported
# because importing worker.py pulls in its module-level state and native preloads.
MIN_SECONDS = 0.5
MAX_SECONDS = 380.0


def clamp_seconds(seconds: float) -> float:
    return max(MIN_SECONDS, min(MAX_SECONDS, float(seconds)))


def slugify(value: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


@dataclass(frozen=True)
class CatalogEntry:
    """One prompt from the catalog."""

    id: str
    library: str
    category: str
    title: str
    prompt: str
    duration: float
    negative: str = ""
    intensity: str | None = None
    instruments: tuple[str, ...] = ()

    def as_dict(self) -> dict:
        out = {
            "id": self.id,
            "library": self.library,
            "category": self.category,
            "title": self.title,
            "prompt": self.prompt,
            "suggested_seconds": self.duration,
        }
        if self.negative:
            # Reported for completeness, but the MCP generate tools never send a
            # negative prompt: the fast presets run at CFG 1, where the model has
            # no guidance branch to apply it with.
            out["negative_unused"] = self.negative
        if self.intensity:
            out["intensity"] = self.intensity
        if self.instruments:
            out["instruments"] = list(self.instruments)
        return out


@dataclass(frozen=True)
class CatalogCategory:
    id: str
    library: str
    name: str
    entries: list[CatalogEntry] = field(default_factory=list)


def library_from_path(path: Path | str) -> str:
    """Which library a catalog file belongs to, from its parent folder."""
    parts = [p for p in str(path).replace("\\", "/").split("/") if p]
    parent = parts[-2].lower() if len(parts) >= 2 else ""
    return _FOLDER_TO_LIBRARY.get(parent, "fx")


def _category_slug(path: Path | str) -> str:
    return Path(str(path)).stem.lower()


def _parse_duration(body: str) -> float | None:
    match = _DURATION_RE.search(body)
    if not match:
        return None
    try:
        seconds = float(match.group(1))
    except ValueError:
        return None
    if seconds <= 0:
        return None
    return clamp_seconds(seconds)


def _parse_instruments(body: str) -> tuple[str, ...]:
    match = _INSTRUMENTS_RE.search(body)
    if not match:
        return ()
    names = [part.strip() for part in re.split(r"[,/]", match.group(1))]
    return tuple(name for name in names if name)


def parse_catalog_markdown(path: Path | str, markdown: str) -> CatalogCategory:
    """Parse one catalog markdown file into a category and its entries."""
    library = library_from_path(path)
    slug = _category_slug(path)
    cat_id = f"{library}:{slug}"
    heading = _HEADING_RE.search(markdown)
    name = heading.group(1).strip() if heading and heading.group(1).strip() else slug
    entries: list[CatalogEntry] = []
    for chunk in _EFFECT_SPLIT_RE.split(markdown)[1:]:
        head, _, body = chunk.partition("\n")
        title = head.strip()
        duration = _parse_duration(body)
        prompt_match = _TRACK_TYPE_RE.search(body)
        prompt = prompt_match.group(0).strip() if prompt_match else ""
        # An entry without all three is a prose section, not a prompt.
        if not title or duration is None or not prompt:
            continue
        negative_match = _NEGATIVE_RE.search(body)
        intensity_match = _INTENSITY_RE.search(title)
        entries.append(
            CatalogEntry(
                id=f"{cat_id}:{slugify(title)}",
                library=library,
                category=name,
                title=title,
                prompt=prompt,
                duration=duration,
                negative=negative_match.group(1).strip() if negative_match else "",
                intensity=intensity_match.group(1).upper() if intensity_match else None,
                instruments=_parse_instruments(body) if library == "music" else (),
            )
        )
    return CatalogCategory(id=cat_id, library=library, name=name, entries=entries)


def prompts_dir() -> Path:
    """The repo's `prompts/` folder, as sibling of `engine/`."""
    return Path(__file__).resolve().parent.parent / "prompts"


def load_catalog(root: Path | None = None) -> list[CatalogCategory]:
    """Every catalog category, ordered by library then category name."""
    base = Path(root) if root is not None else prompts_dir()
    if not base.is_dir():
        return []
    categories: list[CatalogCategory] = []
    for path in sorted(base.rglob("*.md")):
        if path.stem.lower() == "readme":
            continue
        category = parse_catalog_markdown(path, path.read_text(encoding="utf-8"))
        if not category.entries:
            continue
        categories.append(category)
    categories.sort(key=lambda c: (LIBRARIES.index(c.library), c.name.lower()))
    return categories


@lru_cache(maxsize=1)
def cached_catalog() -> tuple[CatalogCategory, ...]:
    return tuple(load_catalog())


def all_entries(categories: list[CatalogCategory] | None = None) -> list[CatalogEntry]:
    cats = categories if categories is not None else list(cached_catalog())
    return [entry for cat in cats for entry in cat.entries]


def search(
    query: str,
    *,
    library: str | None = None,
    limit: int = 20,
    categories: list[CatalogCategory] | None = None,
) -> list[CatalogEntry]:
    """Catalog entries matching `query`, best first.

    Scored rather than filtered so a one-word query lands the obvious entry at
    the top: a title hit outranks a prompt-body hit, and a whole-phrase hit
    outranks scattered terms.
    """
    entries = all_entries(categories)
    if library:
        entries = [e for e in entries if e.library == library]
    needle = query.strip().lower()
    if not needle:
        return entries[: max(0, limit)]
    terms = [t for t in re.split(r"\s+", needle) if t]
    scored: list[tuple[int, int, CatalogEntry]] = []
    for index, entry in enumerate(entries):
        title = entry.title.lower()
        haystack = f"{title} {entry.category.lower()} {entry.prompt.lower()}"
        score = 0
        if needle in title:
            score += 100
        if needle in haystack:
            score += 40
        for term in terms:
            if term in title:
                score += 10
            elif term in haystack:
                score += 3
        if score:
            # index keeps the catalog's own order stable among equal scores.
            scored.append((-score, index, entry))
    scored.sort()
    return [entry for _, _, entry in scored[: max(0, limit)]]
