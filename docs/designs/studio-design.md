# Studio (Scroll, Incantation, Altar)

**Problem:** The keeper needs one canvas to Cast, hear, trim, and export a clip without leaving Generate.

**Prototype:** [studio.html](studio.html)

## Layout

Custom titlebar with **Library · Generate · Settings** tabs. Generate: Scroll · Altar · Incantation console. Settings: generated-sounds folder and the error ledger.

Cast is the only primary action for making a clip. **Load model** is a separate control: it puts Medium into VRAM. Generate does not include that wait. Rites (CFG, negative, seed) stay collapsed.

Generate mode is a two-option control above the prompt shortcuts: **Sound effects** (default) and **Instrumental**. Both use Stable Audio 3 Medium. Instrumental switches chips, placeholder, TrackType, and a vocals-avoiding negative prompt. Duration stays 0.5–380s (instrumental defaults toward 20s). Music WAVs embed named instruments in RIFF INFO (`IKEY` / `ICMT`) so exports keep the tags.

**Prompt catalog** opens the shipped `prompts/` markdown pack. The keeper checks effects (or adds a whole category) onto a generate queue, or **Use** fills Prompt, Duration, and Negative for a single effect. **Generate queue** runs those items in order; each clip is saved to the library. Cancel stops the current item and leaves the rest queued.

## States

| State | UI |
|---|---|
| Empty | Blank scroll, starter copy matching the selected mode |
| Model not loaded | **Load model** enabled; Generate unavailable until Medium is in VRAM |
| Model load | Waveform bar named model load; Load model shows Loading model…; Generate unavailable |
| Generating | Eight rite marks, elapsed clock, generation progress bar, Cancel |
| Queue | Catalog dialog; queue list with Remove; Generate queue runs items in order |
| Success | Waveform, gold trim, transport |
| Error | Inline banner, prompt preserved |
