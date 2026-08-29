import { describe, expect, it } from 'vitest'
import {
  catalogFromFiles,
  formatIntensityLabel,
  getCompletedSubcategories,
  getCompletedSubcategoryCount,
  inferClipCategory,
  inferClipIntensity,
  inferClipSubcategory,
  loadPromptCatalog,
  mergeQueue,
  parsePromptMarkdown,
  removeFromQueue,
} from '@/lib/promptCatalog'

const combatMd = `# Combat

Weapon and hit one-shots.

### Steel sword draw
- Duration: 1.5s
- Negative: music, speech, singing, rain

TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay

## Variations

### Dagger draw
- Duration: 1s
- Negative: music, speech, singing

TrackType: SFX, small steel dagger leaving a leather sheath, close mic, dry studio, fast decay
`

const flavorsMd = `# Production flavors

## Tails (the production)

### Dry studio (default game one-shot)
- Duration: match the action
- Negative: music, speech, singing

close mic, dry studio, fast decay

## Full examples (body + tail)

### Sword draw, vintage
- Duration: 1.5s
- Negative: music, speech, singing, rain

TrackType: SFX, steel shortsword leaving a leather scabbard, vintage ribbon mic, analog tape
`

describe('parsePromptMarkdown', () => {
  it('reads titled effects with duration, negative, and TrackType', () => {
    const parsed = parsePromptMarkdown('combat.md', combatMd)
    expect(parsed.id).toBe('fx:combat')
    expect(parsed.library).toBe('fx')
    expect(parsed.name).toBe('Combat')
    expect(parsed.effects).toHaveLength(2)
    expect(parsed.effects[0]).toMatchObject({
      id: 'fx:combat:steel-sword-draw',
      library: 'fx',
      title: 'Steel sword draw',
      duration: 1.5,
      negative: 'music, speech, singing, rain',
      prompt:
        'TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay',
    })
  })

  it('clamps catalog duration to the Medium model limit', () => {
    const parsed = parsePromptMarkdown(
      'beds.md',
      `# Beds

### Tavern loop
- Duration: 400s
- Negative: vocals

TrackType: Music, looping tavern lute bed, no vocals
`,
    )
    expect(parsed.effects[0]?.duration).toBe(380)
  })

  it('skips remix tails that are not complete generate prompts', () => {
    const parsed = parsePromptMarkdown('flavors.md', flavorsMd)
    expect(parsed.effects.map((e) => e.title)).toEqual(['Sword draw, vintage'])
    expect(parsed.effects[0]?.duration).toBe(1.5)
  })

  it('extracts instruments for non-fx prompts and leaves fx prompt instruments undefined', () => {
    const musicMd = `# Forest

### Forest ambient (I)
- Duration: 90s
- Negative: speech

TrackType: Music, peaceful forest glade with Celtic harp, soft cello drone, and tin whistle
`
    const parsedAmbience = parsePromptMarkdown('ambience/forest.md', musicMd)
    expect(parsedAmbience.library).toBe('ambience')
    expect(parsedAmbience.effects[0]?.instruments).toEqual(['harp', 'cello', 'drone', 'whistle'])

    const parsedFx = parsePromptMarkdown('fx/combat.md', combatMd)
    expect(parsedFx.library).toBe('fx')
    expect(parsedFx.effects[0]?.instruments).toBeUndefined()
  })
})

describe('catalogFromFiles', () => {
  it('skips README and empty files, keeping category order by name', () => {
    const catalog = catalogFromFiles({
      '/prompts/README.md': '# Game sound-effect prompts\n\nCopy a prompt.\n',
      '/prompts/ui.md': `# UI

### Soft button click
- Duration: 0.5s
- Negative: music, speech, singing

TrackType: SFX, short UI button click, hard plastic, close mic, dry studio, fast decay
`,
      '/prompts/combat.md': combatMd,
    })
    expect(catalog.map((c) => c.id)).toEqual(['fx:combat', 'fx:ui'])
    expect(catalog[0]?.effects[0]?.title).toBe('Steel sword draw')
  })

  it('keeps sound-effect and ambience categories with the same name distinct', () => {
    const catalog = catalogFromFiles({
      '/prompts/fx/combat.md': combatMd,
      '/prompts/ambience/combat.md': `# Combat

### Orchestral skirmish tension (I)
- Duration: 30s
- Negative: speech, singing

TrackType: Music, instrumental, orchestral skirmish tension, looping-friendly
`,
    })
    expect(catalog.map((c) => c.id)).toEqual(['fx:combat', 'ambience:combat'])
    expect(catalog.map((c) => c.library)).toEqual(['fx', 'ambience'])
  })
})

describe('queue helpers', () => {
  it('appends unique effects and can remove by id', () => {
    const catalog = catalogFromFiles({ '/prompts/combat.md': combatMd })
    const [first, second] = catalog[0]?.effects ?? []
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    const queued = mergeQueue([], [first!, first!, second!])
    expect(queued.map((e) => e.id)).toEqual([first!.id, second!.id])
    expect(removeFromQueue(queued, first!.id).map((e) => e.id)).toEqual([second!.id])
  })
})

