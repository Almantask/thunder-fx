import { getAppBuildId } from '@/lib/buildInfo'
import {
  clampSteps,
  getBaselineLoadMs,
  getBaselinePhaseModel,
  phaseStepMs,
  phaseTailMs,
  phaseTotalMs,
  type GenerateCostOptions,
  type PhaseCostModel,
  type QueueCostItem,
} from '@/lib/perfBenchmarks'
import type { PrecisionMode } from '@/lib/types'

export const TIMING_STORAGE_KEY = 'thunder-fx.timing'
const MAX_SAMPLES = 24
/** Assumed step count for samples recorded before steps were logged. */
const DEFAULT_STEPS = 20

/**
 * Per-sample weight decay, newest first. A machine's pace moves with driver
 * versions, thermals and whatever else holds the GPU, so the run that finished
 * a minute ago predicts the next one better than the one from last week.
 * 0.88^23 ≈ 0.05, so the oldest of a full log still counts for something.
 */
const RECENCY_DECAY = 0.88

/** Ratios this far from the median are a different kind of event, not noise. */
const OUTLIER_FACTOR = 3

/** A sample from a mismatched configuration still says something about the machine. */
const PRECISION_MISMATCH_WEIGHT = 0.15
const GUIDANCE_MISMATCH_WEIGHT = 0.1

export type GenerateTimingSample = {
  seconds: number
  elapsedMs: number
  steps?: number
  precision?: PrecisionMode
  /**
   * Guidance scale in force. Above 1 a step costs close to double, so Max
   * quality runs must not be averaged in with Balanced ones.
   */
  cfg?: number
  /** Measured ms of setup before the first diffusion step, steps discounted. */
  leadMs?: number
  /** Measured mean ms per diffusion step across the sampling phase. */
  stepMs?: number
  /** Measured ms from the last step to the finished WAV: decode, master, write. */
  tailMs?: number
  /** Peak CUDA allocation in GiB during this run. */
  peakVramGb?: number
  /** Epoch ms the run finished, for recency weighting. */
  at?: number
}

export type LoadTimingSample = {
  elapsedMs: number
  precision?: PrecisionMode
  /** Checkpoint loaded. Medium and Medium-Base are not the same wait. */
  model?: string
  at?: number
}

export type TimingLog = {
  buildId?: string
  loads: LoadTimingSample[]
  generates: GenerateTimingSample[]
}

export const EMPTY_TIMING: TimingLog = {
  buildId: getAppBuildId(),
  loads: [],
  generates: [],
}

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

type Weighted = { value: number; weight: number }

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

/**
 * Typical value of a set of ratios.
 *
 * Geometric rather than arithmetic because these are multiplicative
 * corrections: a run that took half as long as predicted and one that took
 * twice as long should cancel out, and an arithmetic mean of 0.5 and 2 says
 * 1.25 instead of 1.
 */
function weightedGeometricMean(points: Weighted[]): number | undefined {
  const usable = points.filter(
    (point) => Number.isFinite(point.value) && point.value > 0 && point.weight > 0,
  )
  if (!usable.length) return undefined
  const med = median(usable.map((point) => point.value))
  const trimmed =
    usable.length >= 3
      ? usable.filter(
          (point) =>
            point.value <= med * OUTLIER_FACTOR && point.value >= med / OUTLIER_FACTOR,
        )
      : usable
  const used = trimmed.length ? trimmed : usable
  let sumLog = 0
  let sumWeight = 0
  for (const point of used) {
    sumLog += Math.log(point.value) * point.weight
    sumWeight += point.weight
  }
  if (sumWeight <= 0) return undefined
  return Math.exp(sumLog / sumWeight)
}

function pushCapped<T>(items: T[], next: T): T[] {
  return [...items, next].slice(-MAX_SAMPLES)
}

/** Newest sample counts fully; each older one is worth {@link RECENCY_DECAY} of its successor. */
function recencyWeights(count: number): number[] {
  return Array.from({ length: count }, (_, index) => RECENCY_DECAY ** (count - 1 - index))
}

function guided(cfg: number | undefined): boolean {
  return cfg != null && Number.isFinite(cfg) && cfg > 1
}

export function recordLoad(
  log: TimingLog,
  elapsedMs: number,
  options?: { precision?: PrecisionMode; model?: string; at?: number },
): TimingLog {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return log
  return {
    ...log,
    buildId: log.buildId || getAppBuildId(),
    loads: pushCapped(log.loads, {
      elapsedMs: Math.round(elapsedMs),
      precision: options?.precision,
      model: options?.model,
      at: options?.at ?? Date.now(),
    }),
  }
}

