import { describe, expect, it } from 'vitest'
import {
  catalogFromFiles,
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
    expect(parsed.id).toBe('combat')
    expect(parsed.name).toBe('Combat')
    expect(parsed.effects).toHaveLength(2)
    expect(parsed.effects[0]).toMatchObject({
      id: 'combat:steel-sword-draw',
      title: 'Steel sword draw',
      duration: 1.5,
      negative: 'music, speech, singing, rain',
      prompt:
        'TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay',
    })
  })

  it('skips remix tails that are not complete generate prompts', () => {
    const parsed = parsePromptMarkdown('flavors.md', flavorsMd)
    expect(parsed.effects.map((e) => e.title)).toEqual(['Sword draw, vintage'])
    expect(parsed.effects[0]?.duration).toBe(1.5)
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
    expect(catalog.map((c) => c.id)).toEqual(['combat', 'ui'])
    expect(catalog[0]?.effects[0]?.title).toBe('Steel sword draw')
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
    expect(catalog.length).toBeGreaterThan(10)
    const combat = catalog.find((c) => c.id === 'combat')
    expect(combat?.name).toBe('Combat')
    expect(combat?.effects.some((e) => e.title === 'Steel sword draw')).toBe(true)
    expect(catalog.every((c) => c.id !== 'readme')).toBe(true)
    const total = catalog.reduce((n, c) => n + c.effects.length, 0)
    expect(total).toBeGreaterThan(100)
    expect(catalog.every((c) => c.effects.every((e) => e.prompt.toLowerCase().includes('tracktype:')))).toBe(
      true,
    )
  })
})
