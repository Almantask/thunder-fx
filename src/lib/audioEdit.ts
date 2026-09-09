/**
 * Post-generation shaping: fades, reverse, gain, normalize, pitch and layering.
 *
 * These cost no GPU time, which is the point — one render becomes a usable
 * asset, or a set of them. Everything here takes a WAV `ArrayBuffer` and gives
 * one back, matching `wav.ts` and `seamlessLoop.ts`, so edits compose and the
 * result drops straight into playback, export or the library.
 *
 * All maths runs in float and is rounded once at the end. Chaining transforms
 * that each quantized to int16 would accumulate rounding noise in a way a
 * single pass does not.
 */
import { parseWav, writeWav, type WavAudio } from '@/lib/wav'

export const MIN_GAIN_DB = -24
export const MAX_GAIN_DB = 24
export const MAX_FADE_SEC = 10

/** Peak ceiling shared with the engine's sound-effect mastering. */
export const DEFAULT_PEAK_DBFS = -1

export const MIN_SEMITONES = -12
export const MAX_SEMITONES = 12

const INT16_MAX = 32767
const INT16_MIN = -32768

function clampSample(value: number): number {
  if (value > INT16_MAX) return INT16_MAX
  if (value < INT16_MIN) return INT16_MIN
  return Math.round(value)
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20)
}

export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain)
}

export function clampDb(db: number): number {
  if (!Number.isFinite(db)) return 0
  return Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, db))
}

export function clampSemitones(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_SEMITONES, Math.max(MIN_SEMITONES, value))
}

function frameCount(wav: WavAudio): number {
  return Math.floor(wav.pcm.length / wav.channels)
}

/**
 * Equal-power rather than linear.
 *
 * A linear ramp dips about 3 dB in perceived level through the middle of the
 * fade, which is audible on a sustained bed; a sine/cosine pair holds constant
 * power across it. This is the same curve the loop crossfade uses.
 */
function fadeGain(position: number): number {
  return Math.sin((Math.min(1, Math.max(0, position)) * Math.PI) / 2)
}

export type FadeOptions = {
  fadeInSec?: number
  fadeOutSec?: number
}

export function applyFade(buffer: ArrayBuffer, options: FadeOptions): ArrayBuffer {
  const wav = parseWav(buffer)
  const frames = frameCount(wav)
  if (frames === 0) return buffer

  const wanted = (seconds: number | undefined) =>
    Math.max(0, Math.min(frames, Math.round((Math.min(MAX_FADE_SEC, seconds ?? 0)) * wav.sampleRate)))

  let fadeIn = wanted(options.fadeInSec)
  let fadeOut = wanted(options.fadeOutSec)
  if (!fadeIn && !fadeOut) return buffer
  // Overlapping ramps would multiply into a dip in the middle; share the clip
  // proportionally instead so each still reaches full gain at its inner edge.
  if (fadeIn + fadeOut > frames) {
    const total = fadeIn + fadeOut
    fadeIn = Math.floor((fadeIn / total) * frames)
    fadeOut = frames - fadeIn
  }

  const pcm = new Int16Array(wav.pcm)
  for (let f = 0; f < fadeIn; f += 1) {
    const gain = fadeGain((f + 1) / fadeIn)
    for (let c = 0; c < wav.channels; c += 1) {
      const i = f * wav.channels + c
      pcm[i] = clampSample((pcm[i] ?? 0) * gain)
    }
  }
  for (let f = 0; f < fadeOut; f += 1) {
    const frame = frames - 1 - f
    if (frame < 0) break
    const gain = fadeGain((f + 1) / fadeOut)
    for (let c = 0; c < wav.channels; c += 1) {
      const i = frame * wav.channels + c
      pcm[i] = clampSample((pcm[i] ?? 0) * gain)
    }
  }
  return writeWav({ ...wav, pcm })
}

/** Reverses frames, not samples: channel order inside each frame is preserved. */
export function reverseWav(buffer: ArrayBuffer): ArrayBuffer {
  const wav = parseWav(buffer)
  const frames = frameCount(wav)
  const pcm = new Int16Array(wav.pcm.length)
  for (let f = 0; f < frames; f += 1) {
    const source = (frames - 1 - f) * wav.channels
    const target = f * wav.channels
    for (let c = 0; c < wav.channels; c += 1) {
      pcm[target + c] = wav.pcm[source + c] ?? 0
    }
  }
  return writeWav({ ...wav, pcm })
}