export function recordGenerate(
  log: TimingLog,
  seconds: number,
  elapsedMs: number,
  options?: {
    steps?: number
    precision?: PrecisionMode
    cfg?: number
    leadMs?: number
    stepMs?: number
    tailMs?: number
    peakVramGb?: number
    at?: number
  },
): TimingLog {
  if (!Number.isFinite(seconds) || seconds <= 0) return log
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return log
  const positive = (value: number | undefined) =>
    value != null && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined
  return {
    ...log,
    buildId: log.buildId || getAppBuildId(),
    generates: pushCapped(log.generates, {
      seconds,
      elapsedMs: Math.round(elapsedMs),
      steps: options?.steps,
      precision: options?.precision,
      cfg: options?.cfg,
      // Zero is not a measurement here, it is a phase that never reported.
      leadMs: options?.leadMs != null && options.leadMs >= 0 ? Math.round(options.leadMs) : undefined,
      stepMs: positive(options?.stepMs),
      tailMs: options?.tailMs != null && options.tailMs >= 0 ? Math.round(options.tailMs) : undefined,
      peakVramGb:
        options?.peakVramGb != null && Number.isFinite(options.peakVramGb) && options.peakVramGb > 0
          ? Math.round(options.peakVramGb * 1000) / 1000
          : undefined,
      at: options?.at ?? Date.now(),
    }),
  }
}

export function estimateLoadMs(
  log: TimingLog,
  options?: { precision?: PrecisionMode; model?: string; isMock?: boolean },
): number {
  const baseline = getBaselineLoadMs(options?.precision, options?.isMock)
  if (options?.isMock) return baseline
  const weights = recencyWeights(log.loads.length)
  const points: Weighted[] = []
  log.loads.forEach((sample, index) => {
    if (!(sample.elapsedMs > 0)) return
    // A different checkpoint is a different file set, and the first load of one
    // is a multi-GB download. That is not a slower version of the wait being
    // estimated, it is a different event, so it is dropped rather than
    // discounted -- discounting does nothing when every sample is mismatched.
    if (sample.model && options?.model && sample.model !== options.model) return
    let weight = weights[index] ?? 1
    // Precision is the same files read at a different dtype, so a mismatched
    // sample still carries this machine's disk and PCIe speed. Worth keeping,
    // at a discount, when nothing better has been recorded.
    if (sample.precision && options?.precision && sample.precision !== options.precision) {
      weight *= PRECISION_MISMATCH_WEIGHT
    }
    points.push({ value: sample.elapsedMs, weight })
  })
  // The outlier trim inside is what keeps a one-off multi-GB download from
  // being quoted back as the wait for every warm load that follows it.
  return Math.round(weightedGeometricMean(points) ?? baseline)
}

/** Baseline cost of the exact configuration a recorded sample ran under. */
function sampleBaseline(sample: GenerateTimingSample): {
  model: PhaseCostModel
  steps: number
} {
  const steps = clampSteps(sample.steps ?? DEFAULT_STEPS)
  return {
    model: getBaselinePhaseModel({
      steps,
      precision: sample.precision,
      cfg: sample.cfg,
    }),
    steps,
  }
}

function sampleWeights(
  log: TimingLog,
  options: GenerateCostOptions | undefined,
): Weighted[] {
  const decay = recencyWeights(log.generates.length)
  return log.generates.map((sample, index) => {
    let weight = decay[index] ?? 1
    if (sample.precision && options?.precision && sample.precision !== options.precision) {
      weight *= PRECISION_MISMATCH_WEIGHT
    }
    if (guided(sample.cfg) !== guided(options?.cfg)) {
      weight *= GUIDANCE_MISMATCH_WEIGHT
    }
    return { value: sample.elapsedMs, weight }
  })
}

/**
 * Solve a two-feature weighted least squares for how far this machine is off
 * the baseline's fixed cost and its per-step cost, from whole-run totals alone.
 *
 * This is the fallback for samples recorded before phase timings existed. It
 * matters because a single overall scale factor cannot tell a slow sampler
 * apart from slow setup, and the two predict very differently once the step
 * count changes — which is exactly what switching quality preset does.
 *
 * Returns undefined when the fit is degenerate or physically impossible
 * (negative cost), leaving the caller on the single-factor path.
 */
