import { describe, expect, it } from 'vitest'
import { generateMockSfxWav, writeWav } from '@/lib/wav'
import { detectSilenceBounds } from '@/lib/silenceTrim'

function silentThenHit(): ArrayBuffer {
  const sampleRate = 44100
  const channels = 2
  const frames = sampleRate
  const pcm = new Int16Array(frames * channels)
  const start = Math.floor(sampleRate * 0.2)
  const end = Math.floor(sampleRate * 0.45)
  for (let i = start; i < end; i += 1) {
    const v = 12000
    pcm[i * 2] = v
    pcm[i * 2 + 1] = v
  }
  return writeWav({ sampleRate, channels, bitsPerSample: 16, pcm })
}

describe('silenceTrim', () => {
  it('snaps In/Out past leading and trailing silence with pad', () => {
    const bounds = detectSilenceBounds(silentThenHit(), { thresholdDb: -42, padMs: 30 })
    expect(bounds.startSec).toBeGreaterThan(0.1)
    expect(bounds.startSec).toBeLessThan(0.2)
    expect(bounds.endSec).toBeGreaterThan(0.45)
    expect(bounds.endSec).toBeLessThan(0.55)
  })

  it('returns the full clip when the buffer is silent', () => {
    const pcm = new Int16Array(44100 * 2)
    const buf = writeWav({ sampleRate: 44100, channels: 2, bitsPerSample: 16, pcm })
    const bounds = detectSilenceBounds(buf)
    expect(bounds.startSec).toBe(0)
    expect(bounds.endSec).toBeCloseTo(1, 2)
  })

  it('keeps a dense mock hit from the start', () => {
    const bounds = detectSilenceBounds(generateMockSfxWav(1, 7), { padMs: 20 })
    expect(bounds.startSec).toBeLessThan(0.05)
    expect(bounds.endSec).toBeGreaterThan(0.2)
  })

  it('hears a hard-panned right-channel hit', () => {
    const sampleRate = 44100
    const pcm = new Int16Array(sampleRate * 2)
    const start = Math.floor(sampleRate * 0.3)
    const end = Math.floor(sampleRate * 0.5)
    for (let i = start; i < end; i += 1) {
      pcm[i * 2 + 1] = 12000
    }
    const buf = writeWav({ sampleRate, channels: 2, bitsPerSample: 16, pcm })
    const bounds = detectSilenceBounds(buf, { thresholdDb: -42, padMs: 30 })
    expect(bounds.startSec).toBeGreaterThan(0.2)
    expect(bounds.startSec).toBeLessThan(0.3)
    expect(bounds.endSec).toBeGreaterThan(0.5)
    expect(bounds.endSec).toBeLessThan(0.6)
  })
})
