import { parseWav, writeWav } from '@/lib/wav'

export const MIN_CROSSFADE_SEC = 0.5
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

function nearestZeroCrossing(
  pcm: Int16Array,
  channels: number,
  frame: number,
  total: number,
  window: number,
): number {
  let best = Math.max(0, Math.min(total - 1, frame))
  let bestAbs = Math.abs(pcm[best * channels] ?? 0)
  const from = Math.max(0, frame - window)
  const to = Math.min(total - 1, frame + window)
  for (let f = from; f <= to; f += 1) {
    const a = Math.abs(pcm[f * channels] ?? 0)
    if (a < bestAbs) {
      bestAbs = a
      best = f
    }
  }
  return best
}

export function makeSeamlessLoop(buffer: ArrayBuffer, crossfadeSec = DEFAULT_CROSSFADE_SEC): ArrayBuffer {
  const wav = parseWav(buffer)
  const total = Math.floor(wav.pcm.length / wav.channels)
  const fadeWanted = Math.round(clampCrossfadeSec(crossfadeSec) * wav.sampleRate)
  const fadeFrames = Math.max(2, Math.min(fadeWanted, Math.floor(total / 3)))
  if (total < fadeFrames * 2 + 1) return buffer

  const search = Math.round(wav.sampleRate * 0.005)
  const headJoin = nearestZeroCrossing(wav.pcm, wav.channels, 0, total, search)
  const tailJoin = nearestZeroCrossing(wav.pcm, wav.channels, total - fadeFrames, total, search)
  const fade = Math.max(2, Math.min(fadeFrames, total - tailJoin, total - headJoin))
  const outFrames = total - fade
  const pcm = new Int16Array(outFrames * wav.channels)

  for (let i = 0; i < fade; i += 1) {
    const t = fade === 1 ? 1 : i / (fade - 1)
    const headGain = Math.sin((t * Math.PI) / 2)
    const tailGain = Math.cos((t * Math.PI) / 2)
    for (let c = 0; c < wav.channels; c += 1) {
      const head = wav.pcm[(headJoin + i) * wav.channels + c] ?? 0
      const tail = wav.pcm[(tailJoin + i) * wav.channels + c] ?? 0
      pcm[i * wav.channels + c] = Math.round(tail * tailGain + head * headGain)
    }
  }

  const copyStart = fade
  const copyEnd = total - fade
  const copyFrames = copyEnd - copyStart
  if (copyFrames > 0) {
    pcm.set(
      wav.pcm.subarray(copyStart * wav.channels, copyEnd * wav.channels),
      fade * wav.channels,
    )
  }

  return writeWav({ ...wav, pcm })
}
