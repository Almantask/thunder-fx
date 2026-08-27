import { describe, expect, it } from 'vitest'
import {
  GENERATE_MODES,
  applyGenerateMode,
  applyModeCfg,
  applyModeDuration,
  applyModeNegative,
  ensureTrackType,
  inferGenerateMode,
} from '@/lib/generateMode'


describe('inferGenerateMode', () => {
  it('detects music from TrackType', () => {
    expect(inferGenerateMode('TrackType: Music, lute theme')).toBe('music')
  })

  it('defaults to sound effects', () => {
    expect(inferGenerateMode('TrackType: SFX, tavern door')).toBe('sfx')
    expect(inferGenerateMode('tavern door')).toBe('sfx')
  })
})

describe('applyGenerateMode', () => {
  it('fills an empty prompt with the mode prefix', () => {
    expect(applyGenerateMode('', 'music')).toBe('TrackType: Music')
    expect(applyGenerateMode('  ', 'sfx')).toBe('TrackType: SFX')
  })

  it('swaps an existing TrackType prefix', () => {
    expect(applyGenerateMode('TrackType: SFX, tavern lute', 'music')).toBe(
      'TrackType: Music, tavern lute',
    )
  })

  it('leaves free text alone until generate', () => {
    expect(applyGenerateMode('lute theme', 'music')).toBe('lute theme')
  })
})

describe('ensureTrackType', () => {
  it('prefixes a free-text music prompt', () => {
    expect(ensureTrackType('lute theme', 'music')).toBe('TrackType: Music, lute theme')
  })

  it('replaces a mismatched TrackType', () => {
    expect(ensureTrackType('TrackType: SFX, lute theme', 'music')).toBe(
      'TrackType: Music, lute theme',
    )
  })
})

describe('applyModeNegative', () => {
  it('installs the music default when the field is empty or the previous default', () => {
    expect(applyModeNegative('', 'sfx', 'music')).toBe(GENERATE_MODES.music.defaultNegative)
    expect(applyModeNegative(GENERATE_MODES.sfx.defaultNegative, 'sfx', 'music')).toBe(
      GENERATE_MODES.music.defaultNegative,
    )
  })

  it('keeps a custom negative', () => {
    expect(applyModeNegative('rain, wind', 'sfx', 'music')).toBe('rain, wind')
  })
})

describe('applyModeDuration', () => {
  it('moves from the sound-effect default to the instrumental default', () => {
    expect(applyModeDuration(8, 'sfx', 'music')).toBe(20)
    expect(applyModeDuration(20, 'music', 'sfx')).toBe(8)
  })

  it('leaves a custom duration alone', () => {
    expect(applyModeDuration(12, 'sfx', 'music')).toBe(12)
  })
})

describe('applyModeCfg', () => {
  it('swaps default CFG between modes', () => {
    expect(applyModeCfg(4.0, 'sfx', 'music')).toBe(3.0)
    expect(applyModeCfg(3.0, 'music', 'sfx')).toBe(4.0)
  })

  it('leaves custom CFG alone', () => {
    expect(applyModeCfg(5.5, 'sfx', 'music')).toBe(5.5)
  })
})

