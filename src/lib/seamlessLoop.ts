import { parseWav, writeWav } from '@/lib/wav'
import {
  crossingSlope,
  fadeGain,
  findZeroCrossing,
  pcm16ToFloatSample,
  quantise16,
} from '@/lib/pcm'

export const MIN_CROSSFADE_SEC = 0.05
export const MAX_CROSSFADE_SEC = 3
export const DEFAULT_CROSSFADE_SEC = 1

export function clampCrossfadeSec(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_CROSSFADE_SEC
  return Math.min(MAX_CROSSFADE_SEC, Math.max(MIN_CROSSFADE_SEC, seconds))
}

/** Extra seconds to generate so a looped clip still matches the requested length. */
export function loopOverlapSeconds(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return DEFAULT_CROSSFADE_SEC
  return clampCrossfadeSec(duration * 0.05)
}

/** Absolute PCM jump between the last and first left-channel sample. */
export function loopWrapJump(buffer: ArrayBuffer): number {
  const wav = parseWav(buffer)
  const total = Math.floor(wav.pcm.length / wav.channels)
  if (total < 2) return 0
  const first = wav.pcm[0] ?? 0
  const last = wav.pcm[(total - 1) * wav.channels] ?? 0
  return Math.abs(first - last)
}

export function makeSeamlessLoop(buffer: ArrayBuffer, crossfadeSec = DEFAULT_CROSSFADE_SEC): ArrayBuffer {
  const wav = parseWav(buffer)
  const total = Math.floor(wav.pcm.length / wav.channels)
  const fadeWanted = Math.round(clampCrossfadeSec(crossfadeSec) * wav.sampleRate)
  const fadeFrames = Math.max(2, Math.min(fadeWanted, Math.floor(total / 3)))
  if (total < fadeFrames * 2 + 1) return buffer

  const search = Math.round(wav.sampleRate * 0.005)
  const nominalTail = total - fadeFrames
  const tailSlope = crossingSlope(wav.pcm, wav.channels, nominalTail, total)
  // Join on the sample after the crossing so last→first is the zero-crossing
  // pair, and never before the nominal cut so those two samples stay adjacent.
  const tailJoin = findZeroCrossing(
    wav.pcm,
    wav.channels,
    nominalTail,
    total,
    search,
    tailSlope,
    { pick: 'end', minFrame: nominalTail },
  )
  const headJoin = findZeroCrossing(wav.pcm, wav.channels, 0, total, search, tailSlope)
  const fade = Math.max(2, Math.min(fadeFrames, total - tailJoin, total - headJoin))
  const outFrames = total - fade
  const pcm = new Int16Array(outFrames * wav.channels)

  for (let i = 0; i < fade; i += 1) {
    const t = fade === 1 ? 1 : i / (fade - 1)
    const headGain = fadeGain(t)
    const tailGain = fadeGain(1 - t)
    for (let c = 0; c < wav.channels; c += 1) {
      const head = wav.pcm[(headJoin + i) * wav.channels + c] ?? 0
      const tail = wav.pcm[(tailJoin + i) * wav.channels + c] ?? 0
      const mixed = pcm16ToFloatSample(tail) * tailGain + pcm16ToFloatSample(head) * headGain
      const index = i * wav.channels + c
      pcm[index] = quantise16(mixed, true, index)
    }
  }

  const copyStart = fade
  const copyEnd = total - fade
  if (copyEnd > copyStart) {
    pcm.set(
      wav.pcm.subarray(copyStart * wav.channels, copyEnd * wav.channels),
      fade * wav.channels,
    )
  }

  return writeWav({ ...wav, pcm })
}
