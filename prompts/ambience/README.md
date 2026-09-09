# Instrumental prompts (Stable Audio 3)

Instrumental D&D beds adapted from the Sunder Suno style library for **Stable Audio 3 Medium** in Thunder FX. Open **Browse prompts → Instrumental**, or paste a cue into Generate on Instrumental.

Each file is one category. Most categories have three intensity levels (I–III), thirty cues each (90 cues per file). A few theme/recap files are a single set of thirty cues (8,058 cues total across 98 categories).

Every cue leads with a genre prefix, and each category has its own instrument palette, so
the 98 categories offer 98 distinct beds rather than a handful of shared skeletons.

## What changed from Suno

Suno wants a short Style line plus lyric-field tags. Medium wants a `TrackType: Music` prompt and a separate negative field.

| Suno | Stable Audio 3 here |
|---|---|
| Style field only | `TrackType: Music, VocalType: Instrumental, …` |
| `[Instrumental] [No Vocals]` in lyrics | omitted (not a lyric model) |
| Trailing `no vocals, no drums` in the style | moved to **Negative** |
| Exclude styles (pop, EDM, …) | in **Negative** (`speech, pop, EDM, trap, hip hop, rap`) |
| Level I “steady texture with no ending” | replaced by `sustained with no build and no final cadence` |
| Wordless choir / vocalise | left in the prompt; `vocals` / `choir` dropped from that cue's Negative |
| Percussion as an instrument | left in the prompt; `drums` / `percussion` dropped from that cue's Negative |

Durations vary by cue, up to the Stable Audio 3 Medium maximum of **380s** (6m 20s). Longer
clips take more VRAM and time. Level I beds are capped at **300s**, the top of the
cinematic/ambient band in Stability's own rewriter; II and III still reach 380s. Thunder FX
re-derives the length from the slider, so the catalog number is a starting point, not a limit.

| Level | Typical range | Role |
|---|---|---|
| I | 90–300s | Quiet sustained beds for a whole scene |
| II | 45–330s | The mood in motion |
| III | 40–380s | The category at full intensity |
| Single-level themes | 60–380s | Leitmotifs, recap beds, title cues |

## Intensity

Intensity is the category’s own ladder, not a global loudness knob.

| Level | Meaning | Typical prompt extras |
|---|---|---|
| I | Quietest, sparsest, slowest version of the mood | `<genre> bed`, no percussion, `sustained with no build and no final cadence` |
| II | The mood fully stated | `<genre>`, melody and motion, medium energy |
| III | The category at its own peak | `<genre> climax`, densest / fastest version of that same palette |

A calm category’s III is still calm. Boss III is huge; Night III is still night.

## Formula

```
TrackType: Music, VocalType: Instrumental, <genre>, <1-2 moods>, <3-4 instruments>, <place cue>. BPM: N. Length: N seconds
```

`VocalType: Instrumental` is a trained control tag, so unlike the negative prompt it
suppresses vocals at CFG 1 -- which is every preset except Max quality. Tempo moves to a
trailing `BPM: N.` tag. Every cue carries one -- `BPM` is a trained AudioSparx tag, so a
slow bed says `BPM: 45` rather than writing "no perceivable tempo" in prose.

Every prompt ends with `Length: N seconds`, matching the duration on the line
above it. That is the shape Stability's own prompt rewriter emits, and it is what
the model was trained on. Thunder FX re-derives this tag at generation time from
the duration you actually pick, so moving the slider rewrites it rather than
leaving a stale number. Keep prompts under **45 words** -- Stability's rewriter
rejects its own output past that length.


Names stay generic. Do not use other people’s trademarks.

> [!IMPORTANT]
> **Negative prompts do nothing on the Max speed and Balanced presets.** Stable
> Audio 3 Medium is post-trained at CFG 1, and the model's guidance branch only
> runs when `cfg_scale != 1.0` -- so the negative text is never read. The
> `Negative:` lines below are kept because the **Max quality** preset runs the
> un-distilled `medium-base` checkpoint at CFG 7, where they do take effect.
> On the fast presets, steer with the positive prompt instead: `TrackType` and
> `VocalType` are trained control tags and work at CFG 1.

Negative (paste into Advanced if you generate by hand):

```
speech, pop, EDM, trap, hip hop, rap, vocals, singing, lyrics, choir
```

A negative that names a sound the cue itself asks for cancels it out at CFG 7, so those
terms are already removed per cue: `vocals` / `choir` wherever the cue wants wordless choir,
and `drums` / `percussion` wherever it names a percussion instrument. Genre exclusions
(`pop`, `trap`, `EDM`, `speech`) stay put even when the scene prose happens to use the word.

## Workflow

1. Switch Generate to **Instrumental**.
2. **Browse prompts → Instrumental**, pick a category, **Use** or add to the queue.
3. Listen, then change one axis: lead instrument, tempo, or room (glade → cavern, hall → camp).
