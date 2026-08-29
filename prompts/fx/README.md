# Game sound-effect prompts

Copy a prompt into **Generate**, set the **Duration** slider to the suggested length, and paste the **Negative** line into Advanced if you want it. In the app, **Browse prompts → FX** loads this folder. These are starting points for Stable Audio 3 Medium in Thunder FX — generate, listen, then tweak.

The studio default duration is 8 seconds. Most one-shots want much less: UI clicks around 0.5–1s, weapon hits 1–3s. Longer clips waste VRAM and often pad the tail with extra noise. Loop-style beds in [environment.md](environment.md) use 8–15s. Long looping backgrounds live in [../environment](../environment/README.md). Instrumental D&D beds live in [../ambience](../ambience/README.md).

## Formula

Start with `TrackType: SFX` so Medium stays on sound effects instead of music. Then name:

1. **Source** — the object and material (oak door, steel shortsword, wet stone).
2. **Action** — what happens and how long it lasts (latch click, fast decay, slow cautious steps).
3. **Production** — mic, room, and processing (close mic, dry studio, large stone hall).

Example:

```
TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay
```

Names stay generic. Do not use other people's trademarks.

To get a **variation** of a prompt you like, change one axis at a time:

| Axis | Examples |
|---|---|
| Material | oak → iron, leather → canvas, glass → ceramic |
| Room | dry studio → large stone hall, wooden barn, metal corridor, outdoor canyon |
| Mic / distance | close mic → overhead, distant, hydrophone |
| Decay | very fast → short → medium (avoid long tails on one-shots) |
| Action | walk → run → sneak; open → slam; ignition → impact |

Each category file lists a base set, then more takes of the same idea. [flavors.md](flavors.md) is a remix kit: same action, different mic, room, and processing.

Paste one of these onto the end of a prompt when you want a different texture:

| Flavor | Append |
|---|---|
| Dry game one-shot | `close mic, dry studio, fast decay` |
| Big space | `large stone hall, short decay` |
| Vintage | `vintage ribbon mic, analog tape, short decay` |
| Dirty | `close mic, analog distortion, dry studio, fast decay` |
| Distant | `distant overhead mic, outdoor, medium decay` |
| Radio / HUD | `small speaker, band-limited, dry studio, fast decay` |
| Underwater | `hydrophone close, muffled, short decay` |
| Cartoon | `exaggerated, cartoon, dry studio, very fast decay` |

## Negative prompts

Paste into Advanced → Negative prompt. A useful default for one-shots:

```
music, speech, singing
```

Skip rain, wind, or crowd when those would fight the sound you want (for example, a tavern door on a busy night). Environment beds often use `music, speech, singing` only, so weather and space can stay in the mix.

## Categories

| File | Use for |
|---|---|
| [ui.md](ui.md) | Menus, clicks, confirm, error, pause, inventory |
| [combat.md](combat.md) | Melee, firearms, arrows, fists, block and hit |
| [footsteps.md](footsteps.md) | A few steps on stone, wood, grass, metal, water, snow |
| [foley.md](foley.md) | Doors, latches, chests, cloth, glass, coins |
| [items.md](items.md) | Pickups, potions, crafting, reload, books, lockpicks |
| [explosions.md](explosions.md) | Grenades, distant booms, debris, muzzle blast |
| [magic.md](magic.md) | Generic spells: ignition, whoosh, heal, shield, teleport |
| [creatures.md](creatures.md) | Growls, wings, insects, horses, generic beasts |
| [sci-fi.md](sci-fi.md) | Lasers, shields, computers, holograms, airlocks |
| [vehicles.md](vehicles.md) | Car, bike, boat, ship start / idle / stop / crash |
| [environment.md](environment.md) | Rain, wind, fire, cave, forest, city beds (longer) |
| [movement.md](movement.md) | Jump, land, climb, slide, swim, vault, zip |
| [transitions.md](transitions.md) | Whooshes, risers, stingers, reverse, scene hits |
| [water.md](water.md) | Splash, dive, swim stroke, drip, waterfall |
| [weather.md](weather.md) | Thunder, hail, gust, blizzard one-shots |
| [horror.md](horror.md) | Creaks, stingers, heart-thump, distant scrape |
| [flavors.md](flavors.md) | Remix kit: same sound, different production |
| [impacts.md](impacts.md) | Material hits: wood, metal, stone, glass, ice, body |
| [doors.md](doors.md) | Open, close, slam, knock, lock — many door types |
| [mechanisms.md](mechanisms.md) | Levers, gears, plates, elevators, drawbridges |
| [tools.md](tools.md) | Pickaxe, shovel, saw, hammer, mining |
| [fire.md](fire.md) | Torch, ignite, fuse, burn, extinguish |
| [stealth.md](stealth.md) | Bush, hide, detect, floor creak, alert |
| [status.md](status.md) | Burn, freeze, stun, poison, bleed ticks |
| [stylized.md](stylized.md) | Cartoon / punchy indie one-shots |
| [village.md](village.md) | Wells, markets, animals, crafts (no trademarks) |
