# Grimoire

**Problem:** Past incantations must stay one click away on the Library tab.

**Prototype:** [grimoire.html](grimoire.html)

## Layout

Library tab. Search. Play/pause button plays visible sounds in sequence. Newest first in a card grid. Cards show a short **prompt name**, not the full prompt, with individual play/pause controls. Opening a clip loads Generate, where the full prompt is visible. Empty: three starter cards for the current generate mode (sound effects, ambience, or instrumental). Browse radios: **Sounds · Ambience · Instrumental**. Choosing a page opens Generate and matches that mode.

Checkboxes select clips for **Export pack**: a naming template (`{type}_{category}_{name}_{index}`), format, optional ZIP, and `manifest.json`.

## States

| State | UI |
|---|---|
| Empty | Starter cards |
| Loading | Skeleton rows |
| Success | Clip list |
| Error | Couldn’t open Grimoire + retry |
