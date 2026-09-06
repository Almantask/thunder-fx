# Prompt catalog

Shipped starting prompts for **Browse prompts** on Generate. Three libraries:

- [Sound effects](fx/README.md) — game one-shots (`TrackType: SFX`)
- [Ambience](environment/README.md) — looping background beds (`TrackType: SFX`, no music)
- [Instrumental](ambience/README.md) — D&D music beds (`TrackType: Music`), adapted from Sunder for Stable Audio 3 Medium

The Browse prompts dialog lists each library separately so Combat sound effects, rain beds, and Combat music stay distinct.

## Format

Every prompt is stored in the shape Stable Audio 3 was trained on, the same one Stability's own
prompt rewriter emits:

```
TrackType: SFX, <description>. Length: N seconds
TrackType: Music, VocalType: Instrumental, <description>. BPM: N. Length: N seconds
```

The engine re-derives the `Length:` tag from the duration you actually pick, so moving the
slider rewrites it rather than leaving a stale number. `VocalType: Instrumental` is a trained
control tag and works at CFG 1 — unlike the `Negative:` lines, which only take effect on the
**Max quality** preset. Keep prompts under 45 words.

`python scripts/rewrite_prompts.py --check` reports anything that has drifted out of format.