/** Raw scale, with no opinion about how far a gain change is allowed to go. */
function scaleWav(buffer: ArrayBuffer, gain: number): ArrayBuffer {
  if (gain === 1) return buffer
  const wav = parseWav(buffer)
  const pcm = new Int16Array(wav.pcm.length)
  for (let i = 0; i < wav.pcm.length; i += 1) {
    pcm[i] = clampSample((wav.pcm[i] ?? 0) * gain)
  }
  return writeWav({ ...wav, pcm })
}

/**
 * Manual gain. The ±24 dB clamp is the range of the control the user drags —
 * {@link normalizePeak} deliberately does not go through it, because a clip
 * 30 dB down needs 30 dB back and stopping at 24 would leave it quiet with
 * nothing saying why.
 */
export function applyGainDb(buffer: ArrayBuffer, db: number): ArrayBuffer {
  const amount = clampDb(db)
  if (amount === 0) return buffer
  return scaleWav(buffer, dbToGain(amount))
}

/** Loudest absolute sample, as dBFS. `-Infinity` for true digital silence. */
export function peakDbfs(buffer: ArrayBuffer): number {
  const wav = parseWav(buffer)
  let peak = 0
  for (let i = 0; i < wav.pcm.length; i += 1) {
    const magnitude = Math.abs(wav.pcm[i] ?? 0)
    if (magnitude > peak) peak = magnitude
  }
  return peak === 0 ? -Infinity : gainToDb(peak / INT16_MAX)
}

/** RMS level in dBFS, used to level-match two clips for an A/B comparison. */
export function rmsDbfs(buffer: ArrayBuffer): number {
  const wav = parseWav(buffer)
  if (wav.pcm.length === 0) return -Infinity
  let sum = 0
  for (let i = 0; i < wav.pcm.length; i += 1) {
    const sample = (wav.pcm[i] ?? 0) / INT16_MAX
    sum += sample * sample
  }
  const rms = Math.sqrt(sum / wav.pcm.length)
  return rms === 0 ? -Infinity : gainToDb(rms)
}

/**
 * Peak-normalizes in both directions, like the engine's sound-effect
 * mastering. A near-silent clip is left alone rather than amplified into its
 * own noise floor — the same rule, and for the same reason.
 */
export function normalizePeak(buffer: ArrayBuffer, targetDbfs = DEFAULT_PEAK_DBFS): ArrayBuffer {
  const peak = peakDbfs(buffer)
  if (!Number.isFinite(peak) || peak < -60) return buffer
  const delta = targetDbfs - peak
  if (Math.abs(delta) < 0.01) return buffer
  return scaleWav(buffer, dbToGain(delta))
}

/**
 * Resampling pitch shift: speed and pitch move together, as on a sampler.
 *
 * This is deliberately not a phase vocoder. Re-pitching one render into a
 * handful of variants is the standard way to get footstep or impact variation
 * out of a single asset, and for that the length change is wanted, not a
 * defect. The UI says "Pitch & speed" rather than implying duration is held.
 *
 * Linear interpolation is adequate here because the shift is small and the
 * source is 44.1 kHz; the artefacts it introduces sit above the audible band
 * for shifts inside ±12 semitones.
 */
export function pitchShiftWav(buffer: ArrayBuffer, semitones: number): ArrayBuffer {
  const shift = clampSemitones(semitones)
  if (shift === 0) return buffer
  const wav = parseWav(buffer)
  const frames = frameCount(wav)
  if (frames < 2) return buffer

  const ratio = 2 ** (shift / 12)
  const outFrames = Math.max(1, Math.floor(frames / ratio))
  const pcm = new Int16Array(outFrames * wav.channels)
  for (let f = 0; f < outFrames; f += 1) {
    const source = f * ratio
    const index = Math.floor(source)
    const fraction = source - index
    const next = Math.min(frames - 1, index + 1)
    for (let c = 0; c < wav.channels; c += 1) {
      const a = wav.pcm[index * wav.channels + c] ?? 0
      const b = wav.pcm[next * wav.channels + c] ?? 0
      pcm[f * wav.channels + c] = clampSample(a + (b - a) * fraction)
    }
  }
  return writeWav({ ...wav, pcm })
}

