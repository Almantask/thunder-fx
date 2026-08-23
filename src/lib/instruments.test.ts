import { describe, expect, it } from 'vitest'
import { extractBpm, extractInstruments, musicWavInfo } from '@/lib/instruments'

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

describe('musicWavInfo', () => {
  it('builds INFO fields for the WAV tag', () => {
    const info = musicWavInfo('TrackType: Music, lute tavern theme')
    expect(info.instruments).toEqual(['lute'])
    expect(info.comment).toBe('Instruments: lute')
    expect(info.genre).toBe('Instrumental')
    expect(info.software).toBe('Thunder FX')
    expect(info.title).toMatch(/lute tavern theme/i)
  })
})