describe('loadPromptCatalog', () => {
  it('loads shipped /prompts markdown into generate-ready categories', () => {
    const catalog = loadPromptCatalog()
    expect(catalog.length).toBeGreaterThan(80)
    const combat = catalog.find((c) => c.id === 'fx:combat')
    expect(combat?.name).toBe('Combat')
    expect(combat?.library).toBe('fx')
    expect(combat?.effects.some((e) => e.title === 'Steel sword draw')).toBe(true)
    const forest = catalog.find((c) => c.id === 'ambience:forest')
    expect(forest?.library).toBe('ambience')
    expect(forest?.effects.some((e) => e.prompt.toLowerCase().startsWith('tracktype: music'))).toBe(true)
    const ambienceDurations = catalog
      .filter((c) => c.library === 'ambience')
      .flatMap((c) => c.effects.map((e) => e.duration))
    expect(new Set(ambienceDurations).size).toBeGreaterThan(8)
    expect(Math.min(...ambienceDurations)).toBeGreaterThanOrEqual(40)
    expect(Math.max(...ambienceDurations)).toBe(380)
    expect(ambienceDurations.every((seconds) => seconds <= 380)).toBe(true)
    expect(catalog.every((c) => !c.id.endsWith(':readme'))).toBe(true)
    const total = catalog.reduce((n, c) => n + c.effects.length, 0)
    expect(total).toBeGreaterThan(2000)
    expect(catalog.every((c) => c.effects.every((e) => e.prompt.toLowerCase().includes('tracktype:')))).toBe(
      true,
    )
    const ambienceEffects = catalog.filter((c) => c.library === 'ambience').flatMap((c) => c.effects)
    expect(ambienceEffects.some((e) => e.instruments && e.instruments.length > 0)).toBe(true)
    const fxEffects = catalog.filter((c) => c.library === 'fx').flatMap((c) => c.effects)
    expect(fxEffects.every((e) => e.instruments === undefined)).toBe(true)
  })
})

describe('inferClipCategory', () => {
  it('returns explicit clip.category when present', () => {
    const clip = {
      id: '1',
      prompt: 'random custom noise',
      duration: 5,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
      category: 'Special FX',
    }
    expect(inferClipCategory(clip)).toBe('Special FX')
  })

  it('infers Combat for steel shortsword prompt', () => {
    const clip = {
      id: '2',
      prompt: 'TrackType: SFX, steel shortsword leaving a leather scabbard',
      duration: 1.5,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipCategory(clip)).toBe('Combat')
  })

  it('infers Foley for heavy tavern door prompt', () => {
    const clip = {
      id: '3',
      prompt: 'TrackType: SFX, heavy tavern door on a busy night, oak and iron latch',
      duration: 2,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipCategory(clip)).toBe('Foley')
  })

  it('infers Doors for oak interior door prompt', () => {
    const clip = {
      id: '3b',
      prompt: 'TrackType: SFX, oak interior door opening, brass handle, close mic, timber room',
      duration: 2,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipCategory(clip)).toBe('Doors')
  })

  it('infers ambience category for music prompt', () => {
    const clip = {
      id: '4',
      prompt: 'TrackType: Music, peaceful forest glade with harp, warm and looping-friendly, no vocals',
      duration: 20,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
      mode: 'music' as const,
    }
    expect(inferClipCategory(clip)).toBe('Forest')
  })

  it('falls back to Custom for unmatched custom prompt', () => {
    const clip = {
      id: '5',
      prompt: 'TrackType: SFX, xyz999 unidentifiable futuristic glitch sound',
      duration: 1,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipCategory(clip)).toBe('Custom')
  })
})

