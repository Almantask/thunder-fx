# Studio (Scroll, Incantation, Altar)

**Problem:** The keeper needs one canvas to Cast, hear, trim, and export a clip without leaving Generate.

**Prototype:** [studio.html](studio.html)

## Layout

Custom titlebar with **Library · Generate · Settings** tabs. Generate: Scroll · Altar · Incantation console. Settings: generated-sounds folder and the error ledger.

Cast is the only primary action for making a clip. **Load model** is a separate control: it puts Medium into VRAM. Generate does not include that wait. Rites (CFG, negative, seed) stay collapsed.

Generate mode is a three-option control beside **Browse prompts** and **Generate queue**: **Sound effects** (default), **Ambience**, and **Instrumental**. All three use Stable Audio 3 Medium. Sound effects and Ambience send `TrackType: SFX`; Instrumental sends `TrackType: Music` and a vocals-avoiding negative. Ambience defaults toward 30s with seamless loop on; Instrumental defaults toward 20s with loop on. Music WAVs embed named instruments in RIFF INFO (`IKEY` / `ICMT`) so exports keep the tags.

**Browse prompts** opens the shipped markdown. Filter **FX** (`prompts/fx`), **Ambience** (`prompts/environment`), or **Instrumental** (`prompts/ambience`). Each effect has **Preview** (full prompt text) and **Use** (fills Prompt, Duration, and Negative). The keeper can also check effects or add a whole category onto a generate queue. **Generate queue** runs those items in order; each clip is saved to the library. Cancel stops the current item and leaves the rest queued. After a successful load or generate on this machine, **Load model**, **Generate**, and **Generate queue** show a `~m:ss` estimate. The waveform clock adds estimated remaining while work is in progress.

**Generate 4 takes** runs the same prompt on four random seeds and opens a 2×2 keep/discard grid.

Preview (Altar) can **Auto-trim silence**, export **44.1/48 kHz**, **16/24-bit**, **mono**, **WAV / FLAC / MP3 / OGG**, and optionally build a **seamless loop** with a 0.5–3s equal-power crossfade.

The titlebar shows live **VRAM** (used / total). Settings **Precision** is FP32 (default) or FP16/BF16 low-VRAM; unload and load the model to apply it.

## States

| State | UI |
|---|---|
| Empty | Blank scroll, starter copy matching the selected mode |
| Model not loaded | **Load model** enabled, with a `~m:ss` estimate after a past load; Generate unavailable until Medium is in VRAM |
| Model load | Waveform bar named model load; elapsed and estimated remaining; Load model shows Cancel; Generate unavailable |
| Model loaded | **Unload model** enabled to free VRAM; Generate enabled |
| Generating | Eight rite marks, elapsed clock, estimated remaining, generation progress bar, Cancel |
| Four takes | 2×2 audition grid; Keep stays in the library, Discard deletes the rest |
| Queue | Browse prompts dialog; queue list with Remove and per-item time estimates; Generate queue shows a total `~m:ss` and runs items in order |
| Success | Waveform, gold trim, transport |
| Error | Inline banner, prompt preserved |
