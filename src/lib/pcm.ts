/**
 * Shared 16-bit PCM helpers.
 *
 * Every float ↔ int16 conversion in the TypeScript path goes through here so
 * the mapping and the dither policy cannot drift between export, Shape edits,
 * trim fades and the loop crossfade.
 */

export const PCM16_SCALE = 32768
export const INT16_MAX = 32767
export const INT16_MIN = -32768

/** 3 ms equal-power ramps at each trim cut, inside the 2–5 ms click-free range. */
export const TRIM_FADE_SEC = 0.003

export type ZeroCrossingPick = 'start' | 'end'

export type ZeroCrossingOptions = {
  /**
   * `start` returns the first sample of the crossing pair (head joins).
   * `end` returns the sample after it so last→first of a loop is the pair itself.
   */
  pick?: ZeroCrossingPick
  /** Ignore joins before this frame. Used to keep a loop wrap on adjacent samples. */
  minFrame?: number
}

/**
 * Equal-power ramp. A linear fade dips ~3 dB in the middle of a sustained bed;
 * a sine keeps constant power. Shared by Shape fades, trim micro-fades and the
 * loop crossfade.
 */
export function fadeGain(position: number): number {
  return Math.sin((Math.min(1, Math.max(0, position)) * Math.PI) / 2)
}

export function pcm16ToFloatSample(sample: number): number {
  return sample / PCM16_SCALE
}

/**
 * Deterministic TPDF (±1 LSB) from a sample index so the same clip dithers the
 * same way twice. Two hashed uniforms, subtracted, matching the engine's
 * triangular PDF.
 */
function tpdfAt(index: number): number {
  return hash01(index * 2 + 1) - hash01(index * 2 + 2)
}

function hash01(n: number): number {
  let t = n >>> 0
  t = Math.imul(t ^ (t >>> 15), 0x45d9f3b)
  t = Math.imul(t ^ (t >>> 15), 0x45d9f3b)
  t = (t ^ (t >>> 15)) >>> 0
  return t / 4294967296
}

/**
 * Float [-1, 1] → int16. Scale is 32768 in both directions so a round trip of
 * −32768 is exact and +1.0 clamps to 32767. TPDF dither is on by default, with
 * the same digital-silence guard the engine uses: true zeros stay zeros.
 */
export function quantise16(sample: number, dither = true, ditherIndex = 0): number {
  if (!Number.isFinite(sample)) return 0
  const scaled = sample * PCM16_SCALE
  const noise = dither && scaled !== 0 ? tpdfAt(ditherIndex) : 0
  const rounded = Math.round(scaled + noise)
  if (rounded > INT16_MAX) return INT16_MAX
  if (rounded < INT16_MIN) return INT16_MIN
  return rounded
}

export function pcmToFloat(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i += 1) {
    out[i] = (pcm[i] ?? 0) / PCM16_SCALE
  }
  return out
}

export function floatToPcm16(samples: Float32Array, dither = true): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = quantise16(samples[i] ?? 0, dither, i)
  }
  return out
}

function summedSample(pcm: Int16Array, channels: number, frame: number): number {
  let sum = 0
  const base = frame * channels
  for (let c = 0; c < channels; c += 1) {
    sum += pcm[base + c] ?? 0
  }
  return sum
}

export function crossingSlope(
  pcm: Int16Array,
  channels: number,
  frame: number,
  total: number,
): number {
  const f = Math.max(0, Math.min(total - 2, frame))
  return summedSample(pcm, channels, f + 1) - summedSample(pcm, channels, f)
}

function isCrossing(a: number, b: number): boolean {
  return a === 0 || a * b <= 0
}

function slopeMatches(a: number, b: number, slopeSign: number | undefined, requireSlope: boolean): boolean {
  if (!requireSlope || slopeSign == null || slopeSign === 0) return true
  const slope = b - a
  if (slope === 0) return false
  return Math.sign(slope) === Math.sign(slopeSign)
}

/**
 * Sign-change on the summed channels, nearest a quiet crossing rather than a
 * same-sign trough or a loud chord-boundary jump.
 *
 * The old search picked the quietest left-channel sample, which can land on a
 * trough that never crosses zero. A real zero crossing, with matching slope at
 * the other join, is what stops the loop point from clicking.
 */
export function findZeroCrossing(
  pcm: Int16Array,
  channels: number,
  frame: number,
  total: number,
  window: number,
  slopeSign?: number,
  options: ZeroCrossingOptions = {},
): number {
  if (total < 2) return 0
  const target = Math.max(0, Math.min(total - 1, frame))
  const from = Math.max(0, target - window)
  const to = Math.min(total - 2, target + window)
  const pickEnd = options.pick === 'end'
  const minFrame = options.minFrame ?? 0

  const pick = (requireSlope: boolean, requireMin: boolean): number | undefined => {
    let best: number | undefined
    let bestAmp = Infinity
    let bestDist = Infinity
    for (let f = from; f <= to; f += 1) {
      const a = summedSample(pcm, channels, f)
      const b = summedSample(pcm, channels, f + 1)
      if (!isCrossing(a, b)) continue
      if (!slopeMatches(a, b, slopeSign, requireSlope)) continue
      const join = pickEnd ? f + 1 : f
      if (join >= total) continue
      if (requireMin && join < minFrame) continue
      const amp = Math.max(Math.abs(a), Math.abs(b))
      const dist = Math.abs(join - target)
      if (amp < bestAmp || (amp === bestAmp && dist < bestDist)) {
        best = join
        bestAmp = amp
        bestDist = dist
      }
    }
    return best
  }

  const requireMin = minFrame > 0
  const matchedMin = pick(true, requireMin)
  if (matchedMin !== undefined) return matchedMin
  const anyMin = pick(false, requireMin)
  if (anyMin !== undefined) return anyMin
  if (requireMin) {
    const matched = pick(true, false)
    if (matched !== undefined) return matched
    const anyCross = pick(false, false)
    if (anyCross !== undefined) return anyCross
  }

  const fallbackFrom = Math.max(0, requireMin ? Math.max(minFrame, target - window) : target - window)
  const fallbackTo = Math.min(total - 1, target + window)
  let best = Math.max(fallbackFrom, Math.min(fallbackTo, target))
  let bestAbs = Math.abs(summedSample(pcm, channels, best))
  for (let f = fallbackFrom; f <= fallbackTo; f += 1) {
    const amp = Math.abs(summedSample(pcm, channels, f))
    if (amp < bestAbs) {
      bestAbs = amp
      best = f
    }
  }
  return best
}
