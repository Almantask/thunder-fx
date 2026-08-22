# First Watch

**Problem:** A new keeper must accept licenses and confirm the engine before the studio opens.

**Prototype:** [first-watch.html](first-watch.html)

## UX flow

1. Oaths — two checkboxes (Community License, Gemma ToU). Continue disabled until both are checked.
2. Augury — hardware probe. Flavor line + technical disclosure.
3. Scribing — determinate download. Finish opens the studio.

## Layout

Full-screen keep vignette, Cinzel title “Light the brazier”, one card, one primary Continue.

## States

| State | Copy / UI |
|---|---|
| Empty | Welcome + unchecked oaths |
| Loading | “Reading the signs…” / scribing bar |
| Success | Brazier lit, fade to studio |
| Error | In-world one-liner + technical details, Probe again |
