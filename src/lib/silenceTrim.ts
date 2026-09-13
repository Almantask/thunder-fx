import { PCM16_SCALE } from '@/lib/pcm'
import { parseWav } from '@/lib/wav'

export type SilenceTrimOptions = {
  thresholdDb?: number
  padMs?: number
  windowMs?: number
}

export const DEFAULT_TRIM_THRESHOLD_DB = -42
export const DEFAULT_TRIM_PAD_MS = 30

function rmsWindow(pcm: Int16Array, channels: number, start: number, end: number): number {
  let sum = 0
  let count = 0
  for (let f = start; f < end; f += 1) {
    for (let c = 0; c < channels; c += 1) {
      const s = (pcm[f * channels + c] ?? 0) / PCM16_SCALE
      sum += s * s
      count += 1
    }
  }
  if (count === 0) return 0
  return Math.sqrt(sum / count)
}

export function detectSilenceBounds(
  buffer: ArrayBuffer,
  options: SilenceTrimOptions = {},
): { startSec: number; endSec: number } {
  const wav = parseWav(buffer)
  const frames = Math.floor(wav.pcm.length / wav.channels)
  const duration = frames / wav.sampleRate
  if (frames <= 1) return { startSec: 0, endSec: duration }

  const thresholdDb = options.thresholdDb ?? DEFAULT_TRIM_THRESHOLD_DB
  const padMs = options.padMs ?? DEFAULT_TRIM_PAD_MS
  const windowMs = options.windowMs ?? 5
  const threshold = 10 ** (thresholdDb / 20)
  const windowFrames = Math.max(1, Math.round((windowMs / 1000) * wav.sampleRate))
  const padFrames = Math.round((padMs / 1000) * wav.sampleRate)

  let first = -1
  let last = -1
  for (let start = 0; start < frames; start += windowFrames) {
    const end = Math.min(frames, start + windowFrames)
    if (rmsWindow(wav.pcm, wav.channels, start, end) >= threshold) {
      if (first < 0) first = start
      last = end
    }
  }

  if (first < 0 || last <= first) {
    return { startSec: 0, endSec: duration }
  }

  const startFrame = Math.max(0, first - padFrames)
  const endFrame = Math.min(frames, last + padFrames)
  return {
    startSec: startFrame / wav.sampleRate,
    endSec: Math.max(startFrame / wav.sampleRate + 0.05, endFrame / wav.sampleRate),
  }
}
