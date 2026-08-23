# Studio (Scroll, Incantation, Altar)

**Problem:** The keeper needs one canvas to Cast, hear, trim, and export a clip without leaving Generate.

**Prototype:** [studio.html](studio.html)

## Layout

Custom titlebar with **Library · Generate · Settings** tabs. Generate: Scroll · Altar · Incantation console. Settings: generated-sounds folder and the error ledger.

Cast is the only primary action for making a clip. **Load model** is a separate control: it puts Medium into VRAM. Generate does not include that wait. Rites (CFG, negative, seed) stay collapsed.

Generate mode is a two-option control beside **Browse prompts** and **Generate queue**: **Sound effects** (default) and **Instrumental**. Both use Stable Audio 3 Medium. Instrumental switches placeholder, TrackType, and a vocals-avoiding negative prompt. Duration stays 0.5–380s (instrumental defaults toward 20s). Music WAVs embed named instruments in RIFF INFO (`IKEY` / `ICMT`) so exports keep the tags.

**Browse prompts** opens the shipped markdown. Filter **FX** (`prompts/fx`) or **Ambience** (`prompts/ambience`). Each effect has **Preview** (full prompt text) and **Use** (fills Prompt, Duration, and Negative). The keeper can also check effects or add a whole category onto a generate queue. **Generate queue** runs those items in order; each clip is saved to the library. Cancel stops the current item and leaves the rest queued. After a successful load or generate on this machine, **Load model**, **Generate**, and **Generate queue** show a `~m:ss` estimate. The waveform clock adds estimated remaining while work is in progress.

## States

| State | UI |
|---|---|
| Empty | Blank scroll, starter copy matching the selected mode |
| Model not loaded | **Load model** enabled, with a `~m:ss` estimate after a past load; Generate unavailable until Medium is in VRAM |
| Model load | Waveform bar named model load; elapsed and estimated remaining; Load model shows Loading model…; Generate unavailable |
| Generating | Eight rite marks, elapsed clock, estimated remaining, generation progress bar, Cancel |
| Queue | Browse prompts dialog; queue list with Remove and per-item time estimates; Generate queue shows a total `~m:ss` and runs items in order |
| Success | Waveform, gold trim, transport |
| Error | Inline banner, prompt preserved |
