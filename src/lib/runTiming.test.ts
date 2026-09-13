import { describe, expect, it } from 'vitest'
import {
  liveRemainingMs,
  liveRunRatio,
  liveStepMs,
  runMeasurements,
  stallBudgetMs,
  STALL_LOADING_MS,
  STALL_MAX_MS,
  STALL_MIN_MS,
  startRun,
  trackRun,
  type RunTrack,
} from '@/lib/runTiming'
import { getBaselinePhaseModel, phaseStepMs, phaseTailMs } from '@/lib/perfBenchmarks'

const MODEL = getBaselinePhaseModel({ steps: 20, precision: 'fp16' })
const SECONDS = 8
const STEP_MS = phaseStepMs(MODEL, SECONDS)
const TAIL_MS = phaseTailMs(MODEL, SECONDS)

const T0 = 1_000_000

function generateRun(): RunTrack {
  return startRun('generate', { at: T0, seconds: SECONDS, totalSteps: 20 })
}

/** Feed `count` steps in at a fixed pace, starting `leadMs` after the run began. */
function withSteps(run: RunTrack, count: number, paceMs: number, leadMs: number): RunTrack {
  let next = run
  for (let step = 1; step <= count; step += 1) {
    next = trackRun(next, { step, total: 20, phase: 'weaving' }, T0 + leadMs + step * paceMs)
  }
  return next
}

describe('trackRun', () => {
  it('times only steps that actually moved forward', () => {
    // The engine repeats the current step on every heartbeat. Timing the
    // repeats would read as "instant" between them and "stalled" across.
    let run = generateRun()
    run = trackRun(run, { step: 1, total: 20, phase: 'weaving' }, T0 + 1_000)
    run = trackRun(run, { step: 1, total: 20, phase: 'weaving' }, T0 + 1_250)
    run = trackRun(run, { step: 2, total: 20, phase: 'weaving' }, T0 + 2_000)
    expect(run.firstStepAt).toBe(T0 + 1_000)
    expect(run.lastStepAt).toBe(T0 + 2_000)
    expect(liveStepMs(run)).toBe(1_000)
  })

  it('starts a run from the fallback when an event arrives first', () => {
    const run = trackRun(null, { step: 3, total: 20, phase: 'weaving' }, T0 + 500, {
      kind: 'generate',
      startedAt: T0,
      seconds: SECONDS,
      totalSteps: 20,
    })
    expect(run.startedAt).toBe(T0)
    expect(run.lastStep).toBe(3)
  })

  it('remembers that a checkpoint swap happened mid-run', () => {
    let run = generateRun()
    expect(run.sawLoading).toBeFalsy()
    run = trackRun(run, { step: 0, total: 20, phase: 'loading' }, T0 + 100)
    run = trackRun(run, { step: 1, total: 20, phase: 'weaving' }, T0 + 9_000)
    expect(run.sawLoading).toBe(true)
  })

  it('opens the tail at the last step, not at the phase event', () => {
    let run = withSteps(generateRun(), 20, 500, 1_000)
    run = trackRun(run, { step: 20, total: 20, phase: 'writing', ratio: 0.95 }, T0 + 12_000)
    expect(run.tailStartedAt).toBe(T0 + 11_000)
  })
})

describe('runMeasurements', () => {
  it('splits a finished run into lead, step and tail', () => {
    // 2s of setup, 20 steps at 500ms, then a 3s decode and write.
    let run = withSteps(generateRun(), 20, 500, 2_000)
    run = trackRun(run, { step: 20, total: 20, phase: 'writing', ratio: 0.95 }, T0 + 12_000)
    const measured = runMeasurements(run, T0 + 15_000)
    expect(measured.stepMs).toBe(500)
    // First step landed at 2500ms and paid for one step of that, so lead is 2s.
    expect(measured.leadMs).toBe(2_000)
    expect(measured.tailMs).toBe(3_000)
  })

  it('reports nothing when no steps were observed', () => {
    expect(runMeasurements(generateRun(), T0 + 10_000)).toEqual({})
  })
})

