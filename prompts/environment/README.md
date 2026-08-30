# Ambience beds (Stable Audio 3)

Looping **background sound** (not music) for Thunder FX. Open **Browse prompts → Ambience**, or switch Generate to **Ambience**. Prompts stay on `TrackType: SFX` so Medium does not drift into a score.

Shorter FX beds still live in [../fx/environment.md](../fx/environment.md). The six original starter files below (`dungeon`, `nature`, `settlement`, `water`, `weather`, `workshop`) are short 20–60s scene layers and are kept as-is. Everything else in this folder is the **extended ambience library**: 90 categories × 90 prompts each (30 per intensity level), covering seasons, day/night, weather, habitats, human presence, and crafts — see the full category table below.

## Formula

```
TrackType: SFX, <place and sources>, <distance/mic>, steady bed, looping-friendly
```

Negative (paste into Advanced if you generate by hand):

```
music, melody, instrumental, soundtrack, vocals, singing, lyrics, choir, humming, distortion, clipping, muffled, low quality
```

Add `speech, voices` for quiet nature. Leave speech out when you want a crowd. The Human Sounds group below uses a different negative baseline (see that section) since indistinct human vocal texture — murmur, breath, wordless chant — is the point of those categories.

## Intensity (extended library)

Each of the 90 extended categories has three levels, thirty entries each (90 entries per file, 8,100 entries total). Levels are the category's own ladder, not a global loudness knob — the same philosophy as the Instrumental library ([../ambience/README.md](../ambience/README.md)):

| Level | Meaning |
|---|---|
| I | Quietest, sparsest version of this scene — fewer sources, more distant, most "empty" feeling |
| II | The scene in normal full motion — its default, fully-populated state |
| III | The busiest/densest version of that **same** scene — never a different scene. A calm category's III is still calm (the liveliest calm day); Rain III is a monsoon downpour; Smithy III is a full forge with several smiths |

Durations mirror the Instrumental library's range: **Level I 90–380s, Level II 45–330s, Level III 40–380s** (380s is the Stable Audio 3 Medium hard cap).

## Workflow

1. Switch Generate to **Ambience** (seamless loop is on).
2. **Browse prompts → Ambience**, pick a category, **Use** or add to the queue.
3. Listen, then change one axis: weather, crowd density, or room (alley → cavern, square → smithy).

## Starter files (unchanged)

| File | Notes |
|---|---|
| [dungeon.md](dungeon.md) | Built stone corridors, torches, chains |
| [nature.md](nature.md) | General outdoor wildlife and foliage |
| [settlement.md](settlement.md) | General town/street beds |
| [water.md](water.md) | General water beds |
| [weather.md](weather.md) | General mixed weather |
| [workshop.md](workshop.md) | Forge and mill beds |

## Extended library — 90 categories

### Seasons (4) — full cycle

[spring.md](spring.md) · [summer.md](summer.md) · [autumn.md](autumn.md) · [winter.md](winter.md)

### Day & night cycle (8) — full cycle

[dawn.md](dawn.md) · [morning.md](morning.md) · [midday.md](midday.md) · [afternoon.md](afternoon.md) · [dusk.md](dusk.md) · [evening.md](evening.md) · [night.md](night.md) · [midnight.md](midnight.md)

### Weather (10)

[rain.md](rain.md) · [thunderstorm.md](thunderstorm.md) · [wind.md](wind.md) · [snow.md](snow.md) · [blizzard.md](blizzard.md) · [fog-mist.md](fog-mist.md) · [drought-heat.md](drought-heat.md) · [hail.md](hail.md) · [clear-sky-calm.md](clear-sky-calm.md) · [sandstorm-dust-haze.md](sandstorm-dust-haze.md)

Contrast pairs: Rain ↔ Drought & Heat, Snow/Blizzard ↔ Drought & Heat, Clear Sky & Calm ↔ Thunderstorm/Blizzard.

### Habitats (21)

[temperate-forest.md](temperate-forest.md) · [rainforest-jungle.md](rainforest-jungle.md) · [desert.md](desert.md) · [tundra-glacier.md](tundra-glacier.md) · [mountain-peaks.md](mountain-peaks.md) · [cave-cavern.md](cave-cavern.md) · [dungeon-crypt.md](dungeon-crypt.md) · [swamp-wetland.md](swamp-wetland.md) · [grassland-savanna.md](grassland-savanna.md) · [coastal-shore.md](coastal-shore.md) · [open-ocean.md](open-ocean.md) · [underwater-reef.md](underwater-reef.md) · [river.md](river.md) · [lake.md](lake.md) · [waterfall-rapids.md](waterfall-rapids.md) · [volcanic-terrain.md](volcanic-terrain.md) · [canyon-mesa.md](canyon-mesa.md) · [alpine-meadow.md](alpine-meadow.md) · [moorland-heath.md](moorland-heath.md) · [village-town-streets.md](village-town-streets.md) · [ruins-overgrown-temple.md](ruins-overgrown-temple.md)

