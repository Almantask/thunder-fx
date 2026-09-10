# A/B wording tests

Paired prompts for testing **prompt wording**, one variable at a time. Every pair is an
`(A)` and a `(B)` that differ in exactly one thing; duration and the `Negative:` line are
held fixed across the pair so the comparison is about the words.

Run these on **Balanced**. Wording is the only lever at CFG 1, and a result measured at
CFG 4 will not transfer to the preset you actually generate on. Fix the seed, queue both
halves, then select the two clips in the library and press **Compare** — levels are matched
there, so the louder take does not simply win.

To queue one pair, type its tag (`W01`, `W06`, …) into the **Browse prompts** search box and
press **Add visible**. That queues exactly that pair and nothing else.

Two seeds minimum per pair, and require both to agree. Wording effects are smaller than
preset effects, so single-seed roll variance will swamp them more easily here.

Some controls repeat across pairs on purpose: at a fixed seed the same prompt gives the
same audio, so one generation can serve as the `(A)` side of several comparisons.

What is **not** testable from here: `TrackType:`, `VocalType:`, the `Length:` tag and the
placement of `BPM:` are all stripped and re-emitted by `normalize_prompt` before the model
sees them. Only the description body varies below.

### W01 Token order, source first (A)
- Duration: 5s
- Negative: music, speech, singing

TrackType: SFX, heavy oak door slamming shut, stone hall, close mic, short decay. Length: 5 seconds

### W01 Token order, production first (B)
- Duration: 5s
- Negative: music, speech, singing

TrackType: SFX, close mic, short decay, stone hall, heavy oak door slamming shut. Length: 5 seconds

### W02 Verbosity, terse (A)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay. Length: 2 seconds

### W02 Verbosity, elaborated (B)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, polished steel shortsword drawn from a worn oiled leather scabbard, bright metallic ring, crisp attack, close mic, dry studio, fast decay. Length: 2 seconds

### W03 Material, generic (A)
- Duration: 5s
- Negative: music, speech, singing

TrackType: SFX, door slamming shut, close mic, short decay. Length: 5 seconds

### W03 Material, named (B)
- Duration: 5s
- Negative: music, speech, singing

TrackType: SFX, heavy oak door slamming shut, close mic, short decay. Length: 5 seconds

### W04 Production tags, absent (A)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, steel shortsword leaving a leather scabbard, fast decay. Length: 2 seconds

### W04 Production tags, present (B)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay. Length: 2 seconds

### W05 Literal description (A)
- Duration: 5s
- Negative: music, speech, singing

TrackType: SFX, heavy oak door slamming shut, stone hall, close mic, short decay. Length: 5 seconds

### W05 Onomatopoeia (B)
- Duration: 5s
- Negative: music, speech, singing

TrackType: SFX, deep wooden thud and boom, stone hall, close mic, short decay. Length: 5 seconds

### W06 Decay, fast (A)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, pouch of gold coins dropped on an oak table, close mic, dry studio, fast decay. Length: 2 seconds

### W06 Decay, medium (B)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, pouch of gold coins dropped on an oak table, close mic, dry studio, medium decay. Length: 2 seconds

### W06 Decay, unstated (C)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, pouch of gold coins dropped on an oak table, close mic, dry studio. Length: 2 seconds

### W07 Count, unstated (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, heavy oak door slam, close mic, short decay. Length: 2 seconds

### W07 Count, single (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, one single heavy oak door slam, close mic, short decay. Length: 2 seconds

### W08 Dryness by negation (A)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, fireball ignition burst, no reverb, no room tone, fast decay. Length: 2 seconds

### W08 Dryness by positive tag (B)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, fireball ignition burst, close mic, dry studio, fast decay. Length: 2 seconds

### W09 Framing, neutral (A)
- Duration: 5s
- Negative: music, speech, singing

TrackType: SFX, iron portcullis dropping into a stone gate, courtyard, short decay. Length: 5 seconds

### W09 Framing, cinematic (B)
- Duration: 5s
- Negative: music, speech, singing

TrackType: SFX, epic cinematic trailer impact, iron portcullis dropping into a stone gate, courtyard, short decay. Length: 5 seconds

### W10 Mic distance, close (A)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, blacksmith hammer striking an anvil, close mic, short decay. Length: 3 seconds

### W10 Mic distance, distant (B)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, blacksmith hammer striking an anvil, distant mic, short decay. Length: 3 seconds

### W11 Room, unnamed (A)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, heavy leather boots on wet stone, single deliberate step. Length: 3 seconds

### W11 Room, named (B)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, heavy leather boots on wet stone, large stone hall, single deliberate step. Length: 3 seconds

### W12 Transient words, absent (A)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, wooden crate dropped on flagstones, close mic, dry studio. Length: 2 seconds

### W12 Transient words, present (B)
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, wooden crate dropped on flagstones, punchy transient, clean attack, close mic, dry studio. Length: 2 seconds

