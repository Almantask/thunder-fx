/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { generateMockMusicWav, wavDurationSeconds } from '@/lib/wav'
import { loopOverlapSeconds, loopWrapJump, makeSeamlessLoop } from '@/lib/seamlessLoop'

describe('seamlessLoop', () => {
  it('shortens the clip by the crossfade window', () => {
    const src = generateMockMusicWav(4, 11)
    const looped = makeSeamlessLoop(src, 1)
    expect(wavDurationSeconds(looped)).toBeCloseTo(3, 1)
  })

  it('is deterministic', () => {
    const src = generateMockMusicWav(3, 5)
    const a = new Uint8Array(makeSeamlessLoop(src, 0.5))
    const b = new Uint8Array(makeSeamlessLoop(src, 0.5))
    expect(a).toEqual(b)
  })

  it('makes the wrap quieter than an unprocessed clip', () => {
    const src = generateMockMusicWav(4, 11)
    const looped = makeSeamlessLoop(src, 1)
    expect(loopWrapJump(looped)).toBeLessThan(loopWrapJump(src))
  })
})

describe('loopOverlapSeconds', () => {
  it('uses a longer blend on long beds and a floor on short clips', () => {
    expect(loopOverlapSeconds(20)).toBe(1)
    expect(loopOverlapSeconds(90)).toBe(3)
    expect(loopOverlapSeconds(8)).toBe(0.5)
  })
})
