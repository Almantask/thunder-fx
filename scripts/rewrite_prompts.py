#!/usr/bin/env python3
"""Rewrite the shipped prompt catalog into the form Stable Audio 3 was trained on.

Stability's own prompt rewriter (stable_audio_3/interface/reprompt.py) always
emits AudioSparx metadata tags plus a trailing length:

    TrackType: SFX, <description>. Length: N seconds
    TrackType: Music, VocalType: Instrumental, <description>. BPM: N. Length: N seconds

and rejects its own output when the Length suffix is missing or the prompt runs
past 45 words. The catalog predates that, so it carries no Length tag and writes
a bare "instrumental" where the trained control tag is "VocalType: Instrumental".

This applies the same normalize_prompt() the worker runs at generation time, so
the files on disk and the text that actually reaches the model agree. Everything
else in each file -- headings, Duration/Negative/Instruments lines, ordering --
is preserved byte for byte.

    python scripts/rewrite_prompts.py            # rewrite in place
    python scripts/rewrite_prompts.py --check    # report only, change nothing
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "engine"))

from worker import (  # noqa: E402  (path set up above)
    PROMPT_WORD_LIMIT,
    normalize_prompt,
    prompt_word_count,
)

# prompts/ambience holds the *music* library and prompts/environment the
# ambience beds. The naming is historical; promptCatalog.ts maps it the same way.
FOLDER_MODES = {"fx": "sfx", "environment": "ambience", "ambience": "music"}

DURATION_RE = re.compile(r"^-\s*Duration:\s*(\d+(?:\.\d+)?)\s*s\b", re.I)
TRACK_TYPE_LINE_RE = re.compile(r"^\s*TrackType:\s*", re.I)
HEADING_RE = re.compile(r"^###\s+(.*)$")


def rewrite_file(path: Path, mode: str) -> tuple[list[str], int, list[str]]:
    """Return (new lines, entries rewritten, over-long entry titles)."""
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    out: list[str] = []
    changed = 0
    long_prompts: list[str] = []

    title = ""
    duration: float | None = None
    for line in lines:
        heading = HEADING_RE.match(line)
        if heading:
            title = heading.group(1).strip()
            duration = None
            out.append(line)
            continue

        found = DURATION_RE.match(line)
        if found:
            duration = float(found.group(1))
            out.append(line)
            continue

        if TRACK_TYPE_LINE_RE.match(line) and duration is not None:
            newline = "\n" if line.endswith("\n") else ""
            rewritten = normalize_prompt(line.strip(), mode=mode, seconds=duration)
            if prompt_word_count(rewritten) > PROMPT_WORD_LIMIT:
                long_prompts.append(f"{path.relative_to(ROOT)} :: {title}")
            if rewritten != line.strip():
                changed += 1
            out.append(rewritten + newline)
            continue

        out.append(line)

    return out, changed, long_prompts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report what would change without writing anything",
    )
    args = parser.parse_args()

    prompts_dir = ROOT / "prompts"
    total_files = 0
    total_changed = 0
    touched_files = 0
    long_prompts: list[str] = []

    for folder, mode in FOLDER_MODES.items():
        for path in sorted((prompts_dir / folder).glob("*.md")):
            if path.name.lower() == "readme.md":
                continue
            total_files += 1
            new_lines, changed, longs = rewrite_file(path, mode)
            long_prompts.extend(longs)
            if not changed:
                continue
            total_changed += changed
            touched_files += 1
            if not args.check:
                path.write_text("".join(new_lines), encoding="utf-8", newline="\n")

    verb = "would rewrite" if args.check else "rewrote"
    print(f"{total_files} files scanned; {verb} {total_changed} prompts in {touched_files} files")

    if long_prompts:
        # Not rewritten automatically: shortening a prompt is an editorial call,
        # and the model still runs them, just less reliably.
        print(f"\n{len(long_prompts)} prompts run past {PROMPT_WORD_LIMIT} words:")
        for entry in long_prompts[:40]:
            print(f"  {entry}")
        if len(long_prompts) > 40:
            print(f"  ... and {len(long_prompts) - 40} more")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
