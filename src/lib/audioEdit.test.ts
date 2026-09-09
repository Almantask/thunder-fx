import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PEAK_DBFS,
  applyFade,
  applyGainDb,
  clampDb,
  clampSemitones,
  dbToGain,
  layerWavs,
  normalizePeak,
  peakDbfs,
  pitchShiftWav,
  reverseWav,
  rmsDbfs,
  variantSemitones,
  variantSuffix,
} from '@/lib/audioEdit'
import { sanitizeClipStem } from '@/lib/filename'
import { parseWav, writeWav, SAMPLE_RATE } from '@/lib/wav'

/** A constant-amplitude tone, so level maths is easy to assert against. */
function tone(seconds: number, amplitude = 0.5, channels = 2, rate = SAMPLE_RATE): ArrayBuffer {
  const frames = Math.round(seconds * rate)
  const pcm = new Int16Array(frames * channels)
  for (let f = 0; f < frames; f += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * f) / rate) * amplitude * 32767)
    for (let c = 0; c < channels; c += 1) pcm[f * channels + c] = value
  }
  return writeWav({ sampleRate: rate, channels, bitsPerSample: 16, pcm })
}

/** A ramp from 0 up to full scale, so frame order is visible in the samples. */
function ramp(frames: number, channels = 2): ArrayBuffer {
  const pcm = new Int16Array(frames * channels)
  for (let f = 0; f < frames; f += 1) {
    for (let c = 0; c < channels; c += 1) {
      pcm[f * channels + c] = Math.round((f / (frames - 1)) * 30000)
    }
  }
  return writeWav({ sampleRate: SAMPLE_RATE, channels, bitsPerSample: 16, pcm })
}

function frames(buffer: ArrayBuffer): number {
  const wav = parseWav(buffer)
  return wav.pcm.length / wav.channels
}

/**
 * Loudest sample in a window around `atSec`. Reading one sample of a 440 Hz
 * tone can land on a zero crossing and say "silent" about audio that is not.
 */
function peakAround(buffer: ArrayBuffer, atSec: number, windowSec = 0.01): number {
  const wav = parseWav(buffer)
  const total = Math.floor(wav.pcm.length / wav.channels)
  const centre = Math.round(atSec * wav.sampleRate)
  const half = Math.max(1, Math.round((windowSec * wav.sampleRate) / 2))
  let peak = 0
  for (let f = Math.max(0, centre - half); f < Math.min(total, centre + half); f += 1) {
    const magnitude = Math.abs(wav.pcm[f * wav.channels] ?? 0)
    if (magnitude > peak) peak = magnitude
  }
  return peak
}

describe('applyFade', () => {
  it('starts a fade-in near silence and reaches full level by its end', () => {
    const faded = applyFade(tone(1), { fadeInSec: 0.5 })
    expect(peakAround(faded, 0.001)).toBeLessThan(400)
    // Past the ramp, the tone is back at its original 0.5 amplitude.
    expect(peakAround(faded, 0.9)).toBeGreaterThan(0.4 * 32767)
  })

  it('ends a fade-out at silence', () => {
    const faded = applyFade(tone(1), { fadeOutSec: 0.5 })
    expect(peakAround(faded, 0.999)).toBeLessThan(400)
    expect(peakAround(faded, 0.1)).toBeGreaterThan(0.4 * 32767)
  })

  it('leaves length and channel count untouched', () => {
    const source = tone(1)
    const faded = applyFade(source, { fadeInSec: 0.2, fadeOutSec: 0.2 })
    expect(frames(faded)).toBe(frames(source))
    expect(parseWav(faded).channels).toBe(2)
  })

  it('returns the input unchanged when neither fade is asked for', () => {
    const source = tone(0.2)
    expect(applyFade(source, {})).toBe(source)
  })

  it('shares the clip between two fades that would otherwise overlap', () => {
    // Two 5s fades on a 1s clip: the result must still be exactly 1s, and must
    // not double-attenuate into a hole in the middle.
    const faded = applyFade(tone(1), { fadeInSec: 5, fadeOutSec: 5 })
    expect(frames(faded)).toBe(frames(tone(1)))
    // The two ramps meet at the midpoint, so that is where the clip is loudest
    // — not a hole where both attenuated the same samples.
    expect(peakAround(faded, 0.5)).toBeGreaterThan(peakAround(faded, 0.1))
    expect(peakAround(faded, 0.5)).toBeGreaterThan(peakAround(faded, 0.9))
  })
})

