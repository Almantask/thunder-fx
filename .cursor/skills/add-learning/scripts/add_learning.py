#!/usr/bin/env python3
"""Helper script to append a dated entry to learnings.md."""

from __future__ import annotations

import argparse
import datetime
from pathlib import Path


def find_repo_root() -> Path:
    current = Path(__file__).resolve().parent
    while current.parent != current:
        if (current / ".git").exists() or (current / "learnings.md").exists():
            return current
        current = current.parent
    return Path.cwd()


def add_learning(entry: str, date_str: str | None = None) -> None:
    repo_root = find_repo_root()
    learnings_path = repo_root / "learnings.md"

    if not date_str:
        date_str = datetime.date.today().strftime("%Y-%m-%d")

    header = f"## {date_str}"
    bullet = entry.strip()
    if not bullet.startswith("- "):
        bullet = f"- {bullet}"

    if not learnings_path.exists():
        content = f"# Learnings & Insights Journal\n\n" f"A continuous journal of learnings, prompt engineering breakthroughs, model behaviors, audio generation techniques, and sound design observations for Thunder FX.\n\n---\n\n" f"{header}\n\n{bullet}\n"
        learnings_path.write_text(content, encoding="utf-8")
        print(f"Created {learnings_path} with entry under {header}")
        return

    text = learnings_path.read_text(encoding="utf-8")

    if header in text:
        # Find where to insert under existing header
        lines = text.splitlines()
        new_lines = []
        inserted = False
        for i, line in enumerate(lines):
            new_lines.append(line)
            if line.strip() == header and not inserted:
                # Find after any blank line or next bullets
                # Insert right after the header
                new_lines.append("")
                new_lines.append(bullet)
                inserted = True
        new_text = "\n".join(new_lines).rstrip() + "\n"
    else:
        new_text = text.rstrip() + f"\n\n---\n\n{header}\n\n{bullet}\n"

    learnings_path.write_text(new_text, encoding="utf-8")
    print(f"Appended learning to {learnings_path} under {header}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Add a dated entry to learnings.md")
    parser.add_argument("entry", help="Learning entry content")
    parser.add_argument("--date", help="Date in YYYY-MM-DD format (defaults to today)", default=None)
    args = parser.parse_args()
    add_learning(args.entry, args.date)


if __name__ == "__main__":
    main()
