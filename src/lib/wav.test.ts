import { describe, expect, it } from 'vitest'
import { generateMockSfxWav, parseWav, trimWav, wavDurationSeconds } from '@/lib/wav'

describe('wav', () => {
  it('writes a 44.1 kHz stereo 16-bit WAVE of the requested length', () => {
    const buf = generateMockSfxWav(2, 7)
    const wav = parseWav(buf)
    expect(wav.sampleRate).toBe(44100)
    expect(wav.channels).toBe(2)
    expect(wav.bitsPerSample).toBe(16)
    expect(wavDurationSeconds(buf)).toBeCloseTo(2, 2)
  })

  it('trims to the export region', () => {
    const buf = generateMockSfxWav(4, 3)
    const trimmed = trimWav(buf, 1, 2.5)
    expect(wavDurationSeconds(trimmed)).toBeCloseTo(1.5, 1)
  })

  it('is deterministic for a given seed', () => {
    const a = new Uint8Array(generateMockSfxWav(1, 99))
    const b = new Uint8Array(generateMockSfxWav(1, 99))
    expect(a).toEqual(b)
  })
})