describe('reverseWav', () => {
  it('puts the last frame first', () => {
    const source = ramp(100)
    const original = parseWav(source)
    const reversed = parseWav(reverseWav(source))
    expect(reversed.pcm[0]).toBe(original.pcm[99 * 2])
    expect(reversed.pcm[99 * 2]).toBe(original.pcm[0])
  })

  it('is its own inverse', () => {
    const source = ramp(64)
    const twice = parseWav(reverseWav(reverseWav(source)))
    expect([...twice.pcm]).toEqual([...parseWav(source).pcm])
  })

  it('keeps left and right in the same frame rather than swapping them', () => {
    const pcm = new Int16Array([100, -100, 200, -200, 300, -300])
    const source = writeWav({ sampleRate: SAMPLE_RATE, channels: 2, bitsPerSample: 16, pcm })
    expect([...parseWav(reverseWav(source)).pcm]).toEqual([300, -300, 200, -200, 100, -100])
  })
})

describe('applyGainDb', () => {
  it('doubles amplitude at +6 dB', () => {
    const source = tone(0.1, 0.25)
    const before = peakDbfs(source)
    const after = peakDbfs(applyGainDb(source, 6))
    expect(after - before).toBeCloseTo(6, 0)
  })

  it('clamps rather than wrapping when the gain would overflow', () => {
    const loud = applyGainDb(tone(0.1, 0.9), 24)
    const wav = parseWav(loud)
    for (const sample of wav.pcm) {
      expect(sample).toBeGreaterThanOrEqual(-32768)
      expect(sample).toBeLessThanOrEqual(32767)
    }
  })

  it('is a no-op at 0 dB', () => {
    const source = tone(0.1)
    expect(applyGainDb(source, 0)).toBe(source)
  })

  it('clamps the requested amount to the supported range', () => {
    expect(clampDb(999)).toBe(24)
    expect(clampDb(-999)).toBe(-24)
    expect(clampDb(Number.NaN)).toBe(0)
  })
})

describe('normalizePeak', () => {
  it('brings a quiet clip up as well as a loud one down', () => {
    expect(peakDbfs(normalizePeak(tone(0.2, 0.05)))).toBeCloseTo(DEFAULT_PEAK_DBFS, 1)
    expect(peakDbfs(normalizePeak(tone(0.2, 0.99)))).toBeCloseTo(DEFAULT_PEAK_DBFS, 1)
  })

  it('leaves a near-silent clip alone instead of amplifying its noise floor', () => {
    const pcm = new Int16Array(1000)
    pcm[10] = 4
    const quiet = writeWav({ sampleRate: SAMPLE_RATE, channels: 2, bitsPerSample: 16, pcm })
    expect(normalizePeak(quiet)).toBe(quiet)
  })

  it('leaves true digital silence alone', () => {
    const silence = writeWav({
      sampleRate: SAMPLE_RATE,
      channels: 2,
      bitsPerSample: 16,
      pcm: new Int16Array(500),
    })
    expect(normalizePeak(silence)).toBe(silence)
  })
})

describe('pitchShiftWav', () => {
  it('shortens the clip when pitched up', () => {
    const source = tone(1)
    const up = pitchShiftWav(source, 12)
    // One octave up halves the duration on a resampling shift.
    expect(frames(up) / frames(source)).toBeCloseTo(0.5, 1)
  })

  it('lengthens the clip when pitched down', () => {
    const source = tone(1)
    expect(frames(pitchShiftWav(source, -12)) / frames(source)).toBeCloseTo(2, 1)
  })

  it('is a no-op at zero semitones', () => {
    const source = tone(0.2)
    expect(pitchShiftWav(source, 0)).toBe(source)
  })

  it('clamps a shift beyond one octave in either direction', () => {
    expect(clampSemitones(48)).toBe(12)
    expect(clampSemitones(-48)).toBe(-12)
  })

  it('keeps the sample rate, so the file still plays at the right speed', () => {
    expect(parseWav(pitchShiftWav(tone(0.5), 5)).sampleRate).toBe(SAMPLE_RATE)
  })
})

