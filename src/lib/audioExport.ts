import { parseWav, writeWav, type WavAudio } from '@/lib/wav'

export type AudioFormat = 'wav' | 'aiff' | 'flac' | 'opus' | 'ogg' | 'mp3'
export type SampleRateOption = 44100 | 48000
export type BitDepthOption = 16 | 24

export type ExportOptions = {
  format: AudioFormat
  sampleRate: SampleRateOption
  bitDepth: BitDepthOption
  mono: boolean
  /** Opus and MP3, kbps. Ignored for lossless and Vorbis. */
  bitrateKbps?: number
  /** Vorbis quality 0–10. Ignored for other formats. */
  vorbisQuality?: number
}

/** Lossless first, then lossy, each group ordered by how widely it is accepted. */
export const AUDIO_FORMATS: readonly AudioFormat[] = ['wav', 'aiff', 'flac', 'opus', 'ogg', 'mp3']

export const DESKTOP_ONLY_FORMATS: readonly AudioFormat[] = ['aiff', 'flac', 'opus', 'ogg', 'mp3']

/**
 * Opus holds transparent quality at roughly a third of an MP3 320 file, which
 * is why it is what a fresh install exports.
 */
export const DEFAULT_EXPORT_FORMAT: AudioFormat = 'opus'
export const DEFAULT_OPUS_BITRATE_KBPS = 128
export const DEFAULT_VORBIS_QUALITY = 6
export const DEFAULT_MP3_BITRATE_KBPS = 320

const FORMAT_LABELS: Record<AudioFormat, string> = {
  wav: 'WAV',
  aiff: 'AIFF',
  flac: 'FLAC',
  opus: 'Opus',
  ogg: 'OGG Vorbis',
  mp3: 'MP3',
}

const FORMAT_NOTES: Record<AudioFormat, string> = {
  wav: 'Uncompressed PCM. The master every engine imports.',
  aiff: 'Uncompressed PCM for Apple and DAW pipelines.',
  flac: 'Lossless, about half the size of WAV.',
  opus: 'Best size for the quality. Always written at 48 kHz.',
  ogg: 'Vorbis. The lossy format Unity and Godot read natively.',
  mp3: 'CBR. Plays anywhere. Default is 320 kbps.',
}

export function formatNote(format: AudioFormat): string {
  return FORMAT_NOTES[format]
}

export function isLosslessFormat(format: AudioFormat): boolean {
  return format === 'wav' || format === 'aiff' || format === 'flac'
}

export function needsBitrate(format: AudioFormat): boolean {
  return format === 'opus' || format === 'mp3'
}

export function needsVorbisQuality(format: AudioFormat): boolean {
  return format === 'ogg'
}

export function defaultBitrateKbps(format: AudioFormat): number {
  return format === 'opus' ? DEFAULT_OPUS_BITRATE_KBPS : DEFAULT_MP3_BITRATE_KBPS
}

export function clampBitrateKbps(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OPUS_BITRATE_KBPS
  return Math.max(16, Math.min(512, Math.round(value)))
}

export function clampVorbisQuality(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VORBIS_QUALITY
  return Math.max(0, Math.min(10, Math.round(value)))
}

/** 24-bit export still only has 16-bit content until a float master ships. */
export function bitDepthLabel(bits: BitDepthOption): string {
  return bits === 24 ? '24-bit container (16-bit content)' : '16-bit'
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

/**
 * Windowed-sinc resampling.
 *
 * The old implementation was bare linear interpolation with no anti-alias
 * filter, so 44.1 -> 48 kHz folded everything near Nyquist back down into the
 * audible band. A Kaiser-windowed sinc kernel costs a little more arithmetic and
 * puts those images below -90 dB. The desktop build hands resampling to the
 * worker's torchaudio resampler, but the browser build has only this.
 */
const SINC_HALF_WIDTH = 16

function besselI0(x: number): number {
  // Series expansion; converges fast for the beta values used here.
  let sum = 1
  let term = 1
  for (let k = 1; k < 24; k += 1) {
    term *= (x / (2 * k)) ** 2
    sum += term
    if (term < sum * 1e-12) break
  }
  return sum
}

function resampleChannel(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.round(input.length / ratio))
  const out = new Float32Array(outLen)
  const last = input.length - 1

  // Downsampling has to move the cutoff below the *output* Nyquist; upsampling
  // keeps the source Nyquist.
  const cutoff = ratio > 1 ? 1 / ratio : 1
  const beta = 8.6 // ~ -90 dB stopband
  const halfWidth = Math.max(1, Math.round(SINC_HALF_WIDTH / cutoff))
  const denom = besselI0(beta)

  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio
    const centre = Math.floor(src)
    const frac = src - centre
    let acc = 0
    let norm = 0
    for (let k = -halfWidth + 1; k <= halfWidth; k += 1) {
      const idx = centre + k
      if (idx < 0 || idx > last) continue
      const x = k - frac
      const t = x / halfWidth
      if (t <= -1 || t >= 1) continue
      const px = Math.PI * x * cutoff
      const sinc = px === 0 ? cutoff : (Math.sin(px) / px) * cutoff
      const window = besselI0(beta * Math.sqrt(1 - t * t)) / denom
      const tap = sinc * window
      acc += (input[idx] ?? 0) * tap
      norm += tap
    }
    out[i] = norm > 0 ? acc / norm : 0
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
