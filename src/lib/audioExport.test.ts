import { describe, expect, it } from 'vitest'
import { generateMockSfxWav, parseWav, wavDurationSeconds } from '@/lib/wav'
import {
  AUDIO_FORMATS,
  DEFAULT_EXPORT_FORMAT,
  downmixToMono,
  formatLabel,
  formatMime,
  formatNote,
  isLosslessFormat,
  prepareExportAudio,
  formatNeedsDesktop,
  isAudioFormat,
  prepareExportWav,
  resamplePcm,
  resolveDefaultFormat,
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

  it('recognises stored format strings and labels them', () => {
    expect(isAudioFormat('flac')).toBe(true)
    expect(isAudioFormat('opus')).toBe(true)
    expect(isAudioFormat('aiff')).toBe(true)
    expect(isAudioFormat('wma')).toBe(false)
    expect(isAudioFormat(undefined)).toBe(false)
    expect(formatLabel('mp3')).toBe('MP3 320')
    expect(formatLabel('opus')).toBe('Opus')
  })

  it('ships the typical formats and defaults to opus for size against quality', () => {
    expect([...AUDIO_FORMATS]).toEqual(['wav', 'aiff', 'flac', 'opus', 'ogg', 'mp3'])
    expect(DEFAULT_EXPORT_FORMAT).toBe('opus')
    expect(AUDIO_FORMATS.every((format) => formatNote(format).length > 0)).toBe(true)
    expect(AUDIO_FORMATS.every((format) => formatMime(format).startsWith('audio/'))).toBe(true)
  })

  it('separates lossless containers from the lossy encoders', () => {
    expect(AUDIO_FORMATS.filter(isLosslessFormat)).toEqual(['wav', 'aiff', 'flac'])
    // Only WAV is written in-process, so every other format needs the desktop app.
    expect(AUDIO_FORMATS.filter((format) => !formatNeedsDesktop(format))).toEqual(['wav'])
  })

  it('keeps the requested bit depth for lossless targets only', () => {
    const src = generateMockSfxWav(0.5, 5)
    const aiff = prepareExportAudio(src, {
      format: 'aiff',
      sampleRate: 44100,
      bitDepth: 24,
      mono: false,
    })
    expect(aiff.bitsPerSample).toBe(24)
    const opus = prepareExportAudio(src, {
      format: 'opus',
      sampleRate: 44100,
      bitDepth: 24,
      mono: false,
    })
    expect(opus.bitsPerSample).toBe(16)
  })

  it('keeps a desktop-only default on desktop and falls back to wav in the browser', () => {
    expect(resolveDefaultFormat('flac', true)).toBe('flac')
    expect(resolveDefaultFormat('flac', false)).toBe('wav')
    expect(resolveDefaultFormat('wav', false)).toBe('wav')
  })
})