function fitFixedAndStepScale(
  rows: {
    fixedMs: number
    stepWorkMs: number
    elapsedMs: number
    steps: number
    weight: number
  }[],
): { fixedScale: number; stepScale: number } | undefined {
  if (rows.length < 2) return undefined
  // Fixed cost and per-step cost can only be told apart by watching the step
  // count change. Samples that all ran the same number of steps will still
  // produce an arithmetically valid split, but an arbitrary one.
  if (new Set(rows.map((row) => row.steps)).size < 2) return undefined
  let a11 = 0
  let a12 = 0
  let a22 = 0
  let b1 = 0
  let b2 = 0
  for (const row of rows) {
    const { fixedMs: f, stepWorkMs: s, elapsedMs: y, weight: w } = row
    a11 += w * f * f
    a12 += w * f * s
    a22 += w * s * s
    b1 += w * f * y
    b2 += w * s * y
  }
  const det = a11 * a22 - a12 * a12
  const scale = Math.max(a11 * a22, 1)
  // Near-singular means the samples do not actually separate the two costs.
  if (!Number.isFinite(det) || Math.abs(det) < scale * 1e-6) return undefined
  const fixedScale = (b1 * a22 - b2 * a12) / det
  const stepScale = (a11 * b2 - a12 * b1) / det
  if (!Number.isFinite(fixedScale) || !Number.isFinite(stepScale)) return undefined
  if (fixedScale < 0 || stepScale <= 0) return undefined
  if (stepScale < 0.05 || stepScale > 20 || fixedScale > 20) return undefined
  return { fixedScale, stepScale }
}

/**
 * This machine's cost model: the benchmark baseline, corrected by what runs on
 * it have actually taken.
 *
 * Correcting a fixed shape rather than fitting one from scratch is deliberate.
 * The samples a real session produces cluster around whatever durations that
 * session used, and a regression fitted to eight-second clips has nothing
 * honest to say about a 380-second bed — it will happily extrapolate a negative
 * slope. The baseline supplies the shape across durations and step counts; the
 * log supplies the scale, per phase wherever a phase was actually timed.
 */
export function getMeasuredPhaseModel(
  log: TimingLog,
  options?: GenerateCostOptions,
): PhaseCostModel {
  const base = getBaselinePhaseModel(options)
  if (options?.isMock || !log.generates.length) return base

  const weights = sampleWeights(log, options)
  const leadRatios: Weighted[] = []
  const stepRatios: Weighted[] = []
  const tailRatios: Weighted[] = []
  const totalRatios: Weighted[] = []
  const rows: {
    fixedMs: number
    stepWorkMs: number
    elapsedMs: number
    steps: number
    weight: number
  }[] = []

  log.generates.forEach((sample, index) => {
    const weight = weights[index]?.weight ?? 1
    if (!(weight > 0) || !(sample.seconds > 0) || !(sample.elapsedMs > 0)) return
    const { model: own, steps } = sampleBaseline(sample)
    const ownLead = own.leadMs
    const ownStep = phaseStepMs(own, sample.seconds)
    const ownTail = phaseTailMs(own, sample.seconds)

    if (sample.leadMs != null && ownLead > 0) {
      leadRatios.push({ value: sample.leadMs / ownLead, weight })
    }
    if (sample.stepMs != null && ownStep > 0) {
      stepRatios.push({ value: sample.stepMs / ownStep, weight })
    }
    if (sample.tailMs != null && ownTail > 0) {
      tailRatios.push({ value: sample.tailMs / ownTail, weight })
    }

    const predicted = phaseTotalMs(own, sample.seconds, steps)
    if (predicted > 0) totalRatios.push({ value: sample.elapsedMs / predicted, weight })
    rows.push({
      fixedMs: ownLead + ownTail,
      stepWorkMs: steps * ownStep,
      elapsedMs: sample.elapsedMs,
      steps,
      weight,
    })
  })

  const overall = weightedGeometricMean(totalRatios) ?? 1
  const split = fitFixedAndStepScale(rows)
  const fallbackFixed = split?.fixedScale ?? overall
  const fallbackStep = split?.stepScale ?? overall

  // A phase that reported its own timings is trusted over anything inferred
  // from the whole-run total.
  const leadScale = weightedGeometricMean(leadRatios) ?? fallbackFixed
  const stepScale = weightedGeometricMean(stepRatios) ?? fallbackStep
  const tailScale = weightedGeometricMean(tailRatios) ?? fallbackFixed

  return {
    leadMs: base.leadMs * leadScale,
    stepBaseMs: base.stepBaseMs * stepScale,
    stepPerSecMs: base.stepPerSecMs * stepScale,
    tailBaseMs: base.tailBaseMs * tailScale,
    tailPerSecMs: base.tailPerSecMs * tailScale,
  }
}

