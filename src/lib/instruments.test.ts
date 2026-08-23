import { describe, expect, it } from 'vitest'
import { extractInstruments, musicWavInfo } from '@/lib/instruments'

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
  })

  it('prefers the longer name when one term contains another', () => {
    expect(extractInstruments('fingerpicked acoustic guitar')).toEqual(['acoustic guitar'])
    expect(extractInstruments('plucked strings')).toEqual(['strings'])
  })

  it('dedupes aliases', () => {
    expect(extractInstruments('warm strings and plucked strings')).toEqual(['strings'])
  })

  it('returns nothing for sound-effect prompts', () => {
    expect(extractInstruments('TrackType: SFX, heavy tavern door')).toEqual([])
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
