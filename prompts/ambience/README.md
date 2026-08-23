# Ambience prompts (Stable Audio 3)

Instrumental D&D beds adapted from the Sunder Suno style library for **Stable Audio 3 Medium** in Thunder FX. Open **Browse prompts → Ambience**, or paste a cue into Generate on Instrumental.

Each file is one category. Most categories have three intensity levels (I–III), thirty cues each (90 cues per file). A few theme/recap files are a single set of thirty cues (6,960 cues total across 84 categories).

## What changed from Suno

Suno wants a short Style line plus lyric-field tags. Medium wants a `TrackType: Music` prompt and a separate negative field.

| Suno | Stable Audio 3 here |
|---|---|
| Style field only | `TrackType: Music, instrumental, …` |
| `[Instrumental] [No Vocals]` in lyrics | omitted (not a lyric model) |
| Trailing `no vocals, no drums` in the style | moved to **Negative** |
| Exclude styles (pop, EDM, …) | in **Negative** (`speech, pop, EDM, trap, hip hop, rap`) |
| Level I “steady texture with no ending” | kept, plus `looping-friendly` |
| Wordless choir / vocalise | left in the prompt; negative is `lyrics, singing` (not `vocals` / `choir`) |
| Percussion as an instrument | left in the prompt; drums stay out of Negative |

Durations vary by cue, up to the Stable Audio 3 Medium maximum of **380s** (6m 20s). Longer clips take more VRAM and time.

| Level | Typical range | Role |
|---|---|---|
| I | 90–380s | Quiet looping beds for a whole scene |
| II | 45–330s | The mood in motion |
| III | 40–380s | The category at full intensity |
| Single-level themes | 60–380s | Leitmotifs, recap beds, title cues |

## Intensity

Intensity is the category’s own ladder, not a global loudness knob.

| Level | Meaning | Typical prompt extras |
|---|---|---|
| I | Quietest, sparsest, slowest version of the mood | `looping-friendly`, `steady texture with no ending` |
| II | The mood fully stated | melody and motion, medium energy |
| III | The category at its own peak | densest / fastest version of that same palette |

A calm category’s III is still calm. Boss III is huge; Night III is still night.

## Formula

```
TrackType: Music, instrumental, <scene/genre>, <1–2 moods>, <2–3 instruments>, <tempo>, <place cue>, looping-friendly
```

Names stay generic. Do not use other people’s trademarks.

Negative (paste into Advanced if you generate by hand):

```
speech, pop, EDM, trap, hip hop, rap, vocals, singing, lyrics, choir
```

Drop `vocals` / `choir` when the cue asks for wordless choir. Drop `drums` / `percussion` when the cue is a march, fight, or feast with rhythm.

## Workflow

1. Switch Generate to **Instrumental**.
2. **Browse prompts → Ambience**, pick a category, **Use** or add to the queue.
3. Listen, then change one axis: lead instrument, tempo, or room (glade → cavern, hall → camp).
