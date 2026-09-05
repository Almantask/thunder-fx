import { parseWav, writeWav, type WavAudio } from '@/lib/wav'

export type AudioFormat = 'wav' | 'aiff' | 'flac' | 'opus' | 'ogg' | 'mp3'
export type SampleRateOption = 44100 | 48000
export type BitDepthOption = 16 | 24

export type ExportOptions = {
  format: AudioFormat
  sampleRate: SampleRateOption
  bitDepth: BitDepthOption
  mono: boolean
}

/** Lossless first, then lossy, each group ordered by how widely it is accepted. */
export const AUDIO_FORMATS: readonly AudioFormat[] = ['wav', 'aiff', 'flac', 'opus', 'ogg', 'mp3']

export const DESKTOP_ONLY_FORMATS: readonly AudioFormat[] = ['aiff', 'flac', 'opus', 'ogg', 'mp3']

/**
 * Opus holds transparent quality at roughly a third of an MP3 320 file, which
 * is why it is what a fresh install exports.
 */
export const DEFAULT_EXPORT_FORMAT: AudioFormat = 'opus'

const FORMAT_LABELS: Record<AudioFormat, string> = {
  wav: 'WAV',
  aiff: 'AIFF',
  flac: 'FLAC',
  opus: 'Opus',
  ogg: 'OGG Vorbis',
  mp3: 'MP3 320',
}

const FORMAT_NOTES: Record<AudioFormat, string> = {
  wav: 'Uncompressed PCM. The master every engine imports.',
  aiff: 'Uncompressed PCM for Apple and DAW pipelines.',
  flac: 'Lossless, about half the size of WAV.',
  opus: 'Best size for the quality. Always written at 48 kHz.',
  ogg: 'Vorbis. The lossy format Unity and Godot read natively.',
  mp3: '320 kbps CBR. Plays anywhere.',
}

export function formatNote(format: AudioFormat): string {
  return FORMAT_NOTES[format]
}

export function isLosslessFormat(format: AudioFormat): boolean {
  return format === 'wav' || format === 'aiff' || format === 'flac'
}

export function isAudioFormat(value: unknown): value is AudioFormat {
  return typeof value === 'string' && AUDIO_FORMATS.includes(value as AudioFormat)
}

export function formatLabel(format: AudioFormat): string {
  return FORMAT_LABELS[format]
}

export function formatNeedsDesktop(format: AudioFormat): boolean {
  return DESKTOP_ONLY_FORMATS.includes(format)
}

/**
 * The browser build can only write WAV, so a compressed default silently falls
 * back there instead of handing the user an export button that always fails.
 */
export function resolveDefaultFormat(format: AudioFormat, desktop: boolean): AudioFormat {
  if (!desktop && formatNeedsDesktop(format)) return 'wav'
  return format
}

const FORMAT_MIME: Record<AudioFormat, string> = {
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  flac: 'audio/flac',
  opus: 'audio/opus',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
}

export function formatMime(format: AudioFormat): string {
  return FORMAT_MIME[format] ?? 'audio/wav'
}

export function pcmToFloat(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i += 1) {
    out[i] = (pcm[i] ?? 0) / 32768
  }
  return out
}

export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0))
    out[i] = Math.round(v * 32767)
  }
  return out
}

export function downmixToMono(pcm: Int16Array, channels: number): Int16Array {
  if (channels <= 1) return new Int16Array(pcm)
  const frames = Math.floor(pcm.length / channels)
  const out = new Int16Array(frames)
  for (let f = 0; f < frames; f += 1) {
    let sum = 0
    for (let c = 0; c < channels; c += 1) {
      sum += pcm[f * channels + c] ?? 0
    }
    out[f] = Math.round(sum / channels)
  }
  return out
}

function resampleChannel(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.round(input.length / ratio))
  const out = new Float32Array(outLen)
  const last = input.length - 1
  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio
    const i0 = Math.min(last, Math.floor(src))
    const i1 = Math.min(last, i0 + 1)
    const frac = src - i0
    out[i] = (input[i0] ?? 0) * (1 - frac) + (input[i1] ?? 0) * frac
  }
  return out
}

export function resamplePcm(
  pcm: Int16Array,
  channels: number,
  fromRate: number,
  toRate: number,
): Int16Array {
  if (fromRate === toRate) return new Int16Array(pcm)
  const frames = Math.floor(pcm.length / channels)
  const floats = pcmToFloat(pcm)
  const resampled: Float32Array[] = []
  for (let c = 0; c < channels; c += 1) {
    const channel = new Float32Array(frames)
    for (let f = 0; f < frames; f += 1) {
      channel[f] = floats[f * channels + c] ?? 0
    }
    resampled.push(resampleChannel(channel, fromRate, toRate))
  }
  const outFrames = resampled[0]?.length ?? 0
  const interleaved = new Float32Array(outFrames * channels)
  for (let f = 0; f < outFrames; f += 1) {
    for (let c = 0; c < channels; c += 1) {
      interleaved[f * channels + c] = resampled[c]?.[f] ?? 0
    }
  }
  return floatToPcm16(interleaved)
}

export function prepareExportAudio(buffer: ArrayBuffer, options: ExportOptions): WavAudio {
  const wav = parseWav(buffer)
  let pcm = wav.pcm
  let channels = wav.channels
  if (options.mono && channels > 1) {
    pcm = downmixToMono(pcm, channels)
    channels = 1
  }
  if (options.sampleRate !== wav.sampleRate) {
    pcm = resamplePcm(pcm, channels, wav.sampleRate, options.sampleRate)
  }
  return {
    sampleRate: options.sampleRate,
    channels,
    bitsPerSample: isLosslessFormat(options.format) ? options.bitDepth : 16,
    pcm,
    info: wav.info,
  }
}

export function prepareExportWav(buffer: ArrayBuffer, options: ExportOptions): ArrayBuffer {
  return writeWav(prepareExportAudio(buffer, options))
}
