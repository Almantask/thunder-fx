export const TIMING_STORAGE_KEY = 'thunder-fx.timing'
const MAX_SAMPLES = 24

export type GenerateTimingSample = {
  seconds: number
  elapsedMs: number
}

export type TimingLog = {
  loads: number[]
  generates: GenerateTimingSample[]
}

export const EMPTY_TIMING: TimingLog = { loads: [], generates: [] }

export function formatEstimateClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '~0:00'
  const whole = Math.max(1, Math.round(seconds))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `~${m}:${s.toString().padStart(2, '0')}`
}

export function formatEstimateMs(ms: number | undefined): string | undefined {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return undefined
  return formatEstimateClock(ms / 1000)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const left = sorted[mid - 1]
  const right = sorted[mid]
  if (sorted.length % 2 === 0 && left != null && right != null) {
    return (left + right) / 2
  }
  return right ?? 0
}

function typicalMs(samples: number[]): number | undefined {
  if (!samples.length) return undefined
  if (samples.length === 1) return samples[0]
  const med = median(samples)
  const filtered = samples.filter((value) => value <= med * 3)
  const used = filtered.length ? filtered : samples
  return median(used)
}

function pushCapped<T>(items: T[], next: T): T[] {
  return [...items, next].slice(-MAX_SAMPLES)
}

export function recordLoad(log: TimingLog, elapsedMs: number): TimingLog {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return log
  return { ...log, loads: pushCapped(log.loads, Math.round(elapsedMs)) }
}

export function recordGenerate(
  log: TimingLog,
  seconds: number,
  elapsedMs: number,
): TimingLog {
  if (!Number.isFinite(seconds) || seconds <= 0) return log
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return log
  return {
    ...log,
    generates: pushCapped(log.generates, {
      seconds,
      elapsedMs: Math.round(elapsedMs),
    }),
  }
}

export function estimateLoadMs(log: TimingLog): number | undefined {
  return typicalMs(log.loads)
}

function generateRateSamples(log: TimingLog): GenerateTimingSample[] {
  const samples = log.generates.filter(
    (sample) => sample.seconds > 0 && sample.elapsedMs > 0,
  )
  if (samples.length < 4) return samples
  const rates = samples.map((sample) => sample.elapsedMs / sample.seconds)
  const med = median(rates)
  const filtered = samples.filter((sample) => sample.elapsedMs / sample.seconds <= med * 3)
  return filtered.length ? filtered : samples
}

export function estimateGenerateMs(log: TimingLog, seconds: number): number | undefined {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  const samples = generateRateSamples(log)
  if (!samples.length) return undefined
  if (samples.length === 1) {
    const sample = samples[0]
    if (!sample) return undefined
    return sample.elapsedMs * (seconds / sample.seconds)
  }

  const n = samples.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (const sample of samples) {
    sumX += sample.seconds
    sumY += sample.elapsedMs
    sumXY += sample.seconds * sample.elapsedMs
    sumXX += sample.seconds * sample.seconds
  }
  const denom = n * sumXX - sumX * sumX
  if (Math.abs(denom) < 1e-9) {
    const meanMs = sumY / n
    const meanSec = sumX / n
    if (meanSec <= 0) return undefined
    return meanMs * (seconds / meanSec)
  }
  let slope = (n * sumXY - sumX * sumY) / denom
  let intercept = (sumY - slope * sumX) / n
  if (slope < 0) {
    slope = median(samples.map((sample) => sample.elapsedMs / sample.seconds))
    intercept = 0
  }
  intercept = Math.max(0, intercept)
  return intercept + slope * seconds
}

export function estimateQueueMs(
  log: TimingLog,
  items: { duration: number }[],
): number | undefined {
  if (!items.length) return undefined
  let total = 0
  for (const item of items) {
    const estimate = estimateGenerateMs(log, item.duration)
    if (estimate == null) return undefined
    total += estimate
  }
  return total
}

export function estimateRemainingMs(args: {
  elapsedMs: number
  historicalTotalMs?: number
  progress?: number
  queueTailMs?: number
}): number | undefined {
  const elapsedMs = Math.max(0, args.elapsedMs)
  const historicalRemaining =
    args.historicalTotalMs != null
      ? Math.max(0, args.historicalTotalMs - elapsedMs)
      : undefined

  const progress = args.progress
  let liveRemaining: number | undefined
  if (progress != null && progress > 0.02 && progress < 1) {
    liveRemaining = elapsedMs * ((1 - progress) / progress)
  }

  let remaining: number | undefined
  if (liveRemaining == null) remaining = historicalRemaining
  else if (historicalRemaining == null) remaining = liveRemaining
  else {
    const weight = Math.min(1, Math.max(0, progress ?? 0))
    remaining = (1 - weight) * historicalRemaining + weight * liveRemaining
  }

  const tail = Math.max(0, args.queueTailMs ?? 0)
  if (remaining == null) return tail > 0 ? tail : undefined
  return remaining + tail
}

function parseLog(raw: string): TimingLog {
  const parsed = JSON.parse(raw) as Partial<TimingLog>
  const loads = Array.isArray(parsed.loads)
    ? parsed.loads.filter((value): value is number => typeof value === 'number' && value > 0)
    : []
  const generates = Array.isArray(parsed.generates)
    ? parsed.generates.filter((sample): sample is GenerateTimingSample => {
        return (
          Boolean(sample) &&
          typeof sample === 'object' &&
          typeof sample.seconds === 'number' &&
          sample.seconds > 0 &&
          typeof sample.elapsedMs === 'number' &&
          sample.elapsedMs > 0
        )
      })
    : []
  return {
    loads: loads.slice(-MAX_SAMPLES),
    generates: generates.slice(-MAX_SAMPLES),
  }
}

export function loadTimingLog(): TimingLog {
  try {
    const raw = localStorage.getItem(TIMING_STORAGE_KEY)
    if (!raw) return { ...EMPTY_TIMING }
    return parseLog(raw)
  } catch {
    return { ...EMPTY_TIMING }
  }
}

export function saveTimingLog(log: TimingLog): void {
  localStorage.setItem(TIMING_STORAGE_KEY, JSON.stringify(log))
}
