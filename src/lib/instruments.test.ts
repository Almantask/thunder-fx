import { describe, expect, it } from 'vitest'
import { clipWavInfo, extractBpm, extractInstruments, musicWavInfo, promptFromWavInfo } from '@/lib/instruments'

describe('extractInstruments', () => {
  it('finds named instruments in a music prompt', () => {
    expect(extractInstruments('TrackType: Music, lute tavern theme')).toEqual(['lute'])
    expect(extractInstruments('sparse piano and cello, melancholy forest')).toEqual([
      'piano',
      'cello',
    ])
    expect(extractInstruments('lute and bodhran')).toEqual(['lute', 'bodhran'])
    expect(extractInstruments('heroic brass fanfare')).toEqual(['brass'])
    expect(extractInstruments('fiddle and flute')).toEqual(['fiddle', 'flute'])
    expect(extractInstruments('staccato low strings, sparse war drums, taiko pulses')).toEqual([
      'strings',
      'war drums',
      'taiko',
    ])
    expect(extractInstruments('ambient synth pads, duduk, and tin whistle')).toEqual([
      'synth',
      'duduk',
      'whistle',
    ])
    expect(
      extractInstruments('TrackType: Music, wordless choir, celesta glints, and deep waterphone'),
    ).toEqual(['choir', 'celesta', 'waterphone'])
    expect(
      extractInstruments('TrackType: Music, slow oud melody, darbuka rhythm, and viola da gamba'),
    ).toEqual(['oud', 'darbuka', 'viola da gamba'])
    expect(
      extractInstruments('TrackType: Music, glass harmonica swells, contrabass drone, ambient pads'),
    ).toEqual(['glass harmonica', 'contrabass', 'drone', 'pad'])
    expect(
      extractInstruments('TrackType: Music, retro synthwave arpeggio, delicate wind chimes, and 80s rock guitar'),
    ).toEqual(['synth', 'chimes', 'electric guitar'])
  })

  it('prefers the longer name when one term contains another', () => {
    expect(extractInstruments('fingerpicked acoustic guitar')).toEqual(['acoustic guitar'])
    expect(extractInstruments('plucked strings')).toEqual(['strings'])
    expect(extractInstruments('taiko drums')).toEqual(['taiko'])
    expect(extractInstruments('hurdy gurdy')).toEqual(['hurdy-gurdy'])
  })

  it('dedupes aliases', () => {
    expect(extractInstruments('warm strings and plucked strings')).toEqual(['strings'])
  })

  it('returns nothing for sound-effect prompts', () => {
    expect(extractInstruments('TrackType: SFX, heavy tavern door')).toEqual([])
  })
})

describe('extractBpm', () => {
  it('extracts BPM number from music prompt', () => {
    expect(
      extractBpm('TrackType: Music, campaign main theme, French horn melody, 110 BPM, adventure'),
    ).toBe(110)
    expect(extractBpm('TrackType: Music, ruins ambient, 40 bpm, slow texture')).toBe(40)
  })

  it('returns undefined when no BPM is present', () => {
    expect(extractBpm('TrackType: SFX, steel sword draw')).toBeUndefined()
    expect(extractBpm('TrackType: Music, lute tavern theme')).toBeUndefined()
  })
})

describe('clipWavInfo', () => {
  it('tags ambience beds without instruments', () => {
    const info = clipWavInfo(
      'TrackType: SFX, heavy rain on cobblestone, steady bed',
      'ambience',
    )
    expect(info.genre).toBe('Ambience')
    expect(info.instruments).toEqual([])
    expect(info.title).toMatch(/heavy rain/i)
    expect(info.comment).toBe('TrackType: SFX, heavy rain on cobblestone, steady bed')
  })

  it('binds the full generate prompt, not a shortened title', () => {
    const prompt =
      'TrackType: SFX, polished steel shortsword drawn from a worn oiled leather scabbard, bright metallic ring, crisp attack, close mic, dry studio, fast decay. Length: 2 seconds'
    const info = clipWavInfo(prompt, 'sfx')
    expect(info.comment).toBe(prompt)
    expect(info.title!.length).toBeLessThan(prompt.length)
    expect(promptFromWavInfo(info)).toBe(prompt)
  })

  it('stamps generate knobs into ISFT so a rescan can recover them', () => {
    const info = clipWavInfo('sword clang', 'sfx', [], undefined, undefined, {
      seed: 7,
      cfg: 1,
      steps: 8,
      preset: 'speed',
      sampler: 'pingpong',
    })
    expect(info.software).toContain('seed=7')
    expect(info.software).toContain('preset=speed')
  })
})

describe('musicWavInfo', () => {
  it('builds INFO fields for the WAV tag', () => {
    const prompt = 'TrackType: Music, lute tavern theme'
    const info = musicWavInfo(prompt)
    expect(info.instruments).toEqual(['lute'])
    expect(info.comment).toBe(prompt)
    expect(info.genre).toBe('Instrumental')
    expect(info.software).toBe('Thunder FX')
    expect(info.title).toMatch(/lute tavern theme/i)
  })

  it('embeds category and intensity in INFO fields and keeps the full prompt in the comment', () => {
    const prompt = 'TrackType: Music, ancient ruins with duduk and harp'
    const info = musicWavInfo(prompt, ['duduk', 'harp'], 'Ancient Discovery', 'I')
    expect(info.instruments).toEqual(['duduk', 'harp'])
    expect(info.category).toBe('Ancient Discovery')
    expect(info.intensity).toBe('I')
    expect(info.comment).toBe(prompt)
    expect(promptFromWavInfo(info)).toBe(prompt)
  })
})

describe('promptFromWavInfo', () => {
  it('ignores leftover music metadata comments', () => {
    expect(
      promptFromWavInfo({
        title: 'lute tavern theme',
        comment: 'Category: Ancient Discovery · Intensity: I · Instruments: duduk, harp',
      }),
    ).toBe('lute tavern theme')
  })
})

