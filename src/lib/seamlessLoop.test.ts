import { describe, expect, it } from 'vitest'
import { generateMockMusicWav, wavDurationSeconds } from '@/lib/wav'
import { makeSeamlessLoop } from '@/lib/seamlessLoop'

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
})
