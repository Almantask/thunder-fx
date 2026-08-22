# Studio (Scroll, Incantation, Altar)

**Problem:** The keeper needs one canvas to Cast, hear, trim, and export a clip without leaving the keep.

**Prototype:** [studio.html](studio.html)

## Layout

Custom titlebar · Grimoire rail · Scroll · Altar · Incantation console.

Cast is the only primary action. Rites (CFG, negative, seed) stay collapsed.

## States

| State | UI |
|---|---|
| Empty | Blank scroll, starter copy |
| Loading | Sigil + eight rite marks, elapsed time |
| Success | Waveform, gold trim, transport |
| Error | Inline banner, prompt preserved |