/**
 * Evenly spaced pitch offsets around the original, excluding zero.
 *
 * `count` 3 over ±2 semitones gives -2, -1, +1, +2 trimmed to three — enough
 * spread to stop a repeated one-shot sounding machine-gunned, without drifting
 * far enough to read as a different object.
 */
export function variantSemitones(count: number, spread: number): number[] {
  const total = Math.max(1, Math.min(12, Math.round(count)))
  const range = Math.abs(clampSemitones(spread)) || 2
  const step = (range * 2) / (total + 1)
  const offsets: number[] = []
  for (let i = 1; i <= total; i += 1) {
    const value = Math.round((-range + step * i) * 100) / 100
    offsets.push(value === 0 ? Math.round(step * 100) / 100 : value)
  }
  return offsets
}

/**
 * Filename suffix for a pitch variant, e.g. `up2` or `dn1_5`.
 *
 * A clip's id is its file stem, so this has to survive as a filename: no dot
 * (it would read as the extension) and no bare minus at the front.
 */
export function variantSuffix(semitones: number): string {
  const magnitude = Math.abs(semitones)
    .toFixed(2)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
    .replace('.', '_')
  return `${semitones < 0 ? 'dn' : 'up'}${magnitude}`
}

export type LayerOptions = {
  /** Seconds to delay the second clip. Negative values are clamped to zero. */
  offsetSec?: number
  /** Level trim applied to the second clip before the sum. */
  gainDb?: number
  /**
   * Peak-normalize the sum. On by default: two clips at −1 dBFS added together
   * will clip, and silently returning a clipped file is the wrong answer.
   */
  normalize?: boolean
}

/**
 * Mixes `b` into `a`. The result takes `a`'s sample rate and channel count, and
 * runs as long as the later of the two ends.
 */
export function layerWavs(
  a: ArrayBuffer,
  b: ArrayBuffer,
  options: LayerOptions = {},
): ArrayBuffer {
  const base = parseWav(a)
  const overlay = parseWav(b)
  if (base.sampleRate !== overlay.sampleRate) {
    throw new Error(
      `Cannot layer ${overlay.sampleRate} Hz onto ${base.sampleRate} Hz audio. Export both at the same rate first.`,
    )
  }

  const offsetFrames = Math.max(0, Math.round((options.offsetSec ?? 0) * base.sampleRate))
  const gain = dbToGain(clampDb(options.gainDb ?? 0))
  const baseFrames = frameCount(base)
  const overlayFrames = frameCount(overlay)
  const frames = Math.max(baseFrames, offsetFrames + overlayFrames)
  const channels = base.channels

  // Summed in float so an intermediate overshoot survives to be normalized,
  // rather than being clipped away before anything can scale it back.
  const mixed = new Float64Array(frames * channels)
  for (let f = 0; f < baseFrames; f += 1) {
    for (let c = 0; c < channels; c += 1) {
      mixed[f * channels + c] = base.pcm[f * base.channels + c] ?? 0
    }
  }
  for (let f = 0; f < overlayFrames; f += 1) {
    const target = f + offsetFrames
    if (target >= frames) break
    for (let c = 0; c < channels; c += 1) {
      // A mono overlay feeds every channel; a stereo one wraps if the base has
      // fewer channels than it does.
      const source = overlay.pcm[f * overlay.channels + (c % overlay.channels)] ?? 0
      mixed[target * channels + c] += source * gain
    }
  }

  let scale = 1
  if (options.normalize !== false) {
    let peak = 0
    for (let i = 0; i < mixed.length; i += 1) {
      const magnitude = Math.abs(mixed[i] ?? 0)
      if (magnitude > peak) peak = magnitude
    }
    const ceiling = INT16_MAX * dbToGain(DEFAULT_PEAK_DBFS)
    if (peak > ceiling) scale = ceiling / peak
  }

  const pcm = new Int16Array(mixed.length)
  for (let i = 0; i < mixed.length; i += 1) {
    pcm[i] = clampSample((mixed[i] ?? 0) * scale)
  }
  return writeWav({ ...base, pcm })
}