### W13 Comma tags (A)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, iron key turning in a rusted lock, close mic, dry studio, short decay. Length: 3 seconds

### W13 Natural prose (B)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, an iron key turns slowly in a rusted lock, recorded close in a dry studio, and the sound dies away quickly. Length: 3 seconds

### W14 Quality boilerplate, absent (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, glass bottle shattering on stone, close mic, dry studio, fast decay. Length: 2 seconds

### W14 Quality boilerplate, present (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, high quality professional studio recording, glass bottle shattering on stone, close mic, dry studio, fast decay. Length: 2 seconds

### W15 Subject stated once (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, heavy iron chain dragged across stone, close mic, short decay. Length: 2 seconds

### W15 Subject repeated (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, heavy iron chain dragged across stone, iron chain, close mic, short decay. Length: 2 seconds

### W16 Number, unstated (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, knocks on a heavy oak door, close mic, timber room, short decay. Length: 2 seconds

### W16 Number, counted (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, three knocks on a heavy oak door, close mic, timber room, short decay. Length: 2 seconds

### W17 Action speed, slow (A)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, heavy leather boots walking slowly on wet dungeon stone, close mic. Length: 3 seconds

### W17 Action speed, fast (B)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, heavy leather boots running fast on wet dungeon stone, close mic. Length: 3 seconds

### W18 Register, plain (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, leather glove gripping a rope, close mic, dry studio, short decay. Length: 2 seconds

### W18 Register, foley (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, foley recording of a leather glove gripping a rope, close mic, dry studio, short decay. Length: 2 seconds

### W34 Weight, light (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, light oak door closing, close mic, dry studio, fast decay. Length: 2 seconds

### W34 Weight, heavy (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, heavy oak door closing, close mic, dry studio, fast decay. Length: 2 seconds

### W35 Agent, bare event (A)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, hammer striking an anvil, close mic, short decay. Length: 3 seconds

### W35 Agent, named human (B)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, a blacksmith striking an anvil with a hammer, close mic, short decay. Length: 3 seconds

### W36 Pitch direction, rising (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, rising whoosh through air, close mic, fast decay. Length: 2 seconds

### W36 Pitch direction, falling (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, falling whoosh through air, close mic, fast decay. Length: 2 seconds

### W37 Surface, dry (A)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, leather boots on dry stone, single deliberate step, close mic. Length: 3 seconds

### W37 Surface, wet (B)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, leather boots on wet stone, single deliberate step, close mic. Length: 3 seconds

### W38 Sources, single (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, steel sword drawn from a scabbard, close mic, dry studio, fast decay. Length: 2 seconds

### W38 Sources, compound (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, steel sword drawn from a scabbard and chainmail rustling, close mic, dry studio, fast decay. Length: 2 seconds

### W39 Sequence, single event (A)
- Duration: 4s
- Negative: music, speech, singing

TrackType: SFX, stone wall impact, close mic, short decay. Length: 4 seconds

### W39 Sequence, ordered events (B)
- Duration: 4s
- Negative: music, speech, singing

TrackType: SFX, stone wall impact then falling rubble and settling dust, close mic, short decay. Length: 4 seconds

### W40 Vocabulary, physical (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, pressurised gas ignition burst, close mic, dry studio, fast decay. Length: 2 seconds

### W40 Vocabulary, fantasy (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, magic fireball spell burst, close mic, dry studio, fast decay. Length: 2 seconds

### W41 Intensity adverb, absent (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, oak door slammed, close mic, timber room, fast decay. Length: 2 seconds

### W41 Intensity adverb, present (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, oak door slammed violently, close mic, timber room, fast decay. Length: 2 seconds

### W42 Width, mono (A)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, iron chain dragged across stone, mono, centered, close mic. Length: 3 seconds

### W42 Width, wide stereo (B)
- Duration: 3s
- Negative: music, speech, singing

TrackType: SFX, iron chain dragged across stone, wide stereo image, close mic. Length: 3 seconds

### W43 Signal chain, clean (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, glass bottle shattering on stone, close mic, dry studio, fast decay. Length: 2 seconds

### W43 Signal chain, vintage (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, glass bottle shattering on stone, vintage ribbon mic, analog tape, fast decay. Length: 2 seconds

### W44 Isolation cue, absent (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, wooden crate dropped on flagstones, close mic, dry studio. Length: 2 seconds

### W44 Isolation cue, present (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, wooden crate dropped on flagstones, isolated one-shot, silence before and after, close mic, dry studio. Length: 2 seconds

### W45 Grammar, tag style (A)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, iron key turning in rusted lock, close mic, short decay. Length: 2 seconds

### W45 Grammar, articles (B)
- Duration: 2s
- Negative: music, speech, singing

TrackType: SFX, an iron key turning in a rusted lock, close mic, short decay. Length: 2 seconds
