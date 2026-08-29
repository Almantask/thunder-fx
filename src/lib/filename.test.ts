import { describe, expect, it } from 'vitest'
import { clipFilename, promptName, slugifyPrompt } from '@/lib/filename'

describe('clipFilename', () => {
  it('builds a stable game-ready name', () => {
    expect(
      clipFilename('TrackType: SFX, steel shortsword leaving a leather scabbard', 8, 'wav'),
    ).toBe('steel-shortsword-leaving-a-leather-scabbard-8s.wav')
  })

  it('strips a music TrackType the same way', () => {
    expect(clipFilename('TrackType: Music, instrumental tavern lute theme', 20, 'wav')).toBe(
      'instrumental-tavern-lute-theme-20s.wav',
    )
  })

  it('falls back when the prompt is empty', () => {
    expect(slugifyPrompt('!!!')).toBe('sound')
  })
})

describe('promptName', () => {
  it('uses the first clause after TrackType as a title', () => {
    expect(
      promptName(
        'TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay',
      ),
    ).toBe('Steel shortsword leaving a leather scabbard')
  })

  it('titles a music prompt the same way', () => {
    expect(promptName('TrackType: Music, lute tavern theme, warm strings')).toBe(
      'Lute tavern theme',
    )
  })

  it('skips generic prefixes like instrumental or music to find the descriptive title', () => {
    expect(
      promptName(
        'TrackType: Music, instrumental, orchestral skirmish tension, alert and dangerous, staccato low strings',
      ),
    ).toBe('Orchestral skirmish tension')
    expect(
      promptName('TrackType: Music, instrumental, combat, boss fight'),
    ).toBe('Combat')
  })

  it('titles a free-text prompt', () => {
    expect(promptName('tavern door')).toBe('Tavern door')
  })

  it('falls back when only generic or empty clauses remain', () => {
    expect(promptName('TrackType: SFX')).toBe('Untitled sound')
    expect(promptName('TrackType: Music, instrumental')).toBe('Instrumental')
  })

  it('converts raw UUID prompts into proper titles using subcategory or category', () => {
    expect(
      promptName('67de8afe-9708-4034-8f23-8c4391694f47', {
        category: 'Combat',
        subcategory: 'Sword',
      }),
    ).toBe('Sword Sound')

    expect(
      promptName('67de8afe-9708-4034-8f23-8c4391694f47', {
        category: 'Foley',
        subcategory: 'General',
      }),
    ).toBe('Foley Sound')

    expect(
      promptName('67de8afe-9708-4034-8f23-8c4391694f47', {
        category: 'Custom',
        mode: 'sfx',
      }),
    ).toBe('Sound Effect')

    expect(
      promptName('67de8afe-9708-4034-8f23-8c4391694f47', {
        category: 'music-and-fx-generated-library',
        subcategory: 'General',
        mode: 'sfx',
      }),
    ).toBe('Sound Effect')

    expect(
      promptName('67de8afe-9708-4034-8f23-8c4391694f47', {
        category: 'Custom',
        mode: 'music',
      }),
    ).toBe('Instrumental')

    expect(
      promptName('67de8afe-9708-4034-8f23-8c4391694f47', {
        category: 'Custom',
        mode: 'ambience',
      }),
    ).toBe('Ambience')
  })

  it('converts file slugs to clean title case', () => {
    expect(promptName('steel-shortsword-clash-8s-a1b2c3d4')).toBe('Steel Shortsword Clash')
    expect(promptName('laser_blast_burst-0.4s')).toBe('Laser Blast Burst')
  })
})
