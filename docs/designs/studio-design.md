# Studio (Scroll, Incantation, Altar)

**Problem:** The keeper needs one canvas to Cast, hear, trim, and export a clip without leaving Generate.

**Prototype:** [studio.html](studio.html)

## Layout

Custom titlebar with **Library · Generate · Settings** tabs. Generate: Scroll · Altar · Incantation console. Settings: generated-sounds folder and the error ledger.

Cast is the only primary action. Rites (CFG, negative, seed) stay collapsed.

## States

| State | UI |
|---|---|
| Empty | Blank scroll, starter copy |
| Loading | Sigil + eight rite marks, elapsed time |
| Success | Waveform, gold trim, transport |
| Error | Inline banner, prompt preserved |
