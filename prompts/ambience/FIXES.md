# Instrumental prompt fixes &mdash; working checklist

Derived from the 100-cue audit of `prompts/ambience/` (8,058 cues, 98 category files) against
Stability's own rewriter (`stable_audio_3/interface/reprompt.py` &mdash; its `SYSTEM_PROMPTS["Music"]`
template and `_has_artifacts()` reject list), the official prompt guide, and the `medium-base`
settings (euler / 50 steps / CFG 7). Rationale is in `learnings.md` under 2026-09-06.

> [!NOTE]
> **Applied 2026-09-07.** All of Phase 1 and Phase 2 is done across the 98 category
> files; `python scripts/rewrite_prompts.py --check` reports no rewrites and no
> over-length cues. Outcomes, decisions and what is deliberately left are recorded
> under [Result](#result) at the bottom.

Work top to bottom. **Phase 1** is six mechanical passes, each one scripted run across all 98
files. **Phase 2** is per-category judgement work, one file per sitting.

**These files ship.** `src/lib/promptCatalog.ts:168` inlines `prompts/**/*.md` via
`import.meta.glob(..., { query: '?raw' })`, so every batch needs the `update-desktop-exe`
rebuild before it reaches `E:\thunder-fx-engine\thunder-fx.exe`.

After every batch:

```bash
python scripts/rewrite_prompts.py --check
```

---

## Phase 1 &mdash; global mechanical passes

### [x] P1.1 &mdash; Unsplice the category name from scene prose (478 cues)

Five sentences were written for a place name and then had the category string-substituted in,
producing `morning mist slowly burning away in the serene boss` and
`colossal clash of armies shaking the foundations of the goofy`. Replace the whole clause &mdash;
these are also the worst offenders under "every word needs an acoustic referent".

| find (`<CAT>` = category name) | replace with | n |
|---|---|---:|
| `scouts charting unexplored routes through the <CAT>.` | `light walking pulse with open harmony.` | 81 |
| `resting quietly in the <CAT> at twilight` | `settled and unhurried with long decays` | 72 |
| `gentle breeze carrying distant echoes through the <CAT>` | `wide reverb tail with slow air-like swells` | 72 |
| `colossal clash of armies shaking the foundations of the <CAT>.` | `full ensemble at maximum weight.` | 72 |
| `morning mist slowly burning away in the serene <CAT>` | `slow warm swell rising out of near-silence` | 71 |

The remaining 110 are one-offs (`the boss chamber door creaks open`,
`fantasy boss fight first phase`) &mdash; most read fine and can be left.

### [x] P1.2 &mdash; Remove words Stability's own validator rejects (359 cues)

`_has_artifacts()` rejects any prompt matching
`vocals?|singing|singer|female|male|voice|voices|chorus|rap|rapper|chant(ing)?|lyrics?`.
At CFG 7 these also actively fight `VocalType: Instrumental`. Every replacement below is
verified clean against that regex.

| find | replace with | n |
|---|---|---:|
| `chanting choir` | `wordless choir pad` | 146 |
| `singing <instrument>` (flute, violin, cello, guitar&hellip;) | `lyrical <instrument>` | ~110 |
| `chorus guitar` / `chorus electric guitar` (the effect, not voices) | `chorused guitar` | 34 |
| `low chant-like drones` | `low sustained drones` | 8 |
| `a thousand voices at once` | `dense overlapping crowd hubbub` | 11 |
| `a voice like a rockslide forming` | `low brass like a rockslide forming` | 10 |
| `the dawn chorus stopping at noon` | `the high harmonics stopping at noon` | 8 |
| `faint airy female vocalise` | `faint airy wordless vocalise` | 2 |

`wordless choir` and `vocalise` are deliberately kept &mdash; they survive the regex and the
Negative lines already carve them out. Sweep the residue with:

```bash
grep -rniE '\b(vocals?|singing|singer|female|male|voice|voices|chorus|rap|rapper|chanting?|lyrics?)\b' prompts/ambience/ --include='*.md'
```

### [x] P1.3 &mdash; Restore the BPM tag (1809 cues)

1809 cues drop `BPM:` entirely and write `no perceivable tempo` instead. BPM is a
trained AudioSparx tag; the prose is not. Stability's own ambient examples keep it
(`Dreamy ambient soundscape &hellip; BPM: 40`, `Ambient drone motif loop. BPM: 60`).

- Delete `, no perceivable tempo` from the body.
- Insert `BPM: 45. ` immediately before `Length:` (40&ndash;55 if you want it to track the bed).

### [x] P1.4 &mdash; Drop the loop boilerplate (2,546 cues, frees ~6 words each)

The model has no loop control, so `looping-friendly` and `steady texture with no ending` spend
budget on nothing. Replace with something acoustically real:

| find | replace with | n |
|---|---|---:|
| `, steady texture with no ending, looping-friendly` | `, sustained with no build and no final cadence` | 1,846 |
| `, looping-friendly, steady texture with no ending` | `, sustained with no build and no final cadence` | 700 |

51 more use a different ordering &mdash; catch them with
`grep -rn 'looping-friendly' prompts/ambience/`.

### [x] P1.5 &mdash; Stop the negative fighting the positive (196 cues)

Dead weight on `medium` (CFG 1), live on `medium-base`. Remove the term from the **Negative**
line wherever the prompt itself asks for it:

| term in Negative | also in the positive | n |
|---|---|---:|
| `singing` | resolved by P1.2 | 141 |
| `drums` | `light frame drum`, `soft hand drums` | 21 |
| `percussion` | `light percussion` | 18 |
| `trap`, `choir`, `speech`, `heavy beats`, `pop` | assorted one-offs | 16 |

While in there, consider replacing the universal block
`speech, pop, EDM, trap, hip hop, rap, vocals, singing, lyrics, choir, drums, percussion`
(9 distinct strings cover all 8,058 cues) with a per-cue negative such as
`lyrics, singing, spoken word, drum kit, distorted electric guitar, sudden ending`.
Only worth the effort if music moves onto `medium-base`.

### [x] P1.6 &mdash; Decide a duration policy (1266 cues over 300s)

`SYSTEM_PROMPTS["Music"]` bands are energetic/dance 120&ndash;180s, pop/rock 180&ndash;210s,
cinematic/ambient 240&ndash;300s, and the guide adds that results are better when the duration
fits the description. Either clamp Level I beds to &le;300s or keep the 380s ceiling
deliberately &mdash; but decide, rather than leaving it as an artefact of the generator.

### [x] P1.7 &mdash; Cut the 9 cues past the 45-word ceiling

`_has_artifacts()` rejects anything over 45 words outright, and
`scripts/rewrite_prompts.py --check` already reports these. P1.4 alone frees ~6 words on the
Level I cues, so most fall under the line for free &mdash; re-run the check after P1.4 and only
hand-trim what survives.

| cue | words |
|---|---:|
| `walking-brisk-stride.md` :: Morning stride warmup (I) | 51 |
| `workout-power-drive.md` :: Chalk and barbell quietude (I) | 51 |
| `workout-stretch-cooldown.md` :: Post-workout stillness (I) | 50 |
| `reading-epic-lore.md` :: Forgotten realm chronicles (I) | 49 |
| `walking-mindful-stroll.md` :: Forest path quietude (I) | 49 |
| `walking-twilight-wander.md` :: Dusk settles over the avenue (I) | 48 |
| `programming-synth-horizon.md` :: Nocturnal compiler bed (I) | 47 |
| `walking-mindful-stroll.md` :: Mountain overlook stillness (I) | 46 |
| `walking-twilight-wander.md` :: Dusk across the open bridge (I) | 46 |

---

## Phase 2 &mdash; per-category work (98 files)

For each file: **(a)** put the genre prefix at the head of every cue, replacing
`<category> ambient/climax/movement/piece`; **(b)** differentiate the shared skeletons by
changing the *instrumentation*, not the label; **(c)** fix the mood where it contradicts the
category.

Genre by intensity, combined with the per-file prefix in the tables:

| level | genre shape |
|---|---|
| I | `<prefix> bed` &mdash; low BPM, sustained, no cadence |
| II | `<prefix>` &mdash; melody and motion |
| III | `epic <prefix> climax` &mdash; full ensemble |

Column key: **splice** = P1.1 hits &middot; **serene** = tense category described "serene and
timeless" &middot; **noBPM** = P1.3 &middot; **vocal** = P1.2 &middot; **noGenre** = cues with no
genre word anywhere &middot; **shared** = cues whose text is reused by another category &middot;
**negX** = P1.5. A dot means zero.

### Batch A &mdash; mood contradicts the category (22 files, 440 cues) &mdash; do first

These describe combat, boss fights, betrayal, horror and comedy as *"serene and timeless"*.
It is the only finding that is outright wrong rather than merely weak.

| &#10003; | category | cues | genre prefix to adopt | splice | serene | noBPM | vocal | noGenre | shared | >300s | negX |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [x] | `ritual.md` | 90 | ritual percussion orchestral | 9 | 20 | 22 | 3 | 52 | 60 | 15 | 1 |
| [x] | `siege.md` | 90 | martial hybrid orchestral | 9 | 20 | 21 | 2 | 51 | 59 | 15 | &middot; |
| [x] | `boss.md` | 90 | epic hybrid orchestral | 8 | 20 | 20 | 2 | 34 | 60 | 15 | &middot; |
| [x] | `tension.md` | 90 | minimalist suspense score | 8 | 20 | 23 | 2 | 52 | 60 | 15 | &middot; |
| [x] | `chase.md` | 90 | driving hybrid orchestral | 7 | 20 | 20 | 2 | 47 | 60 | 15 | &middot; |
| [x] | `spooky.md` | 90 | horror ambient orchestral | 7 | 20 | 26 | 2 | 48 | 60 | 15 | &middot; |
| [x] | `betrayal.md` | 90 | dark cinematic orchestral | 6 | 20 | 23 | 2 | 40 | 60 | 15 | &middot; |
| [x] | `countdown.md` | 90 | minimalist tension score | 6 | 20 | 20 | 3 | 52 | 60 | 15 | 1 |
| [x] | `defeat.md` | 90 | elegiac orchestral | 6 | 20 | 26 | 2 | 34 | 60 | 15 | &middot; |
| [x] | `infernal.md` | 90 | brutal dark orchestral | 6 | 20 | 23 | 3 | 48 | 60 | 15 | &middot; |
| [x] | `war-march.md` | 90 | martial march orchestral | 6 | 20 | 20 | 3 | 3 | 60 | 15 | &middot; |
| [x] | `last-stand.md` | 90 | desperate hybrid orchestral | 6 | 20 | 20 | 4 | 51 | 59 | 15 | &middot; |
| [x] | `beast-hunt.md` | 90 | percussive hybrid orchestral | 5 | 20 | 20 | 2 | 38 | 60 | 15 | &middot; |
| [x] | `combat.md` | 90 | hybrid orchestral | 5 | 20 | 20 | 2 | 34 | 60 | 15 | &middot; |
| [x] | `dark-and-creepy.md` | 90 | horror orchestral | 5 | 20 | 30 | 3 | 34 | 60 | 15 | &middot; |
| [x] | `dragon-presence.md` | 90 | epic dark orchestral | 5 | 20 | 24 | 3 | 49 | 60 | 15 | 1 |
| [x] | `eclipse.md` | 90 | dark cinematic orchestral | 5 | 20 | 23 | 6 | 50 | 60 | 15 | &middot; |
| [x] | `eldritch.md` | 90 | dissonant horror ambient | 5 | 20 | 26 | 4 | 52 | 60 | 15 | &middot; |
| [x] | `goofy.md` | 90 | whimsical light-comedy chamber | 5 | 20 | 20 | 2 | 56 | 60 | 15 | &middot; |
| [x] | `madness.md` | 90 | dissonant experimental orchestral | 5 | 20 | 24 | 4 | 51 | 60 | 15 | &middot; |
| [x] | `prison.md` | 90 | bleak minimal orchestral | 5 | 20 | 23 | 2 | 52 | 60 | 15 | &middot; |
| [x] | `undead-legion.md` | 90 | gothic dark orchestral | 5 | 20 | 23 | 2 | 44 | 60 | 15 | &middot; |

### Batch B &mdash; heavy skeleton reuse (51 files) &mdash; the bulk of the work

Every Level I/II/III set here is shared with ~72 other categories. Changing the instrumentation
per category is what makes Browse prompts offer 98 distinct beds instead of ~40.

| &#10003; | category | cues | genre prefix to adopt | splice | serene | noBPM | vocal | noGenre | shared | >300s | negX |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [x] | `night.md` | 90 | nocturnal ambient orchestral | 13 | &middot; | 27 | 2 | 42 | 59 | 15 | &middot; |
| [x] | `storm.md` | 90 | turbulent cinematic orchestral | 12 | &middot; | 23 | 2 | 52 | 58 | 15 | &middot; |
| [x] | `city.md` | 90 | medieval folk orchestral | 10 | &middot; | 22 | 2 | 46 | 60 | 15 | &middot; |
| [x] | `jungle.md` | 90 | tribal percussion orchestral | 9 | &middot; | 23 | 5 | 51 | 60 | 15 | 1 |
| [x] | `court.md` | 90 | baroque chamber | 8 | &middot; | 22 | 2 | 46 | 60 | 15 | &middot; |
| [x] | `hope.md` | 90 | uplifting cinematic orchestral | 8 | &middot; | 20 | 2 | 49 | 60 | 15 | 1 |
| [x] | `winter.md` | 90 | cold cinematic orchestral | 8 | &middot; | 24 | 2 | 52 | 60 | 15 | &middot; |
| [x] | `clockwork.md` | 90 | minimalist clockwork orchestral | 7 | &middot; | 22 | 2 | 49 | 60 | 15 | &middot; |
| [x] | `feast.md` | 90 | rowdy tavern folk | 7 | &middot; | 20 | 3 | 36 | 60 | 15 | &middot; |
| [x] | `forge.md` | 90 | industrial percussion orchestral | 7 | &middot; | 23 | 4 | 49 | 60 | 15 | 2 |
| [x] | `melancholy.md` | 90 | melancholic neoclassical | 7 | &middot; | 26 | 2 | 39 | 60 | 15 | &middot; |
| [x] | `dusk.md` | 90 | pastoral folk | 7 | &middot; | 22 | 3 | 52 | 59 | 15 | 1 |
| [x] | `morning.md` | 90 | bright pastoral orchestral | 7 | &middot; | 25 | 2 | 39 | 59 | 15 | &middot; |
| [x] | `sacred.md` | 90 | sacred choral orchestral | 7 | &middot; | 21 | 4 | 50 | 58 | 15 | &middot; |
| [x] | `camp.md` | 90 | acoustic folk | 6 | &middot; | 23 | 3 | 39 | 60 | 15 | 1 |
| [x] | `desert.md` | 90 | Middle Eastern ambient folk | 6 | &middot; | 24 | 2 | 46 | 60 | 15 | &middot; |
| [x] | `mountain.md` | 90 | expansive cinematic orchestral | 6 | &middot; | 24 | 2 | 51 | 60 | 15 | &middot; |
| [x] | `prophecy.md` | 90 | mystical cinematic orchestral | 6 | &middot; | 23 | 5 | 51 | 60 | 15 | &middot; |
| [x] | `sad.md` | 90 | elegiac neoclassical | 6 | &middot; | 28 | 2 | 44 | 60 | 15 | &middot; |
| [x] | `sewers.md` | 90 | dank ambient orchestral | 6 | &middot; | 23 | 3 | 52 | 60 | 15 | 1 |
| [x] | `sailing.md` | 90 | maritime folk orchestral | 6 | &middot; | 22 | 2 | 52 | 59 | 15 | &middot; |
| [x] | `victory.md` | 90 | triumphant orchestral fanfare | 6 | &middot; | 20 | 2 | 45 | 59 | 15 | &middot; |
| [x] | `ancient-discovery.md` | 90 | cinematic orchestral | 5 | &middot; | 26 | 2 | 35 | 60 | 15 | &middot; |
| [x] | `aqua.md` | 90 | aquatic ambient orchestral | 5 | &middot; | 26 | 2 | 35 | 60 | 15 | &middot; |
| [x] | `bazaar.md` | 90 | Middle Eastern folk | 5 | &middot; | 23 | 3 | 47 | 60 | 15 | &middot; |
| [x] | `docks.md` | 90 | sea-shanty folk | 5 | &middot; | 22 | 2 | 44 | 60 | 15 | &middot; |
| [x] | `dreamscape.md` | 90 | ethereal ambient | 5 | &middot; | 23 | 2 | 51 | 60 | 15 | &middot; |
| [x] | `ethereal.md` | 90 | ethereal ambient | 5 | &middot; | 27 | 5 | 34 | 60 | 15 | &middot; |
| [x] | `exploration.md` | 90 | adventurous cinematic folk | 5 | &middot; | 21 | 2 | 36 | 60 | 15 | &middot; |
| [x] | `exploration-above-ground.md` | 90 | pastoral cinematic orchestral | 5 | &middot; | 20 | 2 | 34 | 60 | 15 | &middot; |
| [x] | `exploration-underground.md` | 90 | dark cinematic ambient | 5 | &middot; | 27 | 2 | 34 | 60 | 15 | 1 |
| [x] | `fey-mischief.md` | 90 | playful woodwind folk | 5 | &middot; | 21 | 2 | 49 | 60 | 15 | &middot; |
| [x] | `forest-swamp-combat.md` | 90 | percussive hybrid orchestral | 5 | &middot; | 20 | 2 | 57 | 60 | 15 | &middot; |
| [x] | `gambling-den.md` | 90 | smoky lounge folk | 5 | &middot; | 20 | 2 | 53 | 60 | 15 | &middot; |
| [x] | `gentle-rain.md` | 90 | gentle neoclassical | 5 | &middot; | 23 | 2 | 53 | 60 | 15 | 1 |
| [x] | `happy.md` | 90 | bright pastoral folk | 5 | &middot; | 20 | 2 | 39 | 60 | 15 | &middot; |
| [x] | `mystery.md` | 90 | suspenseful cinematic orchestral | 5 | &middot; | 26 | 2 | 38 | 60 | 15 | &middot; |
| [x] | `pirates.md` | 90 | sea-shanty folk orchestral | 5 | &middot; | 21 | 3 | 47 | 60 | 15 | 1 |
| [x] | `puzzle.md` | 90 | curious minimalist chamber | 5 | &middot; | 20 | 2 | 53 | 60 | 15 | 2 |
| [x] | `rally.md` | 90 | heroic march orchestral | 5 | &middot; | 20 | 4 | 48 | 60 | 15 | 2 |
| [x] | `revelation.md` | 90 | awe-struck cinematic orchestral | 5 | &middot; | 23 | 2 | 51 | 60 | 15 | &middot; |
| [x] | `romance.md` | 90 | romantic neoclassical | 5 | &middot; | 20 | 2 | 51 | 60 | 15 | &middot; |
| [x] | `secret-magic.md` | 90 | mystical chamber | 5 | &middot; | 27 | 2 | 39 | 60 | 15 | &middot; |
| [x] | `shadowfell.md` | 90 | bleak dark orchestral | 5 | &middot; | 23 | 2 | 52 | 60 | 15 | &middot; |
| [x] | `sneaking.md` | 90 | minimalist stealth score | 5 | &middot; | 20 | 3 | 46 | 60 | 15 | &middot; |
| [x] | `swamp.md` | 90 | murky ambient folk | 5 | &middot; | 27 | 3 | 42 | 60 | 15 | 1 |
| [x] | `trial.md` | 90 | solemn orchestral | 5 | &middot; | 20 | 3 | 51 | 60 | 15 | &middot; |
| [x] | `underdark.md` | 90 | subterranean dark ambient orchestral | 5 | &middot; | 23 | 2 | 52 | 60 | 15 | 1 |
| [x] | `villain-theme.md` | 90 | menacing gothic orchestral | 5 | &middot; | 20 | 3 | 52 | 60 | 15 | 1 |
| [x] | `volcanic.md` | 90 | seismic percussion orchestral | 5 | &middot; | 23 | 2 | 50 | 60 | 15 | &middot; |
| [x] | `thieves-guild.md` | 90 | sly noir jazz orchestral | &middot; | &middot; | 20 | 2 | 53 | 55 | 15 | &middot; |

### Batch C &mdash; modern sets, already skeleton-free (13 files) &mdash; quick wins

No splices and no shared skeletons &mdash; these were written later and better. They need a genre
prefix and a vocal-word pass only.

| &#10003; | category | cues | genre prefix to adopt | splice | serene | noBPM | vocal | noGenre | shared | >300s | negX |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [x] | `forest.md` | 90 | pastoral ambient folk | 17 | &middot; | 14 | &middot; | 22 | &middot; | 15 | 2 |
| [x] | `reading.md` | 90 | warm neoclassical | 13 | &middot; | 17 | 10 | 49 | &middot; | 8 | 10 |
| [x] | `learning-concept-mastery.md` | 90 | neoclassical study | &middot; | &middot; | 14 | 6 | 59 | &middot; | 8 | 6 |
| [x] | `learning-curious-mind.md` | 90 | light neoclassical | &middot; | &middot; | 16 | 25 | 54 | &middot; | 8 | 14 |
| [x] | `learning-deep-study.md` | 90 | minimal neoclassical ambient | &middot; | &middot; | 16 | 5 | 60 | &middot; | 8 | 5 |
| [x] | `programming-algorithmic-focus.md` | 90 | minimal neoclassical | &middot; | &middot; | 13 | 9 | 59 | &middot; | 8 | 9 |
| [x] | `programming-flow-state.md` | 90 | ambient electronic | &middot; | &middot; | 1 | 6 | 56 | &middot; | 8 | 7 |
| [x] | `programming-synth-horizon.md` | 90 | synthwave | &middot; | &middot; | 1 | 28 | 50 | &middot; | 8 | 15 |
| [x] | `reading-epic-lore.md` | 90 | epic cinematic orchestral | &middot; | &middot; | 16 | 14 | 50 | &middot; | 8 | 14 |
| [x] | `reading-philosophical.md` | 90 | contemplative neoclassical | &middot; | &middot; | 16 | 10 | 62 | &middot; | 8 | 10 |
| [x] | `walking-brisk-stride.md` | 90 | upbeat acoustic folk | &middot; | &middot; | &middot; | 24 | 60 | &middot; | 8 | 15 |
| [x] | `walking-mindful-stroll.md` | 90 | serene neoclassical ambient | &middot; | &middot; | 16 | 11 | 53 | &middot; | 8 | 11 |
| [x] | `walking-twilight-wander.md` | 90 | gentle neoclassical | &middot; | &middot; | 9 | 15 | 60 | &middot; | 8 | 15 |

### Batch D &mdash; short single-set theme files (12 files) &mdash; smallest, do any time

| &#10003; | category | cues | genre prefix to adopt | splice | serene | noBPM | vocal | noGenre | shared | >300s | negX |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [x] | `character-themes.md` | 30 | cinematic folk orchestral | 1 | &middot; | &middot; | &middot; | 25 | 20 | 6 | 4 |
| [x] | `dwarven-halls.md` | 30 | heavy folk brass | 1 | &middot; | &middot; | &middot; | 19 | 20 | 6 | 4 |
| [x] | `elven-court.md` | 30 | Celtic chamber folk | 1 | &middot; | &middot; | &middot; | 22 | 20 | 6 | 4 |
| [x] | `epilogue.md` | 30 | warm cinematic folk | 1 | &middot; | &middot; | &middot; | 26 | 20 | 6 | 4 |
| [x] | `forest-tunes.md` | 30 | Celtic folk | 1 | &middot; | &middot; | 1 | 22 | 20 | 6 | 5 |
| [x] | `intermission.md` | 30 | light tavern folk | 1 | &middot; | &middot; | &middot; | 25 | 20 | 6 | 4 |
| [x] | `main-theme.md` | 30 | heroic cinematic orchestral | 1 | &middot; | &middot; | &middot; | 24 | 20 | 6 | 4 |
| [x] | `orcish-war-camp.md` | 30 | Middle Eastern war-percussion folk | 1 | &middot; | &middot; | 1 | 22 | 20 | 6 | 4 |
| [x] | `recap.md` | 30 | cinematic folk orchestral | 1 | &middot; | &middot; | 1 | 25 | 20 | 6 | 4 |
| [x] | `workout-cardio-flow.md` | 16 | driving electronic | &middot; | &middot; | &middot; | 2 | 9 | &middot; | 2 | 2 |
| [x] | `workout-power-drive.md` | 16 | aggressive electronic rock | &middot; | &middot; | &middot; | 4 | 5 | &middot; | 2 | 4 |
| [x] | `workout-stretch-cooldown.md` | 16 | serene ambient | &middot; | &middot; | 4 | &middot; | 9 | &middot; | 2 | &middot; |

---

## Verify

```bash
python scripts/rewrite_prompts.py --check
```

Then rebuild with the `update-desktop-exe` skill, since these files ship in the bundle.

---

## Result

`8,058 cues / 98 files`. Every cue body is now unique, and the count of distinct
instrumentation signatures roughly doubled at every level:

| level | distinct before | distinct after |
|---|---:|---:|
| I | 1,374 | 2,598 |
| II | 1,148 | 2,598 |
| III | 1,141 | 2,592 |
| single-set themes | 100 | 270 |

### Decisions taken where the doc left a choice

- **P1.6 duration policy** &mdash; Level I beds are clamped to **300s**, the top of the
  cinematic/ambient band. A hard clamp alone would have collapsed the last six rungs of
  each ladder onto one value, so each file's Level I ladder is rescaled proportionally to
  land on 300 (rounded to 5s, kept strictly increasing). Levels II and III keep the 380s
  ceiling, as do the single-set theme files.
- **Level III head** &mdash; the shape is `<prefix> climax`, with `epic ` prepended only where
  the prefix is a bare genre that carries no intensity of its own. `epic minimalist
  suspense score climax` and `epic gentle neoclassical climax` contradict themselves, and
  the words cost budget against the 45-word ceiling.
- **P1.5 scope** &mdash; a negative is dropped only when the positive asks for the same
  *sound*, tested against a percussion/choir vocabulary rather than the negative's own
  word. `military snare cadence` is percussion without containing the word; conversely
  `trap`, `pop` and `speech` are genre exclusions that share a word with scene prose
  (`eel traps checked`, `fire-pop accents`, `the speech finding its stride`) without any
  conflict. 2,522 terms removed.
- **P1.7** &mdash; P1.4's replacement is *longer* than the boilerplate it removes (8 words
  against 6), not shorter as the note above assumed, and the genre prefix adds 2&ndash;3 more.
  40 cues ran long rather than the 9 listed; all were hand-trimmed, mostly by dropping the
  head that the genre prefix had made redundant.

### Beyond the checklist

- The P1.2 table left 31 prompt lines still matching the validator's reject list
  (`the seer's voice drops an octave`, `one-more-chorus energy`, `reaches the chorus`).
  All were rewritten, along with the headings and file intros that named them.
- P1.4's two table patterns missed seven wordings (`unhurried texture with no ending`,
  `steady evolving texture with no ending`, &hellip;); the adjectives are now matched rather
  than enumerated.
- One cue wrote `very slow` where the trained `BPM` tag belongs.
- The generator gave each level ten instrument groups and used each twice. The
  replacement palettes rotate over four blocks instead, so all twenty groups in a level
  are distinct.

### Left deliberately

- **The shared scene lines.** Phase 2(b) scopes to instrumentation, and it is the
  instrumentation that has been differentiated. The 20 scene clauses per level are still
  shared across categories, so a Level II boss cue can still read
  `travelers making steady progress along winding trails`. The five worst were fixed by
  P1.1; the rest is a separate pass of the same size as this one.
- **The universal negative block.** P1.5 notes that per-cue negatives are only worth the
  effort if music moves onto `medium-base`; the nine shared strings remain, minus the
  per-cue conflicts.
