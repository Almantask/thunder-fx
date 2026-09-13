import { describe, expect, it } from 'vitest'
import {
  PCM16_SCALE,
  findZeroCrossing,
  floatToPcm16,
  pcmToFloat,
  quantise16,
} from '@/lib/pcm'

describe('pcm mapping', () => {
  it('round-trips full-scale samples exactly', () => {
    const pcm = new Int16Array([-32768, -1, 0, 1, 32767])
    const floats = pcmToFloat(pcm)
    expect(floats[0]).toBe(-1)
    expect(floatToPcm16(floats, false)).toEqual(pcm)
  })

  it('clamps +1.0 to 32767 and keeps −1.0 as −32768', () => {
    expect(quantise16(1, false)).toBe(32767)
    expect(quantise16(-1, false)).toBe(-32768)
    expect(quantise16(1.5, false)).toBe(32767)
  })

  it('uses 32768 in both directions so a unit sample is not attenuated', () => {
    expect(quantise16(1 / PCM16_SCALE, false)).toBe(1)
    expect(pcmToFloat(new Int16Array([1]))[0]).toBeCloseTo(1 / PCM16_SCALE)
  })

  it('leaves digital silence undithered and dithers a half-LSB tone', () => {
    const silence = new Float32Array(64)
    expect([...floatToPcm16(silence)]).toEqual(Array(64).fill(0))

    const halfLsb = new Float32Array(256).fill(0.5 / PCM16_SCALE)
    const values = new Set(floatToPcm16(halfLsb))
    expect(values.size).toBeGreaterThan(1)
  })
})

describe('findZeroCrossing', () => {
  it('picks a sign change rather than a same-sign trough', () => {
    const pcm = new Int16Array(40)
    for (let i = 0; i < 40; i += 1) pcm[i] = 8000
    pcm[3] = 1
    pcm[10] = 8000
    pcm[11] = -8000
    // Stereo interleaved: duplicate onto right.
    const stereo = new Int16Array(40 * 2)
    for (let f = 0; f < 40; f += 1) {
      stereo[f * 2] = pcm[f] ?? 0
      stereo[f * 2 + 1] = pcm[f] ?? 0
    }
    expect(findZeroCrossing(stereo, 2, 0, 40, 15)).toBe(10)
  })

  it('prefers a quiet crossing over a nearby loud sign flip', () => {
    const stereo = new Int16Array(40 * 2)
    for (let f = 0; f < 40; f += 1) {
      stereo[f * 2] = 8000
      stereo[f * 2 + 1] = 8000
    }
    stereo[5 * 2] = 8000
    stereo[5 * 2 + 1] = 8000
    stereo[6 * 2] = -8000
    stereo[6 * 2 + 1] = -8000
    stereo[12 * 2] = 30
    stereo[12 * 2 + 1] = 30
    stereo[13 * 2] = -30
    stereo[13 * 2 + 1] = -30
    expect(findZeroCrossing(stereo, 2, 4, 40, 15)).toBe(12)
    expect(findZeroCrossing(stereo, 2, 4, 40, 15, undefined, { pick: 'end' })).toBe(13)
  })
})
