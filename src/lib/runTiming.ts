import { phaseStepMs, phaseTailMs, type PhaseCostModel } from '@/lib/perfBenchmarks'
import type { WeavePhase, WeaveProgress } from '@/lib/types'

/**
 * The live half of the time estimate.
 *
 * A stored estimate is only ever an average of past runs. What a user is
 * actually waiting on is *this* run, and this run reports its own pace: each
 * diffusion step arrives as an event, so the moment two of them have landed the
 * machine's current speed is a measurement rather than a guess. That is what
 * this module tracks, and it is why the countdown keeps correcting itself when
 * something else takes the GPU mid-run.
 *
 * `timing.ts` owns the persisted cross-run model; this owns the run in flight.
 */

/** Step intervals needed before the live pace fully displaces the stored model. */
const LIVE_PACE_CONFIDENCE_STEPS = 5

/** A download ratio below this is too early to extrapolate from. */
const MIN_RATIO_FOR_EXTRAPOLATION = 0.03

export type RunKind = 'load' | 'generate'

export type RunTrack = {
  kind: RunKind
  startedAt: number
  /** Clip length being generated, in seconds. Absent for a model load. */
  seconds?: number
  /** Steps the run will take, as the engine reports them. */
  totalSteps?: number
  phase?: WeavePhase
  /** Newest download ratio; a model load has no other progress signal. */
  ratio?: number
  /** Wall clock when the first diffusion step was reported, and which step it was. */
  firstStepAt?: number
  firstStep?: number
  /** Wall clock of the newest diffusion step, and which step it was. */
  lastStepAt?: number
  lastStep?: number
  /** Wall clock when sampling handed over to decode and write. */
  tailStartedAt?: number
  /**
   * A checkpoint swap happened inside this run. Its total is then a load plus a
   * generation, and recording it as a generation would inflate every later
   * estimate for a clip of that length.
   */
  sawLoading?: boolean
  updatedAt: number
}

export function startRun(
  kind: RunKind,
  options: { at: number; seconds?: number; totalSteps?: number; phase?: WeavePhase },
): RunTrack {
  return {
    kind,
    startedAt: options.at,
    seconds: options.seconds,
    totalSteps: options.totalSteps,
    phase: options.phase ?? (kind === 'load' ? 'loading' : 'weaving'),
    updatedAt: options.at,
  }
}

/**
 * Fold one progress event into the run.
 *
 * Only a step number that has actually moved forward is timed. The engine
 * throttles its emits and repeats the current step on every heartbeat, so
 * timing repeats would report a step rate of "instant" between duplicates and
 * "stalled" across the gap.
 */
export function trackRun(
  run: RunTrack | null | undefined,
  event: Partial<Pick<WeaveProgress, 'step' | 'total' | 'phase' | 'ratio'>>,
  at: number,
  fallback?: Pick<RunTrack, 'kind' | 'startedAt' | 'seconds' | 'totalSteps'>,
): RunTrack {
  // A progress event can beat the run being registered, and an event with no
  // run behind it is still a real measurement of something in flight.
  const base: RunTrack =
    run ??
    startRun(fallback?.kind ?? 'generate', {
      at: fallback?.startedAt ?? at,
      seconds: fallback?.seconds,
      totalSteps: fallback?.totalSteps,
    })
  const next: RunTrack = { ...base, updatedAt: at }
  if (event.phase) next.phase = event.phase
  if (event.phase === 'loading' && base.kind === 'generate') next.sawLoading = true
  if (typeof event.total === 'number' && event.total > 0) next.totalSteps = event.total
  if (typeof event.ratio === 'number' && Number.isFinite(event.ratio) && event.ratio > 0) {
    next.ratio = Math.min(1, event.ratio)
  }

  const step = typeof event.step === 'number' && Number.isFinite(event.step) ? event.step : 0
  if (step > 0 && step > (base.lastStep ?? 0)) {
    next.lastStep = step
    next.lastStepAt = at
    if (next.firstStepAt == null) {
      next.firstStepAt = at
      next.firstStep = step
    }
  }

  if (event.phase === 'writing' && next.tailStartedAt == null) {
    // The last step may not have been emitted before the phase flipped.
    next.tailStartedAt = next.lastStepAt ?? at
  }
  return next
}

/** Mean ms per diffusion step observed in this run, if enough steps have landed. */
export function liveStepMs(run: RunTrack): number | undefined {
  const spanSteps = (run.lastStep ?? 0) - (run.firstStep ?? 0)
  if (spanSteps < 1) return undefined
  if (run.firstStepAt == null || run.lastStepAt == null) return undefined
  const spanMs = run.lastStepAt - run.firstStepAt
  if (!(spanMs > 0)) return undefined
  return spanMs / spanSteps
}

/**
 * What this run actually cost, split the same way {@link PhaseCostModel} splits
 * a prediction, so the two can be compared directly.
 *
 * Lead is net of the steps already completed when the first step was reported,
 * because "time until step 1 lands" includes step 1's own compute. Without that
 * subtraction every recorded lead would be one step too long and every recorded
 * total would silently double-count it.
 */