describe('liveRemainingMs', () => {
  it('uses the stored model before any step lands', () => {
    const remaining = liveRemainingMs(generateRun(), { now: T0, model: MODEL })
    expect(remaining).toBeCloseTo(MODEL.leadMs + 20 * STEP_MS + TAIL_MS, -1)
  })

  it('follows the run when it is slower than the stored model', () => {
    // Twice the modelled per-step cost, held long enough to be trusted.
    const pace = STEP_MS * 2
    const run = withSteps(generateRun(), 8, pace, 0)
    const now = T0 + 8 * pace
    const remaining = liveRemainingMs(run, { now, model: MODEL })!
    const modelled = 12 * STEP_MS + TAIL_MS
    expect(remaining).toBeGreaterThan(modelled * 1.6)
    expect(remaining).toBeCloseTo(12 * pace + TAIL_MS, -3)
  })

  it('follows the run when it is faster than the stored model', () => {
    const pace = STEP_MS / 2
    const run = withSteps(generateRun(), 8, pace, 0)
    const remaining = liveRemainingMs(run, { now: T0 + 8 * pace, model: MODEL })!
    expect(remaining).toBeLessThan(12 * STEP_MS + TAIL_MS)
    expect(remaining).toBeCloseTo(12 * pace + TAIL_MS, -3)
  })

  it('trusts the stored model until a few steps have been seen', () => {
    // One interval is not evidence of a new pace, so an estimate built off it
    // must still sit near the modelled one.
    const run = withSteps(generateRun(), 2, STEP_MS * 4, 0)
    const remaining = liveRemainingMs(run, { now: T0 + 2 * STEP_MS * 4, model: MODEL })!
    const modelled = 18 * STEP_MS + TAIL_MS
    expect(remaining).toBeLessThan(modelled * 1.8)
    expect(remaining).toBeGreaterThan(modelled)
  })

  it('keeps counting down between step events', () => {
    const run = withSteps(generateRun(), 10, 500, 0)
    const atStep = liveRemainingMs(run, { now: T0 + 5_000, model: MODEL })!
    const later = liveRemainingMs(run, { now: T0 + 5_300, model: MODEL })!
    expect(later).toBeLessThan(atStep)
    expect(atStep - later).toBeCloseTo(300, -2)
  })

  it('never credits more than the step in flight while stalled', () => {
    const run = withSteps(generateRun(), 10, 500, 0)
    const stalled = liveRemainingMs(run, { now: T0 + 60_000, model: MODEL })!
    // A stall stops the countdown rather than driving it to zero and past it.
    expect(stalled).toBeGreaterThan(10 * 500 - 500 + TAIL_MS - 1)
  })

  it('prices the decode and write tail on its own', () => {
    let run = withSteps(generateRun(), 20, 500, 0)
    run = trackRun(run, { step: 20, total: 20, phase: 'writing', ratio: 0.95 }, T0 + 10_000)
    const atTailStart = liveRemainingMs(run, { now: T0 + 10_000, model: MODEL })!
    expect(atTailStart).toBeCloseTo(TAIL_MS, -2)
    const halfway = liveRemainingMs(run, { now: T0 + 10_000 + TAIL_MS / 2, model: MODEL })!
    expect(halfway).toBeCloseTo(TAIL_MS / 2, -2)
  })

  it('adds the rest of the queue', () => {
    const run = withSteps(generateRun(), 10, 500, 0)
    const alone = liveRemainingMs(run, { now: T0 + 5_000, model: MODEL })!
    const queued = liveRemainingMs(run, { now: T0 + 5_000, model: MODEL, queueTailMs: 30_000 })!
    expect(queued - alone).toBe(30_000)
  })

  it('extrapolates a model load from its download ratio', () => {
    let run = startRun('load', { at: T0 })
    run = trackRun(run, { ratio: 0.25, phase: 'loading' }, T0 + 10_000)
    // A quarter done after 10s projects 30s left; the stored 40s total agrees,
    // so the blend lands on 30s either way.
    const remaining = liveRemainingMs(run, {
      now: T0 + 10_000,
      historicalTotalMs: 40_000,
    })!
    expect(remaining).toBeCloseTo(30_000, -2)
  })

  it('falls back to the stored total when a load reports no ratio', () => {
    const run = startRun('load', { at: T0 })
    expect(liveRemainingMs(run, { now: T0 + 5_000, historicalTotalMs: 12_000 })).toBe(7_000)
  })

  it('does not price a checkpoint swap as if sampling had started', () => {
    let run = generateRun()
    run = trackRun(run, { step: 0, total: 20, phase: 'loading' }, T0 + 1_000)
    const remaining = liveRemainingMs(run, {
      now: T0 + 1_000,
      model: MODEL,
      historicalTotalMs: 60_000,
    })
    expect(remaining).toBe(59_000)
  })

  it('returns nothing without a run', () => {
    expect(liveRemainingMs(null, { now: T0, model: MODEL })).toBeUndefined()
  })
})

describe('liveRunRatio', () => {
  it('reports real step progress once steps land', () => {
    const run = withSteps(generateRun(), 5, 500, 0)
    expect(liveRunRatio(run)).toBeCloseTo(0.25, 5)
  })

  it('has nothing to report before the first step', () => {
    expect(liveRunRatio(generateRun())).toBeUndefined()
  })

  it('reports a load by its download ratio', () => {
    const run = trackRun(startRun('load', { at: T0 }), { ratio: 0.4 }, T0 + 1_000)
    expect(liveRunRatio(run)).toBe(0.4)
  })
})

describe('stallBudgetMs', () => {
  it('uses a longer budget while the checkpoint is loading', () => {
    expect(stallBudgetMs(1_000, 'loading')).toBe(STALL_LOADING_MS)
  })

  it('clamps 8× the expected step time between 30s and 3 minutes', () => {
    expect(stallBudgetMs(1_000)).toBe(STALL_MIN_MS)
    expect(stallBudgetMs(8_000)).toBe(64_000)
    expect(stallBudgetMs(60_000)).toBe(STALL_MAX_MS)
    expect(stallBudgetMs(undefined)).toBe(64_000)
  })
})
