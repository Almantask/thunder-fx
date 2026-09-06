import { describe, expect, it } from 'vitest'
import { resamplePcm } from '@/lib/audioExport'
import { writeWav } from '@/lib/wav'

function tone(freq: number, rate: number, seconds: number): Int16Array {
  const frames = Math.round(rate * seconds)
  const pcm = new Int16Array(frames)
  for (let i = 0; i < frames; i += 1) {
    pcm[i] = Math.round(0.5 * Math.sin((2 * Math.PI * freq * i) / rate) * 32767)
  }
  return pcm
}

/** Naive DFT magnitude at one frequency — enough to spot an alias. */
function magnitudeAt(pcm: Int16Array, rate: number, freq: number): number {
  let re = 0
  let im = 0
  for (let i = 0; i < pcm.length; i += 1) {
    const w = (2 * Math.PI * freq * i) / rate
    const s = (pcm[i] ?? 0) / 32768
    re += s * Math.cos(w)
    im -= s * Math.sin(w)
  }
  return Math.hypot(re, im) / pcm.length
}

describe('resamplePcm', () => {
  it('keeps a mid-band tone and does not fold it', () => {
    const rate = 44100
    const out = resamplePcm(tone(1000, rate, 0.5), 1, rate, 48000)
    expect(out.length).toBeCloseTo(Math.round((rate * 0.5 * 48000) / rate), -2)
    const signal = magnitudeAt(out, 48000, 1000)
    expect(signal).toBeGreaterThan(0.15)
  })

  it('does not fold a near-Nyquist tone into the audible band', () => {
    // Linear interpolation imaged 20 kHz badly on the way to 48 kHz; a
    // windowed-sinc kernel has to keep the audible band clean.
    const out = resamplePcm(tone(20000, 44100, 0.5), 1, 44100, 48000)
    const signal = magnitudeAt(out, 48000, 20000)
    const alias = Math.max(
      magnitudeAt(out, 48000, 4000),
      magnitudeAt(out, 48000, 8000),
      magnitudeAt(out, 48000, 12000),
    )
    expect(signal).toBeGreaterThan(0.05)
    expect(20 * Math.log10(alias / signal)).toBeLessThan(-60)
  })

  it('is a no-op at the same rate', () => {
    const input = tone(1000, 44100, 0.05)
    const out = resamplePcm(input, 1, 44100, 44100)
    expect(Array.from(out)).toEqual(Array.from(input))
  })

  it('round-trips through writeWav at the new rate', () => {
    const out = resamplePcm(tone(1000, 44100, 0.1), 1, 44100, 48000)
    const buffer = writeWav({ sampleRate: 48000, channels: 1, bitsPerSample: 16, pcm: out })
    expect(buffer.byteLength).toBeGreaterThan(44)
  })
})