export function runMeasurements(
  run: RunTrack,
  finishedAt: number,
): { leadMs?: number; stepMs?: number; tailMs?: number } {
  const stepMs = liveStepMs(run)
  if (stepMs == null) return {}

  const leadMs =
    run.firstStepAt != null
      ? Math.max(0, run.firstStepAt - run.startedAt - (run.firstStep ?? 1) * stepMs)
      : undefined

  let tailMs: number | undefined
  if (run.lastStepAt != null) {
    const stepsUnreported = Math.max(0, (run.totalSteps ?? run.lastStep ?? 0) - (run.lastStep ?? 0))
    tailMs = Math.max(0, finishedAt - run.lastStepAt - stepsUnreported * stepMs)
  }

  return { leadMs, stepMs, tailMs }
}

export type LiveEstimateArgs = {
  now: number
  /** This machine's cross-run model, from `getMeasuredPhaseModel`. */
  model?: PhaseCostModel
  /** Whole-run estimate to fall back on when there is no phase detail. */
  historicalTotalMs?: number
  /** Everything queued behind this run. */
  queueTailMs?: number
}

/**
 * Milliseconds left, recomputed from scratch every time it is asked.
 *
 * Call it as often as the UI repaints — it holds no state and reads the clock
 * fresh, so a run that slows down halfway is reflected immediately rather than
 * at the next progress event.
 */
export function liveRemainingMs(
  run: RunTrack | null | undefined,
  args: LiveEstimateArgs,
): number | undefined {
  if (!run) return undefined
  const queueTail = Math.max(0, args.queueTailMs ?? 0)
  const core = coreRemainingMs(run, args)
  if (core == null) return queueTail > 0 ? queueTail : undefined
  return core + queueTail
}

function fromHistorical(run: RunTrack, args: LiveEstimateArgs): number | undefined {
  if (args.historicalTotalMs == null) return undefined
  return Math.max(0, args.historicalTotalMs - (args.now - run.startedAt))
}

function coreRemainingMs(run: RunTrack, args: LiveEstimateArgs): number | undefined {
  const elapsed = Math.max(0, args.now - run.startedAt)

  // A model load reports a download ratio and nothing else, so its own pace is
  // the only live signal available. Blended with the stored estimate weighted
  // by how far in it is, so an early ratio spike does not swing the number.
  if (run.kind === 'load' || run.phase === 'loading') {
    const stored = fromHistorical(run, args)
    const ratio = run.ratio
    if (ratio == null || ratio <= MIN_RATIO_FOR_EXTRAPOLATION || ratio >= 1) return stored
    const projected = elapsed * ((1 - ratio) / ratio)
    if (stored == null) return projected
    return (1 - ratio) * stored + ratio * projected
  }

  const model = args.model
  const seconds = run.seconds
  if (!model || seconds == null || !(seconds > 0)) {
    return fromHistorical(run, args)
  }

  const modelStepMs = phaseStepMs(model, seconds)
  const modelTailMs = phaseTailMs(model, seconds)

  // Decode, master and write. No step events land here, so the only honest
  // reading is the stored tail cost minus how long the tail has already run.
  if (run.phase === 'writing') {
    const inTail = run.tailStartedAt != null ? Math.max(0, args.now - run.tailStartedAt) : 0
    return Math.max(0, modelTailMs - inTail)
  }

  const totalSteps = run.totalSteps ?? 0
  const done = run.lastStep ?? 0

  // Sampling has not started: still in setup, so nothing has been measured yet.
  if (done <= 0 || totalSteps <= 0) {
    const leadLeft = Math.max(0, model.leadMs - elapsed)
    const full = leadLeft + (totalSteps || 0) * modelStepMs + modelTailMs
    if (totalSteps > 0) return full
    return fromHistorical(run, args) ?? full
  }

  const observed = liveStepMs(run)
  const spanSteps = done - (run.firstStep ?? done)
  const confidence = Math.min(1, spanSteps / LIVE_PACE_CONFIDENCE_STEPS)
  const stepMs =
    observed != null ? confidence * observed + (1 - confidence) * modelStepMs : modelStepMs

  const stepsLeft = Math.max(0, totalSteps - done)
  // The step in flight is already part-paid; never credit more than a whole one,
  // so a genuine stall stops the countdown instead of driving it negative.
  const inFlight = run.lastStepAt != null ? Math.min(args.now - run.lastStepAt, stepMs) : 0
  return Math.max(0, stepsLeft * stepMs - inFlight) + modelTailMs
}

/** Fraction of the whole run complete, from real step counts where they exist. */
export function liveRunRatio(run: RunTrack | null | undefined): number | undefined {
  if (!run) return undefined
  if (run.phase === 'writing') return 0.95
  if (run.kind === 'load' || run.phase === 'loading') return run.ratio
  const total = run.totalSteps ?? 0
  const done = run.lastStep ?? 0
  if (total <= 0 || done <= 0) return undefined
  return Math.min(1, done / total)
}

/** How long without a progress event before the UI should offer Cancel. */
export const STALL_STEP_MULTIPLIER = 8
export const STALL_MIN_MS = 30_000
export const STALL_MAX_MS = 180_000
export const STALL_LOADING_MS = 120_000

export function stallBudgetMs(expectedStepMs?: number, phase?: string): number {
  if (phase === 'loading') return STALL_LOADING_MS
  const step = expectedStepMs != null && expectedStepMs > 0 ? expectedStepMs : 8_000
  return Math.min(STALL_MAX_MS, Math.max(STALL_MIN_MS, step * STALL_STEP_MULTIPLIER))
}
