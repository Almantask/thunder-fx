import { describe, expect, it } from 'vitest'
import { generateMockSfxWav, parseWav, wavDurationSeconds } from '@/lib/wav'
import {
  downmixToMono,
  formatNeedsDesktop,
  prepareExportWav,
  resamplePcm,
} from '@/lib/audioExport'

describe('audioExport', () => {
  it('resamples 44.1 kHz stereo to 48 kHz 24-bit WAV', () => {
    const src = generateMockSfxWav(1, 4)
    const out = prepareExportWav(src, {
      format: 'wav',
      sampleRate: 48000,
      bitDepth: 24,
      mono: false,
    })
    const view = new DataView(out)
    expect(view.getUint32(24, true)).toBe(48000)
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint16(34, true)).toBe(24)
    expect(wavDurationSeconds(src)).toBeCloseTo(1, 2)
    const frames = view.getUint32(40, true) / (2 * 3)
    expect(frames).toBeCloseTo(48000, -2)
  })

  it('downmixes stereo to mono', () => {
    const src = parseWav(generateMockSfxWav(0.5, 2))
    const mono = downmixToMono(src.pcm, src.channels)
    expect(mono.length).toBe(src.pcm.length / 2)
  })

  it('resamplePcm length tracks the rate ratio', () => {
    const src = parseWav(generateMockSfxWav(1, 3))
    const out = resamplePcm(src.pcm, src.channels, 44100, 48000)
    expect(out.length / src.channels).toBeCloseTo(48000, -2)
  })

  it('marks compressed formats as desktop-only', () => {
    expect(formatNeedsDesktop('wav')).toBe(false)
    expect(formatNeedsDesktop('ogg')).toBe(true)
    expect(formatNeedsDesktop('flac')).toBe(true)
    expect(formatNeedsDesktop('mp3')).toBe(true)
  })
})