Contrast pairs: Temperate Forest ↔ Desert, Tundra & Glacier ↔ Rainforest & Jungle, Open Ocean ↔ Underwater Reef, River ↔ Lake, Village & Town Streets ↔ Ruins & Overgrown Temple, Alpine Meadow ↔ Moorland & Heath.

### Human sounds (13)

[whispers-secrets.md](whispers-secrets.md) · [ceremony-prayer.md](ceremony-prayer.md) · [crowd-walla-market.md](crowd-walla-market.md) · [auction-bazaar-haggling.md](auction-bazaar-haggling.md) · [mourning-keening.md](mourning-keening.md) · [festival-celebration.md](festival-celebration.md) · [sleeping-breath-snoring.md](sleeping-breath-snoring.md) · [meditation-breathwork.md](meditation-breathwork.md) · [tavern-murmur.md](tavern-murmur.md) · [campfire-storytelling.md](campfire-storytelling.md) · [children-at-play.md](children-at-play.md) · [marching-procession.md](marching-procession.md) · [war-camp-murmur.md](war-camp-murmur.md)

Contrast pairs: Whispers & Secrets ↔ Crowd Walla & Market/Auction & Bazaar Haggling, Mourning & Keening ↔ Festival & Celebration, Sleeping Breath & Snoring ↔ Children at Play, Meditation & Breathwork ↔ War Camp Murmur.

**Negative baseline for this group** (indistinct human vocal texture is the content, so no blanket `vocals`/`speech, voices` exclusion):
```
music, melody, instrumental, soundtrack, singing, lyrics, choir, distortion, clipping, muffled, low quality, intelligible dialogue, distinct words
```

### Actions & crafts (34)

[footsteps-walking.md](footsteps-walking.md) · [woodcutting-sawmill.md](woodcutting-sawmill.md) · [blacksmith-forge-smithy.md](blacksmith-forge-smithy.md) · [mining-tunnel-digging.md](mining-tunnel-digging.md) · [quarry-stonecutting.md](quarry-stonecutting.md) · [sailing-rowing.md](sailing-rowing.md) · [docks-shipyard.md](docks-shipyard.md) · [farming-plowing.md](farming-plowing.md) · [harvesting-threshing.md](harvesting-threshing.md) · [herding-livestock.md](herding-livestock.md) · [spinning-weaving.md](spinning-weaving.md) · [kitchen-bakery.md](kitchen-bakery.md) · [brewing-distillery.md](brewing-distillery.md) · [butchery-smokehouse.md](butchery-smokehouse.md) · [tannery-leatherwork.md](tannery-leatherwork.md) · [pottery-kiln.md](pottery-kiln.md) · [water-mill-grain.md](water-mill-grain.md) · [construction-masonry.md](construction-masonry.md) · [carpentry-joinery.md](carpentry-joinery.md) · [laundry-washing.md](laundry-washing.md) · [scribing-library.md](scribing-library.md) · [alchemy-apothecary.md](alchemy-apothecary.md) · [glassblowing-furnace.md](glassblowing-furnace.md) · [rope-making-cordage.md](rope-making-cordage.md) · [charcoal-burning.md](charcoal-burning.md) · [beekeeping-apiary.md](beekeeping-apiary.md) · [vineyard-wine-press.md](vineyard-wine-press.md) · [stable-horse-grooming.md](stable-horse-grooming.md) · [caravan-wagon-camp.md](caravan-wagon-camp.md) · [candlemaking-chandlery.md](candlemaking-chandlery.md) · [cheesemaking-dairy.md](cheesemaking-dairy.md) · [fletching-bowyer.md](fletching-bowyer.md) · [jewelcrafting-gem-cutting.md](jewelcrafting-gem-cutting.md) · [ice-harvesting.md](ice-harvesting.md)

Production-chain pairs: Woodcutting & Sawmill → Carpentry & Joinery, Farming & Plowing → Harvesting & Threshing, Mining & Tunnel Digging → Quarry & Stonecutting → Construction & Masonry, Herding & Livestock → Cheesemaking & Dairy/Tannery & Leatherwork.