export function estimateGenerateMs(
  log: TimingLog,
  seconds: number,
  options?: GenerateCostOptions,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  const model = getMeasuredPhaseModel(log, options)
  return Math.round(phaseTotalMs(model, seconds, clampSteps(options?.steps)))
}

export function estimateQueueMs(
  log: TimingLog,
  items: QueueCostItem[],
  options?: { precision?: PrecisionMode; isMock?: boolean },
): number | undefined {
  if (!items.length) return undefined
  let total = 0
  for (const item of items) {
    total += estimateGenerateMs(log, item.duration, {
      steps: item.steps,
      cfg: item.cfg,
      precision: options?.precision,
      isMock: options?.isMock,
    })
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

export function hasRealMachineSamples(log: TimingLog): boolean {
  return log.loads.length > 0 || log.generates.length > 0
}

export function wipeTimingLog(): void {
  try {
    localStorage.removeItem(TIMING_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function parseLoad(raw: unknown): LoadTimingSample | undefined {
  // Logs written before loads carried a configuration are bare millisecond counts.
  if (typeof raw === 'number') {
    return raw > 0 ? { elapsedMs: raw } : undefined
  }
  if (!raw || typeof raw !== 'object') return undefined
  const sample = raw as Partial<LoadTimingSample>
  if (typeof sample.elapsedMs !== 'number' || !(sample.elapsedMs > 0)) return undefined
  return {
    elapsedMs: sample.elapsedMs,
    precision: sample.precision === 'fp32' || sample.precision === 'fp16' ? sample.precision : undefined,
    model: typeof sample.model === 'string' ? sample.model : undefined,
    at: optionalNumber(sample.at),
  }
}

function parseGenerate(raw: unknown): GenerateTimingSample | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const sample = raw as Partial<GenerateTimingSample>
  if (typeof sample.seconds !== 'number' || !(sample.seconds > 0)) return undefined
  if (typeof sample.elapsedMs !== 'number' || !(sample.elapsedMs > 0)) return undefined
  return {
    seconds: sample.seconds,
    elapsedMs: sample.elapsedMs,
    steps: optionalNumber(sample.steps),
    precision: sample.precision === 'fp32' || sample.precision === 'fp16' ? sample.precision : undefined,
    cfg: optionalNumber(sample.cfg),
    leadMs: optionalNumber(sample.leadMs),
    stepMs: optionalNumber(sample.stepMs),
    tailMs: optionalNumber(sample.tailMs),
    peakVramGb: optionalNumber(sample.peakVramGb),
    at: optionalNumber(sample.at),
  }
}

function parseLog(raw: string): TimingLog {
  const parsed = JSON.parse(raw) as Partial<TimingLog>
  const loads = Array.isArray(parsed.loads)
    ? parsed.loads.map(parseLoad).filter((sample): sample is LoadTimingSample => Boolean(sample))
    : []
  const generates = Array.isArray(parsed.generates)
    ? parsed.generates
        .map(parseGenerate)
        .filter((sample): sample is GenerateTimingSample => Boolean(sample))
    : []
  return {
    buildId: typeof parsed.buildId === 'string' ? parsed.buildId : undefined,
    loads: loads.slice(-MAX_SAMPLES),
    generates: generates.slice(-MAX_SAMPLES),
  }
}

export function loadTimingLog(currentBuildId: string = getAppBuildId()): TimingLog {
  try {
    const raw = localStorage.getItem(TIMING_STORAGE_KEY)
    if (!raw) return { ...EMPTY_TIMING, buildId: currentBuildId }
    const parsed = parseLog(raw)
    if (parsed.buildId && parsed.buildId !== currentBuildId) {
      wipeTimingLog()
      const fresh: TimingLog = { buildId: currentBuildId, loads: [], generates: [] }
      saveTimingLog(fresh)
      return fresh
    }
    return {
      ...parsed,
      buildId: currentBuildId,
    }
  } catch {
    return { ...EMPTY_TIMING, buildId: currentBuildId }
  }
}

export function saveTimingLog(log: TimingLog): void {
  const toSave: TimingLog = {
    ...log,
    buildId: log.buildId || getAppBuildId(),
  }
  localStorage.setItem(TIMING_STORAGE_KEY, JSON.stringify(toSave))
}
