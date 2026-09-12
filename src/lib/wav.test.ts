/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { generateMockMusicWav, generateMockSfxWav, parseWav, tagMusicWav, trimWav, wavDurationSeconds } from '@/lib/wav'
import { musicWavInfo } from '@/lib/instruments'

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

  it('writes a sustaining instrumental mock that is not an impact tail', () => {
    const music = generateMockMusicWav(1, 99)
    const sfx = generateMockSfxWav(1, 99)
    expect(wavDurationSeconds(music)).toBeCloseTo(1, 2)
    expect([...new Uint8Array(music)]).not.toEqual([...new Uint8Array(sfx)])
    const parsed = parseWav(music)
    const last = parsed.pcm.subarray(parsed.pcm.length - 4410)
    let peak = 0
    for (let i = 0; i < last.length; i += 1) peak = Math.max(peak, Math.abs(last[i] ?? 0))
    expect(peak).toBeGreaterThan(2000)
  })

  it('embeds instruments in RIFF INFO and keeps them after trim', () => {
    const tagged = tagMusicWav(
      generateMockMusicWav(1, 5),
      musicWavInfo('TrackType: Music, lute and cello'),
    )
    const parsed = parseWav(tagged)
    expect(parsed.info?.instruments).toEqual(['lute', 'cello'])
    expect(parsed.info?.comment).toBe('TrackType: Music, lute and cello')
    expect(parsed.info?.software).toBe('Thunder FX')
    const trimmed = parseWav(trimWav(tagged, 0, 0.5))
    expect(trimmed.info?.instruments).toEqual(['lute', 'cello'])
    expect(wavDurationSeconds(trimWav(tagged, 0, 0.5))).toBeCloseTo(0.5, 1)
  })

  it('embeds category, intensity, and instruments in RIFF INFO chunks', () => {
    const tagged = tagMusicWav(
      generateMockMusicWav(1, 10),
      musicWavInfo(
        'TrackType: Music, misty mountains with flute and harp',
        ['flute', 'harp'],
        'Mountain Mist',
        'II',
      ),
    )
    const parsed = parseWav(tagged)
    expect(parsed.info?.instruments).toEqual(['flute', 'harp'])
    expect(parsed.info?.category).toBe('Mountain Mist')
    expect(parsed.info?.intensity).toBe('II')
    expect(parsed.info?.comment).toBe(
      'TrackType: Music, misty mountains with flute and harp',
    )
    expect(parsed.info?.genre).toBe('Instrumental')
    expect(parsed.info?.software).toBe('Thunder FX')

    const trimmed = parseWav(trimWav(tagged, 0, 0.5))
    expect(trimmed.info?.category).toBe('Mountain Mist')
    expect(trimmed.info?.intensity).toBe('II')
    expect(trimmed.info?.instruments).toEqual(['flute', 'harp'])
  })
})
