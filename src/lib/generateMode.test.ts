import { describe, expect, it } from 'vitest'
import {
  FIXED_CFG,
  GENERATE_MODES,
  LOOP_NEGATIVE_CUE,
  LOOP_PROMPT_CUE,
  applyGenerateMode,
  applyModeDuration,
  applyModeNegative,
  applyModeSteps,
  ensureLoopNegative,
  ensureLoopPrompt,
  ensureTrackType,
  inferGenerateMode,
  promptLooksLoopable,
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
    expect(applyModeDuration(5, 'sfx', 'music')).toBe(20)
    expect(applyModeDuration(20, 'music', 'sfx')).toBe(5)
  })

  it('leaves a custom duration alone', () => {
    expect(applyModeDuration(12, 'sfx', 'music')).toBe(12)
  })
})

describe('FIXED_CFG', () => {
  it('locks Medium at CFG 1', () => {
    expect(FIXED_CFG).toBe(1)
  })
})

describe('applyModeSteps', () => {
  it('swaps default steps between modes', () => {
    expect(applyModeSteps(20, 'sfx', 'music')).toBe(25)
    expect(applyModeSteps(25, 'music', 'sfx')).toBe(20)
  })

  it('leaves custom steps alone', () => {
    expect(applyModeSteps(32, 'sfx', 'music')).toBe(32)
  })
})

describe('promptLooksLoopable', () => {
  it('detects looping beds and ignores one-shots', () => {
    expect(promptLooksLoopable('TrackType: Music, looping tavern lute bed')).toBe(true)
    expect(promptLooksLoopable('steady texture with no ending, looping-friendly')).toBe(true)
    expect(promptLooksLoopable('TrackType: Music, heroic brass fanfare')).toBe(false)
  })
})

describe('ensureLoopPrompt', () => {
  it('asks the model to start and end the same way', () => {
    expect(ensureLoopPrompt('TrackType: Music, lute theme')).toBe(
      `TrackType: Music, lute theme, ${LOOP_PROMPT_CUE}`,
    )
  })

  it('does not duplicate an existing loop cue', () => {
    const once = ensureLoopPrompt('TrackType: Music, drone, looping-friendly')
    expect(once).toContain(LOOP_PROMPT_CUE)
    expect(ensureLoopPrompt(once)).toBe(once)
  })
})

describe('ensureLoopNegative', () => {
  it('avoids fade-in and fade-out on looped beds', () => {
    expect(ensureLoopNegative(GENERATE_MODES.music.defaultNegative)).toContain(LOOP_NEGATIVE_CUE)
  })

  it('does not duplicate fade cues', () => {
    const once = ensureLoopNegative('vocals')
    expect(ensureLoopNegative(once)).toBe(once)
  })
})