describe('inferClipIntensity', () => {
  it('formats intensity codes correctly', () => {
    expect(formatIntensityLabel('I')).toBe('Level I — Quiet looping bed')
    expect(formatIntensityLabel('II')).toBe('Level II — Mood in motion')
    expect(formatIntensityLabel('III')).toBe('Level III — Full intensity')
  })

  it('infers explicit clip.intensity when present', () => {
    const clip = {
      id: '1',
      prompt: 'TrackType: Music, some ambient melody',
      duration: 30,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
      intensity: 'II',
    }
    expect(inferClipIntensity(clip)).toBe('Level II — Mood in motion')
  })

  it('detects intensity Roman numerals from prompt', () => {
    const clip1 = {
      id: '1',
      prompt: 'TrackType: Music, ancient ruins ambient (I)',
      duration: 30,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    const clip3 = {
      id: '3',
      prompt: 'TrackType: Music, epic temple orchestral (III)',
      duration: 30,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipIntensity(clip1)).toBe('Level I — Quiet looping bed')
    expect(inferClipIntensity(clip3)).toBe('Level III — Full intensity')
  })

  it('infers Level I for quiet looping cues and Level III for epic battle cues', () => {
    const quietClip = {
      id: '1',
      prompt: 'TrackType: Music, ancient drone ambient, steady texture with no ending, looping-friendly',
      duration: 90,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    const epicClip = {
      id: '2',
      prompt: 'TrackType: Music, epic boss battle, colossal orchestral climax, thunderous battery',
      duration: 60,
      seed: 2,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipIntensity(quietClip)).toBe('Level I — Quiet looping bed')
    expect(inferClipIntensity(epicClip)).toBe('Level III — Full intensity')
  })
})

describe('inferClipSubcategory', () => {
  it('returns explicit clip.subcategory when present', () => {
    const clip = {
      id: '1',
      prompt: 'custom blast sound',
      duration: 2,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
      subcategory: 'Custom Blast',
    }
    expect(inferClipSubcategory(clip)).toBe('Custom Blast')
  })

  it('infers Sword for steel shortsword prompt in Combat', () => {
    const clip = {
      id: '2',
      prompt: 'TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay',
      duration: 1.5,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipSubcategory(clip)).toBe('Sword')
  })

  it('infers Bow & Arrow for crossbow and arrow prompts in Combat', () => {
    const clip = {
      id: '3',
      prompt: 'TrackType: SFX, heavy crossbow string thump and bolt launch, close mic, dry studio, fast decay',
      duration: 1.5,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipSubcategory(clip)).toBe('Bow & Arrow')
  })

  it('infers Firearms for shotgun and pistol prompts in Combat', () => {
    const clip = {
      id: '4',
      prompt: 'TrackType: SFX, 12-gauge shotgun blast, close mic, wooden barn interior, short boom, fast decay',
      duration: 2,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipSubcategory(clip)).toBe('Firearms')
  })

  it('infers Shield & Armor for shield block prompt in Combat', () => {
    const clip = {
      id: '5',
      prompt: 'TrackType: SFX, heavy wooden shield catching a blow, oak and iron, close mic, dry studio, fast decay',
      duration: 1,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipSubcategory(clip)).toBe('Shield & Armor')
  })

  it('infers Wood and Metal & Gates for door prompts', () => {
    const woodDoor = {
      id: '6',
      prompt: 'TrackType: SFX, oak interior door opening, brass handle, close mic, timber room, short decay',
      duration: 2,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    const ironDoor = {
      id: '7',
      prompt: 'TrackType: SFX, heavy iron dungeon door swinging, stone hall, medium decay',
      duration: 3,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipSubcategory(woodDoor)).toBe('Wood')
    expect(inferClipSubcategory(ironDoor)).toBe('Metal & Gates')
  })

  it('infers Fire and Ice & Frost for magic prompts', () => {
    const fireball = {
      id: '8',
      prompt: 'TrackType: SFX, fireball ignition close-mic, fast decay, dry stone hall',
      duration: 2,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    const iceCrack = {
      id: '9',
      prompt: 'TrackType: SFX, thick ice forming and cracking on stone, close mic, cold dry hall, short decay',
      duration: 2,
      seed: 1,
      createdAt: new Date().toISOString(),
      cfg: 1,
      negative: '',
    }
    expect(inferClipSubcategory(fireball)).toBe('Fire')
    expect(inferClipSubcategory(iceCrack)).toBe('Ice & Frost')
  })
})

describe('getCompletedSubcategories and getCompletedSubcategoryCount', () => {
  it('returns empty array and 0 count when clips list is empty', () => {
    expect(getCompletedSubcategories([])).toEqual([])
    expect(getCompletedSubcategoryCount([])).toBe(0)
  })

  it('returns 0 when a subcategory is only partially complete', () => {
    const mockCat = parsePromptMarkdown(
      'prompts/fx/test.md',
      `# Test\n\n### Sword 1\n- Duration: 1s\n- Negative: none\n\nTrackType: SFX, sword swing one\n\n### Sword 2\n- Duration: 1s\n- Negative: none\n\nTrackType: SFX, sword swing two`,
    )
    const partialClips = [
      {
        id: '1',
        prompt: 'TrackType: SFX, sword swing one',
        duration: 1,
        seed: 1,
        createdAt: new Date().toISOString(),
        cfg: 1,
        negative: '',
      },
    ]
    expect(getCompletedSubcategories(partialClips, [mockCat])).toEqual([])
    expect(getCompletedSubcategoryCount(partialClips, [mockCat])).toBe(0)
  })

  it('detects a fully completed subcategory', () => {
    const mockCat = parsePromptMarkdown(
      'prompts/fx/test.md',
      `# Test\n\n### Sword 1\n- Duration: 1s\n- Negative: none\n\nTrackType: SFX, sword swing one\n\n### Sword 2\n- Duration: 1s\n- Negative: none\n\nTrackType: SFX, sword swing two`,
    )
    const completeClips = [
      {
        id: '1',
        prompt: 'TrackType: SFX, sword swing one',
        duration: 1,
        seed: 1,
        createdAt: new Date().toISOString(),
        cfg: 1,
        negative: '',
      },
      {
        id: '2',
        prompt: 'TrackType: SFX, sword swing two',
        duration: 1,
        seed: 2,
        createdAt: new Date().toISOString(),
        cfg: 1,
        negative: '',
      },
    ]
    const completed = getCompletedSubcategories(completeClips, [mockCat])
    expect(completed.length).toBe(1)
    expect(getCompletedSubcategoryCount(completeClips, [mockCat])).toBe(1)
  })
})

