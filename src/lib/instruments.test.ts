import { describe, expect, it } from 'vitest'
import { clipWavInfo, extractBpm, extractInstruments, musicWavInfo } from '@/lib/instruments'

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
  })
})

describe('musicWavInfo', () => {
  it('builds INFO fields for the WAV tag', () => {
    const info = musicWavInfo('TrackType: Music, lute tavern theme')
    expect(info.instruments).toEqual(['lute'])
    expect(info.comment).toBe('Instruments: lute')
    expect(info.genre).toBe('Instrumental')
    expect(info.software).toBe('Thunder FX')
    expect(info.title).toMatch(/lute tavern theme/i)
  })

  it('embeds category and intensity in INFO fields and comment', () => {
    const info = musicWavInfo(
      'TrackType: Music, ancient ruins with duduk and harp',
      ['duduk', 'harp'],
      'Ancient Discovery',
      'Level I — Quiet looping bed',
    )
    expect(info.instruments).toEqual(['duduk', 'harp'])
    expect(info.category).toBe('Ancient Discovery')
    expect(info.intensity).toBe('Level I — Quiet looping bed')
    expect(info.comment).toBe(
      'Category: Ancient Discovery · Intensity: Level I — Quiet looping bed · Instruments: duduk, harp',
    )
  })
})