describe('variantSemitones', () => {
  it('returns the requested number of offsets', () => {
    expect(variantSemitones(3, 2)).toHaveLength(3)
    expect(variantSemitones(5, 3)).toHaveLength(5)
  })

  it('never returns an unshifted variant, which would duplicate the original', () => {
    for (const count of [1, 2, 3, 4, 5, 6]) {
      expect(variantSemitones(count, 2)).not.toContain(0)
    }
  })

  it('stays inside the requested spread', () => {
    for (const offset of variantSemitones(4, 2)) {
      expect(Math.abs(offset)).toBeLessThanOrEqual(2)
    }
  })
})

describe('variantSuffix', () => {
  it('names an upward and a downward shift', () => {
    expect(variantSuffix(2)).toBe('up2')
    expect(variantSuffix(-2)).toBe('dn2')
  })

  it('avoids a dot, which a filename would read as the extension', () => {
    expect(variantSuffix(-1.5)).toBe('dn1_5')
    expect(variantSuffix(1.25)).toBe('up1_25')
  })

  it('produces a suffix that survives file-stem sanitising unchanged', () => {
    for (const offset of variantSemitones(5, 3)) {
      const suffix = variantSuffix(offset)
      expect(suffix).not.toContain('.')
      expect(sanitizeClipStem(`clip-${suffix}`)).toBe(`clip-${suffix}`)
    }
  })
})

describe('layerWavs', () => {
  it('runs as long as the later clip ends', () => {
    const long = layerWavs(tone(1), tone(1), { offsetSec: 0.5 })
    expect(frames(long) / SAMPLE_RATE).toBeCloseTo(1.5, 1)
  })

  it('keeps the base length when the overlay fits inside it', () => {
    expect(frames(layerWavs(tone(2), tone(0.5)))).toBe(frames(tone(2)))
  })

  it('normalizes the sum instead of returning a clipped file', () => {
    const hot = layerWavs(tone(0.3, 0.9), tone(0.3, 0.9))
    expect(peakDbfs(hot)).toBeLessThanOrEqual(DEFAULT_PEAK_DBFS + 0.1)
  })

  it('can be told not to normalize', () => {
    const raw = layerWavs(tone(0.3, 0.9), tone(0.3, 0.9), { normalize: false })
    expect(peakDbfs(raw)).toBeGreaterThan(DEFAULT_PEAK_DBFS)
  })

  it('applies the overlay gain', () => {
    const quiet = layerWavs(tone(0.3, 0.1), tone(0.3, 0.4), {
      gainDb: -24,
      normalize: false,
    })
    const loud = layerWavs(tone(0.3, 0.1), tone(0.3, 0.4), { gainDb: 0, normalize: false })
    expect(peakDbfs(quiet)).toBeLessThan(peakDbfs(loud))
  })

  it('refuses to layer mismatched sample rates rather than detuning one clip', () => {
    expect(() => layerWavs(tone(0.2, 0.5, 2, 44100), tone(0.2, 0.5, 2, 48000))).toThrow(
      /same rate/i,
    )
  })

  it('spreads a mono overlay across both channels of a stereo base', () => {
    const layered = parseWav(
      layerWavs(tone(0.2, 0.2, 2), tone(0.2, 0.4, 1), { normalize: false }),
    )
    expect(layered.channels).toBe(2)
    expect(Math.abs(layered.pcm[200] ?? 0)).toBeGreaterThan(0)
    expect(Math.abs(layered.pcm[201] ?? 0)).toBeGreaterThan(0)
  })
})

describe('level measurement', () => {
  it('reads a full-scale clip as roughly 0 dBFS', () => {
    expect(peakDbfs(tone(0.2, 1))).toBeCloseTo(0, 0)
  })

  it('reports silence as -Infinity rather than a very small number', () => {
    const silence = writeWav({
      sampleRate: SAMPLE_RATE,
      channels: 2,
      bitsPerSample: 16,
      pcm: new Int16Array(100),
    })
    expect(peakDbfs(silence)).toBe(-Infinity)
    expect(rmsDbfs(silence)).toBe(-Infinity)
  })

  it('puts the RMS of a sine about 3 dB under its peak', () => {
    const source = tone(0.5, 0.5)
    expect(peakDbfs(source) - rmsDbfs(source)).toBeCloseTo(3, 0)
  })

  it('converts dB to gain', () => {
    expect(dbToGain(0)).toBeCloseTo(1)
    expect(dbToGain(6)).toBeCloseTo(2, 1)
    expect(dbToGain(-6)).toBeCloseTo(0.5, 1)
  })
})
