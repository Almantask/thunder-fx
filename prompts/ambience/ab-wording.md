# A/B wording tests

Paired prompts for testing **prompt wording on instrumental beds**, one variable at a time.
Every pair is an `(A)` and a `(B)` that differ in exactly one thing; duration and the
`Negative:` line are held fixed across the pair.

Note that **Max quality keeps music on the distilled `medium` checkpoint** — `QUALITY_BY_MODE`
found no CFG that beat Balanced for instrumental — so Balanced is where these results apply,
and there is no higher preset to re-check them against.

`VocalType: Instrumental` is added automatically for this library and a bare `instrumental`
in the body is stripped, so neither is testable. `BPM:` placement is normalised too; only the
**value** varies below.

This library groups by inferred intensity, which splits the two halves of a pair across the
`I`/`II`/`III` sections. Type the pair's tag (`W27`, `W31`, …) into the **Browse prompts**
search box instead and press **Add visible** — that queues exactly that pair and nothing else.

### W27 Mood adjectives (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, dark, tense, ominous, foreboding atmosphere. BPM: 60. Length: 40 seconds

### W27 Instrumentation nouns (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, low brass swells, quiet string ostinato, timpani. BPM: 60. Length: 40 seconds

### W28 Tempo, 70 BPM (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, solo lute melody, warm room. BPM: 70. Length: 40 seconds

### W28 Tempo, 120 BPM (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, solo lute melody, warm room. BPM: 120. Length: 40 seconds

### W29 Genre named (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, medieval folk dance tune. BPM: 110. Length: 40 seconds

### W29 Instruments named (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, fiddle, hand drum and tambourine dance tune. BPM: 110. Length: 40 seconds

### W30 Modality, unstated (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, slow cello and piano theme. BPM: 60. Length: 40 seconds

### W30 Modality, minor key (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, slow cello and piano theme in a minor key, melancholy. BPM: 60. Length: 40 seconds

### W31 Vocal suppression, tag only (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, ethereal synth and flute bed, shimmering. BPM: 80. Length: 40 seconds

### W31 Vocal suppression, restated (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, ethereal synth and flute bed, shimmering, no vocals, no singing. BPM: 80. Length: 40 seconds

### W32 Arrangement, sparse (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, sparse dungeon drone, two instruments only, bowed strings and low drone. BPM: 50. Length: 40 seconds

### W32 Arrangement, full (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, full orchestral dungeon bed, strings, brass, percussion and low woodwinds. BPM: 50. Length: 40 seconds

### W33 Loop cue, absent (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, tavern lute theme, warm acoustic. BPM: 100. Length: 40 seconds

### W33 Loop cue, present (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, tavern lute theme, warm acoustic, seamless loop, no ending. BPM: 100. Length: 40 seconds

### W54 Era, period instruments (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, stately court dance on period instruments. BPM: 90. Length: 40 seconds

### W54 Era, modern orchestra (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, stately court dance on modern orchestral instruments. BPM: 90. Length: 40 seconds

### W55 Dynamics, quiet (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, quiet restrained string bed, gentle and low volume. BPM: 60. Length: 40 seconds

### W55 Dynamics, loud (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, loud powerful string bed, intense and full force. BPM: 60. Length: 40 seconds

### W56 Rhythm, strict pulse (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, solo harp theme, steady pulse, strict time. BPM: 80. Length: 40 seconds

### W56 Rhythm, free time (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, solo harp theme, rubato, free time, no strict pulse. BPM: 80. Length: 40 seconds

### W57 Register, low (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, low register bass-heavy orchestral bed, cellos and contrabass. BPM: 60. Length: 40 seconds

### W57 Register, high (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, high register bright orchestral bed, violins and flutes. BPM: 60. Length: 40 seconds

### W58 Harmony, static drone (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, dungeon bed on a single static drone chord, no chord changes. BPM: 50. Length: 40 seconds

### W58 Harmony, moving progression (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, dungeon bed with a moving chord progression, shifting harmony. BPM: 50. Length: 40 seconds

### W59 Space, dry studio (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, solo cello theme, close dry studio recording. BPM: 60. Length: 40 seconds

### W59 Space, concert hall (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, solo cello theme, large concert hall reverb. BPM: 60. Length: 40 seconds

### W60 Melody, present (A)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, forest theme with a clear memorable melody line. BPM: 70. Length: 40 seconds

### W60 Melody, textural (B)
- Duration: 40s
- Negative: vocals, singing, speech

TrackType: Music, VocalType: Instrumental, forest theme, textural atmosphere, no melody line. BPM: 70. Length: 40 seconds
